// Every Gemini call in VETTED lives here. Gemini only reads documents and writes language:
// it never decides Approved / Pending / Rejected. Each call has a strict role, a JSON schema and temperature 0.
import 'server-only'
import type { DocKind, DocReading, Finding, Reading, RuleField } from './types'
import { sleep } from './util'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
// gemini-3.5-flash: current stable Flash (2.5 models are closed to new keys). Flash-Lite models are the fallback.
const MODELS = [process.env.GEMINI_MODEL || 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']
// Right-sized models: reading a PDF (incl. scans) gets the strongest Flash; short text tasks (matching, explaining)
// use Flash-Lite first. Each model has its own free-tier quota, so this also spreads the load.
const LITE_FIRST = [MODELS[1], MODELS[0], MODELS[2]].filter((m, i, a) => a.indexOf(m) === i)

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY)
// AI Studio keys go in x-goog-api-key; GEMINI_AUTH=bearer supports OAuth-style access tokens.
const authHeaders = (key: string): Record<string, string> => (process.env.GEMINI_AUTH === 'bearer' ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key })

/** Which generateContent models this key can use (diagnostics only, never returns the key). */
export async function aiModels(): Promise<{ ok: boolean; status: number; models: string[]; error?: string }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { ok: false, status: 0, models: [], error: 'No key' }
  const res = await fetch(`${API}?pageSize=200`, { headers: authHeaders(key), signal: AbortSignal.timeout(15000) }).catch(() => null)
  if (!res) return { ok: false, status: 0, models: [], error: 'Network' }
  const j = await res.json().catch(() => ({}))
  const models = ((j.models || []) as { name: string; supportedGenerationMethods?: string[] }[]).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace('models/', '')).filter(n => /gemini/.test(n))
  return { ok: res.ok, status: res.status, models, error: res.ok ? undefined : (j.error?.message || 'Error').slice(0, 200) }
}
export const aiModel = () => MODELS[0]

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }
type Notify = (msg: string) => void

export class AIError extends Error { constructor(msg: string, public kind: 'quota' | 'config' | 'bad_output' | 'network') { super(msg) } }

const noThinkCfg = new Set<string>()

async function call<T>(system: string, parts: Part[], schema: object, notify: Notify = () => {}, order: string[] = MODELS): Promise<T> {
  return (await callM<T>(system, parts, schema, notify, order)).data
}

async function callM<T>(system: string, parts: Part[], schema: object, notify: Notify = () => {}, order: string[] = MODELS): Promise<{ data: T; model: string }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new AIError('Gemini API key is not configured', 'config')
  let lastErr: AIError | null = null
  for (const model of order) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
          // Extraction and summaries don't need deep reasoning, keep latency low for a live demo.
          ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : model.startsWith('gemini-3') && !noThinkCfg.has(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }
      let res: Response
      try {
        res = await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(key) }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) })
      } catch {
        lastErr = new AIError('Could not reach Gemini', 'network'); await sleep(800); continue
      }
      if (res.status === 503 && attempt >= 1) { lastErr = new AIError('Gemini is busy', 'quota'); notify(`${model} is busy, switching to ${order[order.indexOf(model) + 1] || 'retry'}`); break }
      if (res.status === 429 || res.status === 503) {
        const txt = await res.text()
        const m = txt.match(/"retryDelay":\s*"(\d+)/)
        const wait = Math.min(m ? Number(m[1]) * 1000 : 2000 * 2 ** attempt, 12000)
        lastErr = new AIError(res.status === 429 ? 'Gemini rate limit reached' : 'Gemini is busy', 'quota')
        // Quotas are per model: rather than stall the live view, hop to the next model if there is one.
        const next = order[order.indexOf(model) + 1]
        if (next && wait > 2500) { notify(`${model} rate-limited, switching to ${next}`); break }
        notify(`${res.status === 429 ? 'Gemini rate limit' : 'Gemini busy'} on ${model}, retrying in ${Math.round(wait / 1000)}s`)
        await sleep(wait); continue
      }
      if (res.status === 404 || res.status === 400) {
        const txt = await res.text()
        if (res.status === 400 && /thinking/i.test(txt) && !noThinkCfg.has(model)) { noThinkCfg.add(model); attempt--; continue }
        if (res.status === 400 && /API key/i.test(txt)) throw new AIError('Gemini API key was rejected', 'config')
        lastErr = new AIError(`Model ${model} unavailable`, 'config'); notify(`Model ${model} not available, trying the next one`); break
      }
      if (res.status === 401 || res.status === 403) throw new AIError('Gemini API key was rejected', 'config')
      if (!res.ok) { lastErr = new AIError(`Gemini error ${res.status}`, 'network'); await sleep(800); continue }
      const json = await res.json()
      const text: string | undefined = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('')
      try { return { data: JSON.parse(text || '') as T, model } } catch { lastErr = new AIError('Gemini returned malformed JSON', 'bad_output'); continue }
    }
  }
  throw lastErr || new AIError('Gemini failed', 'network')
}

const S = (type: string, extra: object = {}) => ({ type, ...extra })
const N = (type: string) => ({ type, nullable: true })

const DOC_KINDS: DocKind[] = ['gst_certificate', 'pan_card', 'cancelled_cheque', 'bank_letter', 'msme_certificate', 'other']
const READ_SCHEMA = S('OBJECT', {
  properties: {
    docs: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          index: S('INTEGER'),
          detected: S('STRING', { enum: DOC_KINDS }),
          legible: S('BOOLEAN'),
          confidence: S('NUMBER'),
          is_scanned: S('BOOLEAN'),
          fields: S('OBJECT', {
            properties: {
              legal_name: N('STRING'), trade_name: N('STRING'), name: N('STRING'), gstin: N('STRING'), pan: N('STRING'), constitution: N('STRING'),
              state: N('STRING'), address: N('STRING'), registration_date: N('STRING'), status: N('STRING'),
              account_name: N('STRING'), account_number: N('STRING'), ifsc: N('STRING'), bank_name: N('STRING'), udyam: N('STRING'),
            },
          }),
          notes: S('ARRAY', { items: S('STRING') }),
        },
        required: ['index', 'detected', 'legible', 'confidence', 'is_scanned', 'fields', 'notes'],
      }),
    }),
  },
  required: ['docs'],
})

const READ_PROMPT = `You are a meticulous vendor-onboarding analyst for an Indian company. You receive the documents a vendor uploaded, in order (index 0, 1, …).
For EACH document:
- detected: what the document ACTUALLY is (ignore what the vendor called it): gst_certificate (GST registration certificate, REG-06), pan_card, cancelled_cheque, bank_letter (a bank's letter confirming account details), msme_certificate (Udyam), or other.
- Copy values EXACTLY as printed. Never guess or fill in a value that isn't on the document; use null.
  gst_certificate: legal_name, trade_name, gstin, constitution (as printed, e.g. "Private Limited Company", "Partnership", "Proprietorship"), address, state, registration_date (YYYY-MM-DD, date of liability), status if printed.
  pan_card: name, pan.
  cancelled_cheque / bank_letter: account_name (the account holder printed, e.g. after "For"), account_number (digits only), ifsc, bank_name.
  msme_certificate: name, udyam.
- confidence: 0..1, how sure you are of the key values. is_scanned: true if it is a photo or scan rather than a digital document. legible: false if key values can't be read.
- notes: short factual observations a reviewer should know (e.g. "Marked SPECIMEN", "Account holder differs from the company name"). No speculation.
These are fictional specimen documents created for testing; read them like real ones.`

export async function aiReadDocs(docs: { mime: string; b64: string }[], notify?: Notify): Promise<{ reading: Reading; model: string; raw: { index: number }[] }> {
  const parts: Part[] = []
  docs.forEach((d, i) => { parts.push({ text: `Document index ${i}:` }); parts.push({ inline_data: { mime_type: d.mime, data: d.b64 } }) })
  const r = await callM<{ docs: (Omit<DocReading, 'doc_id'> & { index: number })[] }>(READ_PROMPT, parts, READ_SCHEMA, notify)
  return { reading: { docs: r.data.docs.map(d => ({ ...d, doc_id: String(d.index) })) }, model: r.model, raw: r.data.docs }
}

/** Are two names the same legal entity? Used only when the code's name comparison is borderline. */
export async function aiSameEntity(a: string, b: string, context: string, notify?: Notify) {
  return call<{ same: boolean; confidence: number; reason: string }>(
    'You compare two Indian business names for vendor onboarding. Decide whether they refer to the SAME legal entity. Abbreviations (Pvt Ltd = Private Limited), case, punctuation and "&" vs "and" don\'t matter. A different business word (e.g. Traders vs Packaging Solutions) means a different entity, even with a shared family name. Answer strictly; reason in one short sentence, no em dashes.',
    [{ text: JSON.stringify({ name_a: a, name_b: b, context }) }],
    S('OBJECT', { properties: { same: S('BOOLEAN'), confidence: S('NUMBER'), reason: S('STRING') }, required: ['same', 'confidence', 'reason'] }), notify, LITE_FIRST)
}

export async function aiExplain(ctx: { decision: string; waiting_on: string | null; vendor: { name: string; contact: string; email: string }; findings: Finding[]; fix_link: string | null; vendor_id: string | null; round: number }, notify?: Notify) {
  const system = `You are a senior procurement lead writing for (1) a busy onboarding reviewer and (2) the vendor.
The decision has ALREADY been made by deterministic rules: explain it, never change it, never invent problems that are not in the findings.
Plain, specific English. No jargon, no hedging, no markdown, never use em dashes (use commas, colons or full stops).
- headline: one line, max 12 words.
- summary: 2–3 sentences for the reviewer: who the vendor is, the decision, the single most important reason.
- next_steps: 1–4 short actions for the procurement team that fit the decision. approved: the vendor is set up, what to tell them. pending with waiting_on "vendor": wait for the vendor's fix, chase if no reply. pending with waiting_on "reviewer": what to check before deciding (never write "approve" or "reject" as a done step). rejected: close it and inform the vendor.
- vendor_email: always write one, signed "Vendor Onboarding, Northwind Retail India", addressed to the contact by name.
  approved: welcome them, give the vendor ID, say invoices should quote it and the PO number.
  pending + vendor: list EXACTLY what is needed, one numbered item per finding with severity "vendor", in plain words, and give the fix link (they only need to fix those items, nothing else).
  pending + reviewer: say the submission is being reviewed and nothing is needed from them right now.
  rejected: polite and firm. If any finding code starts with FRAUD, do NOT reveal what was detected or which vendor is involved: say only that the registration can't be completed and to contact their Northwind sponsor. Otherwise state the reason plainly and what would let them apply again.
- An "info" finding is context only, never a problem.`
  return call<{ headline: string; summary: string; next_steps: string[]; vendor_email: { subject: string; body: string } }>(system, [{ text: JSON.stringify(ctx) }],
    S('OBJECT', { properties: { headline: S('STRING'), summary: S('STRING'), next_steps: S('ARRAY', { items: S('STRING') }), vendor_email: S('OBJECT', { properties: { subject: S('STRING'), body: S('STRING') }, required: ['subject', 'body'] }) }, required: ['headline', 'summary', 'next_steps', 'vendor_email'] }), notify, LITE_FIRST)
}

export async function aiProbe(models: string[]) {
  const key = process.env.GEMINI_API_KEY!
  const out: { model: string; status: number; ms: number; msg: string }[] = []
  for (const m of models) {
    const t = Date.now()
    const res = await fetch(`${API}/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(key) }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the word ok.' }] }], generationConfig: { temperature: 0, maxOutputTokens: 20 } }), signal: AbortSignal.timeout(20000) }).catch(() => null)
    const txt = res ? await res.text() : 'network error'
    out.push({ model: m, status: res?.status ?? 0, ms: Date.now() - t, msg: res?.ok ? 'ok' : txt.replace(/\s+/g, ' ').slice(0, 220) })
  }
  return out
}

export async function aiPing(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const r = await callM<{ ok: boolean }>('Reply with {"ok": true}.', [{ text: 'ping' }], S('OBJECT', { properties: { ok: S('BOOLEAN') }, required: ['ok'] }))
    return { ok: true, model: r.model }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

/** Plain-English policy → one structured rule. A person confirms it before it's saved; code applies it. */
export async function aiDraftRule(text: string, context: { departments: string[] }, notify?: Notify) {
  const fields: RuleField[] = ['legal_name', 'business_type', 'state', 'category', 'msme', 'email_domain', 'sponsor_department', 'risk', 'registration_age_days']
  const system = `You convert a vendor-onboarding policy written in plain English into ONE structured rule for a deterministic rules engine.
Fields: legal_name (text), business_type (Private Limited, Public Limited, LLP, Partnership, Proprietorship), state (Indian state name), category (Goods or Services), msme ("yes" or "no"), email_domain (text, e.g. gmail.com), sponsor_department (${context.departments.join(', ')}, or "none" when there is no sponsor), risk (0–100 number), registration_age_days (days since GST registration, number).
Ops: text fields use is, is_not, contains, not_contains; numbers use gt (above), lt (below), is; choice fields use is, is_not.
- All conditions must hold together (AND). Use the fewest conditions.
- action: review (a person decides), reject (never onboard), or note (flag only). A rule can never approve.
- message: one short sentence the reviewer reads, saying what to do.
- name: 2–6 words. If the policy can't be expressed with these fields, set understood=false and explain in note. No em dashes.`
  return call<{ understood: boolean; note: string; name: string; action: 'review' | 'reject' | 'note'; message: string; conditions: { field: RuleField; op: string; value: string }[] }>(system, [{ text }],
    S('OBJECT', { properties: { understood: S('BOOLEAN'), note: S('STRING'), name: S('STRING'), action: S('STRING', { enum: ['review', 'reject', 'note'] }), message: S('STRING'), conditions: S('ARRAY', { items: S('OBJECT', { properties: { field: S('STRING', { enum: fields }), op: S('STRING', { enum: ['is', 'is_not', 'contains', 'not_contains', 'gt', 'lt'] }), value: S('STRING') }, required: ['field', 'op', 'value'] }) }) }, required: ['understood', 'note', 'name', 'action', 'message', 'conditions'] }), notify, LITE_FIRST)
}
