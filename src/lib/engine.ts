// The VETTED pipeline: ten visible stages from a vendor submission to Approved / Pending / Rejected.
// Design rule: AI reads documents and writes language; deterministic code checks and decides.
import 'server-only'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { BANK_RECORDS, BLOCKLIST, BUYER, CONSTITUTION, FREE_EMAIL, IFSC_SNAPSHOT, PAN_ENTITY, REGISTRY, requiredDocs, VENDORS } from '@/data/master'
import { AIError, aiConfigured, aiExplain, aiReadDocs, aiSameEntity } from './gemini'
import { ruleSentence } from './rules'
import { cachedByFile, sampleById } from './samples'
import type { Store } from './store'
import type { Ask, CustomRule, FixField, Decision, DocKind, DocReading, Finding, Outcome, Run, Settings, Stage, StageKey, StreamEvent, Submission, SubmissionDoc, Vendor } from './types'
import { DOC_LABEL } from './types'
import { daysBetween, gstinChecksumOk, GSTIN_RE, IFSC_RE, last4, normCompany, PAN_RE, PIN_RE, PIN_STATE, similarity, sleep, STATES, uid } from './util'

export const STAGE_DEFS: { key: StageKey; title: string; by: Stage['by']; plain: string }[] = [
  { key: 'intake', title: 'Receive submission', by: 'code', plain: 'Take in the form and documents, fingerprint each file' },
  { key: 'complete', title: 'Completeness', by: 'code', plain: 'Every required field and document for this business type' },
  { key: 'read', title: 'Read documents', by: 'ai', plain: 'Gemini reads GST certificate, PAN, cheque (even scans) and checks each is what it claims' },
  { key: 'format', title: 'Format checks', by: 'code', plain: 'GSTIN check digit, PAN, IFSC, PIN code, email domain' },
  { key: 'cross', title: 'Cross-check', by: 'ai+code', plain: 'Form vs documents: names, PAN inside GSTIN, state, business type' },
  { key: 'verify', title: 'Verify externally', by: 'code', plain: 'GST registry status, IFSC directory, bank account holder (penny drop)' },
  { key: 'fraud', title: 'Fraud & duplicates', by: 'code', plain: 'Bank account or GSTIN already used, blocklist, shared contacts' },
  { key: 'decide', title: 'Decide', by: 'code', plain: 'Apply onboarding policy to every finding, score the risk' },
  { key: 'explain', title: 'Communicate', by: 'ai', plain: 'Reasoning for the reviewer, an exact ask for the vendor' },
  { key: 'record', title: 'Record', by: 'code', plain: 'Vendor master on approval, case timeline, audit trail' },
]
export const freshStages = (): Stage[] => STAGE_DEFS.map(d => ({ key: d.key, title: d.title, by: d.by, status: 'pending', checks: [] }))
export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const DAY = (d = new Date()) => d.toISOString().slice(0, 10)

// ---------------- files ----------------
export function sampleFile(sampleId: string, file: string): Buffer | null {
  if (!/^v\d\d$/.test(sampleId) || !/^[a-z_]+\.(pdf|png|jpg)$/.test(file)) return null
  try { return readFileSync(path.join(process.cwd(), 'public', 'samples', sampleId, file)) } catch { return null }
}
/** Bytes of a submitted document: uploads live in the store (content-addressed), sample documents ship with the app. */
export async function docBytes(st: Store, run: Pick<Run, 'sample_id'>, d: SubmissionDoc): Promise<Buffer | null> {
  if (run.sample_id) { const b = sampleFile(run.sample_id, d.file_name); if (b && sha256(b) === d.sha) return b }
  const b64 = await st.getFile('f_' + d.sha)
  return b64 ? Buffer.from(b64, 'base64') : null
}

export function sampleSubmission(sampleId: string): Submission | null {
  const s = sampleById(sampleId); if (!s) return null
  const documents: SubmissionDoc[] = []
  for (const d of s.docs) { const b = sampleFile(s.id, d.file); if (!b) return null; documents.push({ id: d.id, declared: d.declared, file_name: d.file, mime: d.mime, sha: sha256(b), bytes: b.length }) }
  return { ...structuredClone(s.submission), documents }
}

export function newRun(o: { submission: Submission; source: Run['source']; sample_id: string | null; case_id?: string; round?: number; previous_run?: string | null; changes?: string[] }): Run {
  return {
    id: uid('r_'), case_id: o.case_id || uid('c_'), round: o.round || 1, created_at: new Date().toISOString(), source: o.source, sample_id: o.sample_id,
    submission: o.submission, status: 'queued', stages: freshStages(), reading: null, reading_source: null, reading_model: null, decision: null, final_decision: null,
    duration_ms: null, error: null, review: null, superseded_by: null, previous_run: o.previous_run || null, changes: o.changes || [], outcome: null, settings_snapshot: null,
  }
}

// ---------------- pipeline ----------------
type Ctx = {
  run: Run; sub: Submission; settings: Settings; store: Store; emit: (e: StreamEvent) => void; fast: boolean
  findings: Finding[]; reads: Map<string, DocReading>; byKind: Partial<Record<DocKind, DocReading>>
  vendors: Vendor[]; risk: { why: string; points: number }[]; registryAge: number | null; panName: string | null
}
const STAGE_PACE_MS = 260

export async function runPipeline(run: Run, st: Store, emit: (e: StreamEvent) => void, opts: { fast?: boolean } = {}): Promise<Run> {
  const t0 = Date.now()
  const settings = await st.getSettings()
  run.settings_snapshot = settings; run.stages = freshStages(); run.status = 'running'
  const ctx: Ctx = { run, sub: run.submission, settings, store: st, emit, fast: !!opts.fast, findings: [], reads: new Map(), byKind: {}, vendors: [...VENDORS, ...(await st.listVendors()).filter(v => v.onboarded?.case_id !== run.case_id)], risk: [], registryAge: null, panName: null }
  const pace = opts.fast ? 80 : STAGE_PACE_MS
  const stage = async (key: StageKey, fn: (s: Stage) => Promise<void> | void) => {
    const s = run.stages.find(x => x.key === key)!
    s.status = 'running'; emit({ type: 'stage', stage: s })
    const t = Date.now()
    try { await fn(s) } catch (e) {
      s.status = 'fail'; s.summary = (e as Error).message
      s.checks.push({ label: 'Stage error', status: 'fail', detail: (e as Error).message })
      ctx.findings.push({ code: 'SYS-' + key.toUpperCase(), severity: 'review', stage: key, title: 'Could not complete ' + s.title.toLowerCase(), detail: (e as Error).message })
    }
    if (s.status === 'running') s.status = s.checks.some(c => c.status === 'fail') ? 'fail' : s.checks.some(c => c.status === 'warn') ? 'warn' : 'pass'
    s.ms = Date.now() - t
    emit({ type: 'stage', stage: s }); await st.saveRun(run); await sleep(pace)
  }

  await stage('intake', s => intake(ctx, s))
  await stage('complete', s => completeness(ctx, s))
  await stage('read', s => readDocs(ctx, s))
  await stage('format', s => formatChecks(ctx, s))
  await stage('cross', s => crossCheck(ctx, s))
  await stage('verify', s => verify(ctx, s))
  await stage('fraud', s => fraud(ctx, s))
  let res: { decision: Decision; waiting_on: Outcome['waiting_on']; risk: number } = { decision: 'pending', waiting_on: 'reviewer', risk: 0 }
  await stage('decide', s => { res = decide(ctx, s) })
  let outcome: Outcome | null = null
  await stage('explain', async s => { outcome = await explain(ctx, s, res) })
  await stage('record', s => record(ctx, s, outcome!, t0))

  run.outcome = outcome; run.decision = res.decision
  run.final_decision = res.decision === 'pending' ? null : res.decision
  run.status = 'done'; run.duration_ms = Date.now() - t0
  await st.saveRun(run)
  return run
}

const F = (ctx: Ctx, f: Finding) => { ctx.findings.push(f) }
const ask = {
  doc: (doc: DocKind, text: string): Ask => ({ kind: 'document', doc, text }),
  field: (field: Extract<Ask, { kind: 'field' }>['field'], text: string): Ask => ({ kind: 'field', field, text }),
}

// ---------------- 1. intake ----------------
async function intake(ctx: Ctx, s: Stage) {
  const { sub, run } = ctx
  s.checks.push({ label: 'Submission received', status: 'pass', detail: `${sub.legal_name} · ${run.source === 'portal' ? 'vendor portal' : run.source === 'resubmission' ? `round ${run.round} via fix link` : run.source === 'rerun' ? 're-run with current rules' : 'onboarding inbox'}` })
  for (const d of sub.documents) s.checks.push({ label: `Document: ${d.file_name}`, status: 'pass', detail: `Uploaded as ${DOC_LABEL[d.declared].toLowerCase()} · ${Math.max(1, Math.round(d.bytes / 1024))} KB · SHA-256 ${d.sha.slice(0, 10)}…` })
  if (run.round > 1) s.checks.push({ label: `Round ${run.round}`, status: 'info', detail: run.changes.length ? 'Changed since last round: ' + run.changes.join('; ') : 'Re-check of the same submission' })
  s.summary = `${sub.documents.length} document${sub.documents.length === 1 ? '' : 's'} received${run.round > 1 ? `, round ${run.round}` : ''}`
}

// ---------------- 2. completeness ----------------
function completeness(ctx: Ctx, s: Stage) {
  const { sub, settings } = ctx
  const fields: [string, unknown, FixField | null][] = [
    ['Legal name', sub.legal_name, 'legal_name'], ['GSTIN', sub.gstin, 'gstin'], ['PAN', sub.pan, 'pan'], ['Address and PIN', sub.address?.line && sub.address?.pin, 'address'],
    ['Contact email', sub.contact?.email, 'email'], ['Bank account and IFSC', sub.bank?.account_number && sub.bank?.ifsc, 'bank'],
  ]
  const missing = fields.filter(([, v]) => !v)
  s.checks.push({ label: 'Required fields', status: missing.length ? 'fail' : 'pass', detail: missing.length ? 'Missing: ' + missing.map(m => m[0]).join(', ') : 'All present' })
  for (const [label, , field] of missing) F(ctx, { code: 'CMP-FIELD', severity: 'vendor', stage: 'complete', title: `${label} is missing`, detail: `The form has no ${label.toLowerCase()}.`, ask: field ? ask.field(field, `Enter your ${label.toLowerCase()}`) : null })
  if (sub.msme && !sub.udyam) F(ctx, { code: 'CMP-UDYAM', severity: 'vendor', stage: 'complete', title: 'MSME declared without a Udyam number', detail: 'MSME vendors get 45-day payment protection, so the Udyam registration number is needed.', ask: ask.field('udyam', 'Enter your Udyam registration number (UDYAM-XX-00-0000000)') })
  const declared = new Set(sub.documents.map(d => d.declared))
  for (const r of requiredDocs(sub, settings)) {
    const ok = r.kind === 'bank_proof' ? declared.has('cancelled_cheque') || declared.has('bank_letter') : declared.has(r.kind)
    s.checks.push({ label: r.label, status: ok ? 'pass' : 'fail', detail: ok ? 'Uploaded' : 'Not uploaded' })
    if (!ok) F(ctx, { code: 'CMP-DOC', severity: 'vendor', stage: 'complete', title: `${r.label} not uploaded`, detail: `A ${r.label.toLowerCase()} is required for a ${sub.business_type.toLowerCase()}.`, ask: ask.doc(r.kind === 'bank_proof' ? 'cancelled_cheque' : r.kind, `Upload your ${r.label.toLowerCase()}`) })
  }
  if (settings.requireSponsor || sub.sponsor) s.checks.push({ label: 'Northwind sponsor', status: sub.sponsor ? 'pass' : settings.requireSponsor ? 'fail' : 'warn', detail: sub.sponsor ? `${sub.sponsor.name}, ${sub.sponsor.department}` : 'Nobody at Northwind named as requesting this vendor' })
  else s.checks.push({ label: 'Northwind sponsor', status: 'warn', detail: 'Nobody at Northwind named as requesting this vendor' })
  if (!sub.sponsor) { if (settings.requireSponsor) F(ctx, { code: 'CMP-SPONSOR', severity: 'review', stage: 'complete', title: 'No Northwind sponsor named', detail: 'Policy requires a Northwind employee to sponsor every new vendor.' }); else ctx.risk.push({ why: 'No Northwind sponsor', points: 20 }) }
  s.summary = missing.length || ctx.findings.some(f => f.stage === 'complete') ? 'Something required is missing' : 'Everything required is here'
}

// ---------------- 3. read documents (AI) ----------------
async function readDocs(ctx: Ctx, s: Stage) {
  const { run, sub, store: st, settings, emit } = ctx
  const notify = (m: string) => emit({ type: 'notice', message: m })
  const todo: SubmissionDoc[] = []
  let source: 'ai' | 'cached' | 'reused' = 'reused'
  for (const d of sub.documents) {
    const prev = await st.getReading(d.sha)
    if (prev) ctx.reads.set(d.id, { ...prev.data, doc_id: d.id }); else todo.push(d)
  }
  if (todo.length) {
    const bufs = await Promise.all(todo.map(d => docBytes(st, run, d)))
    if (bufs.some(b => !b)) throw new Error('A document file is missing')
    let done = false
    if (aiConfigured()) {
      try {
        const r = await aiReadDocs(todo.map((d, i) => ({ mime: d.mime, b64: bufs[i]!.toString('base64') })), notify)
        todo.forEach((d, i) => { const x = r.reading.docs.find(z => Number(z.doc_id) === i) || r.reading.docs[i]; if (x) { const dr = { ...x, doc_id: d.id }; ctx.reads.set(d.id, dr); st.saveReading(d.sha, dr, r.model).catch(() => {}) } })
        run.reading_model = r.model; source = 'ai'; done = true
      } catch (e) { notify(`Live AI unavailable (${(e as AIError).message})`) }
    }
    if (!done) {
      const cached = run.sample_id && settings.useCachedReadings ? await Promise.all(todo.map(async (d, i) => { const ref = sampleFile(run.sample_id!, d.file_name); return ref && sha256(ref) === sha256(bufs[i]!) ? cachedByFile(run.sample_id!, d.file_name) : null })) : []
      if (cached.length === todo.length && cached.every(Boolean)) { todo.forEach((d, i) => ctx.reads.set(d.id, { ...cached[i]!, doc_id: d.id })); source = 'cached' }
      else throw new Error('Documents could not be read: live AI is unavailable and there is no saved reading for these files')
    }
  }
  run.reading = { docs: sub.documents.map(d => ctx.reads.get(d.id)!).filter(Boolean) }; run.reading_source = source
  emit({ type: 'reading', reading: run.reading, source })

  for (const d of sub.documents) {
    const r = ctx.reads.get(d.id)!
    const fieldsTxt = Object.entries(r.fields).filter(([, v]) => v).slice(0, 4).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')
    const kindOk = r.detected === d.declared || (d.declared === 'cancelled_cheque' && r.detected === 'bank_letter') || (d.declared === 'bank_letter' && r.detected === 'cancelled_cheque')
    s.checks.push({ label: `${DOC_LABEL[d.declared]}${r.is_scanned ? ' (scan)' : ''}`, status: !kindOk || !r.legible ? 'fail' : r.confidence < settings.minConfidence ? 'warn' : 'pass', detail: !kindOk ? `This file is a ${DOC_LABEL[r.detected].toLowerCase()}, not a ${DOC_LABEL[d.declared].toLowerCase()}` : `${Math.round(r.confidence * 100)}% confident · ${fieldsTxt}` })
    if (!kindOk) F(ctx, { code: 'DOC-WRONG', severity: 'vendor', stage: 'read', title: `Wrong document uploaded as ${DOC_LABEL[d.declared].toLowerCase()}`, detail: `"${d.file_name}" is a ${DOC_LABEL[r.detected].toLowerCase()}. The ${DOC_LABEL[d.declared].toLowerCase()} is still needed.`, ask: ask.doc(d.declared, `Upload your ${DOC_LABEL[d.declared].toLowerCase()} (the file you sent is a ${DOC_LABEL[r.detected].toLowerCase()})`) })
    else if (!r.legible) F(ctx, { code: 'DOC-ILLEGIBLE', severity: 'vendor', stage: 'read', title: `${DOC_LABEL[d.declared]} can't be read`, detail: 'Key values on the document are not legible.', ask: ask.doc(d.declared, `Upload a clearer copy of your ${DOC_LABEL[d.declared].toLowerCase()}`) })
    else if (r.confidence < settings.minConfidence) F(ctx, { code: 'DOC-LOWCONF', severity: 'review', stage: 'read', title: `Low-confidence reading: ${DOC_LABEL[d.declared].toLowerCase()}`, detail: `AI is ${Math.round(r.confidence * 100)}% sure of what it read (policy minimum ${Math.round(settings.minConfidence * 100)}%). A person should confirm it against the file.` })
    if (kindOk && !ctx.byKind[r.detected]) ctx.byKind[r.detected] = r
    else if (!kindOk && !ctx.byKind[r.detected]) ctx.byKind[r.detected] = r
  }
  // A PAN uploaded in the wrong slot still counts as the PAN, but a cheque is still missing.
  if (!ctx.byKind.cancelled_cheque && ctx.byKind.bank_letter) ctx.byKind.cancelled_cheque = ctx.byKind.bank_letter
  await evidenceCheck(ctx, s)
  s.summary = `${sub.documents.length} documents read${source === 'reused' ? ' (same files as before, earlier reading reused)' : source === 'cached' ? ' (saved reading)' : ''}`
}

/** Digital PDFs: the values AI read must literally appear in the file's text layer, so AI can't invent them. */
async function evidenceCheck(ctx: Ctx, s: Stage) {
  const d = ctx.sub.documents.find(x => x.declared === 'gst_certificate' && x.mime === 'application/pdf')
  const r = d && ctx.reads.get(d.id)
  if (!d || !r?.fields.gstin) return
  const buf = await docBytes(ctx.store, ctx.run, d); if (!buf) return
  let text = ''
  try { const { extractText, getDocumentProxy } = await import('unpdf'); text = String((await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text || '') } catch { /* scanned or unreadable */ }
  if (!text.trim()) return
  const flat = text.toUpperCase().replace(/\s+/g, ' ')
  const vals: [string, string | null | undefined][] = [['GSTIN', r.fields.gstin], ['legal name', r.fields.legal_name]]
  const missing = vals.filter(([, v]) => v && !flat.includes(String(v).toUpperCase().replace(/\s+/g, ' ')))
  s.checks.push({ label: 'Evidence check (GST certificate text layer)', status: missing.length ? 'warn' : 'pass', detail: missing.length ? `Not found in the document text: ${missing.map(m => m[0]).join(', ')}` : 'GSTIN and legal name found word for word in the PDF' })
  if (missing.length) F(ctx, { code: 'DOC-EVIDENCE', severity: 'review', stage: 'read', title: 'AI reading not confirmed by the document text', detail: `${missing.map(m => m[0]).join(' and ')} as read by AI could not be found in the PDF's text. A person should check the file.` })
}

// ---------------- 4. format checks ----------------
function formatChecks(ctx: Ctx, s: Stage) {
  const { sub, settings } = ctx
  const g = (sub.gstin || '').toUpperCase().replace(/\s/g, ''), p = (sub.pan || '').toUpperCase(), ifsc = (sub.bank?.ifsc || '').toUpperCase()
  const gOk = GSTIN_RE.test(g) && gstinChecksumOk(g)
  s.checks.push({ label: 'GSTIN format and check digit', status: gOk ? 'pass' : 'fail', detail: gOk ? `${g} · ${STATES[g.slice(0, 2)] || 'state ' + g.slice(0, 2)}` : !GSTIN_RE.test(g) ? `"${g}" is not a valid GSTIN format` : `${g} fails its check digit: mistyped or not genuine` })
  if (!gOk) F(ctx, { code: 'FMT-GSTIN', severity: 'vendor', stage: 'format', title: 'GSTIN is not valid', detail: !GSTIN_RE.test(g) ? 'The GSTIN on the form is not in the 15-character format.' : 'The GSTIN on the form fails the GST check digit, so it is mistyped or not genuine.', ask: ask.field('gstin', 'Re-enter your GSTIN exactly as on your GST certificate') })
  const pOk = PAN_RE.test(p)
  s.checks.push({ label: 'PAN format', status: pOk ? 'pass' : 'fail', detail: pOk ? `${p} · holder type: ${PAN_ENTITY[p[3]]?.label || p[3]}` : `"${p}" is not a valid PAN` })
  if (!pOk) F(ctx, { code: 'FMT-PAN', severity: 'vendor', stage: 'format', title: 'PAN is not valid', detail: 'The PAN on the form is not in the 10-character format.', ask: ask.field('pan', 'Re-enter your PAN exactly as on your PAN card') })
  const iOk = IFSC_RE.test(ifsc)
  s.checks.push({ label: 'IFSC format', status: iOk ? 'pass' : 'fail', detail: iOk ? ifsc : `"${ifsc}" is not an 11-character IFSC` })
  if (!iOk) F(ctx, { code: 'FMT-IFSC', severity: 'vendor', stage: 'format', title: 'IFSC is not valid', detail: 'The IFSC must be 11 characters, e.g. HDFC0001234.', ask: ask.field('bank', 'Re-enter your bank account number and IFSC') })
  const pin = sub.address?.pin || ''; const pinStates = PIN_STATE[pin.slice(0, 2)]
  const pinOk = PIN_RE.test(pin) && (!pinStates || pinStates.includes(sub.address.state))
  s.checks.push({ label: 'PIN code', status: pinOk ? 'pass' : 'warn', detail: !PIN_RE.test(pin) ? `"${pin}" is not a 6-digit PIN` : pinOk ? `${pin} · ${sub.address.city}, ${sub.address.state}` : `${pin} belongs to ${pinStates!.join(' / ')}, not ${sub.address.state}` })
  if (!pinOk) ctx.risk.push({ why: 'PIN code does not match the state', points: 15 })
  const dom = (sub.contact?.email || '').split('@')[1]?.toLowerCase() || ''
  const free = FREE_EMAIL.includes(dom)
  s.checks.push({ label: 'Email domain', status: free ? 'warn' : 'pass', detail: free ? `${dom} is a free webmail address, not a company domain` : dom || 'none' })
  if (free) { ctx.risk.push({ why: 'Free webmail address', points: 15 }); F(ctx, { code: 'FMT-FREEMAIL', severity: settings.freeEmailAction === 'review' ? 'review' : 'info', stage: 'format', title: 'Contact uses a free webmail address', detail: `${sub.contact.email} is not on a company domain. Common for small businesses, but a weaker identity signal.` }) }
  s.summary = gOk && pOk && iOk ? 'Identifiers are well-formed' : 'Some identifiers are malformed'
}

// ---------------- 5. cross-check ----------------
const nm = (a?: string | null, b?: string | null) => (a && b ? similarity(normCompany(a), normCompany(b)) : 0)
async function sameName(ctx: Ctx, a: string, b: string, context: string): Promise<{ same: boolean; how: string }> {
  const sc = nm(a, b)
  if (sc >= ctx.settings.nameMatchStrict) return { same: true, how: `${Math.round(sc * 100)}% match` }
  if (sc < 0.34 || !aiConfigured()) return { same: false, how: `${Math.round(sc * 100)}% match` }
  try { const r = await aiSameEntity(a, b, context); return { same: r.same && r.confidence >= 0.8, how: `AI: ${r.reason}` } } catch { return { same: false, how: `${Math.round(sc * 100)}% match` } }
}

async function crossCheck(ctx: Ctx, s: Stage) {
  const { sub } = ctx
  const gst = ctx.byKind.gst_certificate?.fields, pan = ctx.byKind.pan_card?.fields, chq = ctx.byKind.cancelled_cheque?.fields
  const g = sub.gstin.toUpperCase(), p = sub.pan.toUpperCase()
  ctx.panName = pan?.name || null
  // PAN inside GSTIN
  const embedded = g.slice(2, 12)
  const panIn = embedded === p
  s.checks.push({ label: 'PAN inside the GSTIN', status: panIn ? 'pass' : 'fail', detail: panIn ? `${g.slice(0, 2)}·${embedded}·${g.slice(12)}` : `GSTIN carries PAN ${embedded}, but the vendor's PAN is ${p}` })
  if (!panIn && GSTIN_RE.test(g) && PAN_RE.test(p)) F(ctx, { code: 'XCK-PAN-GSTIN', severity: 'reject', stage: 'cross', title: 'GSTIN belongs to a different PAN', detail: `A GSTIN is built from the holder's PAN. This GSTIN carries PAN ${embedded}, not the vendor's PAN ${p}, so it is registered to a different taxpayer.` })
  // GSTIN state vs address
  const gState = STATES[g.slice(0, 2)]
  const stOk = !gState || gState === sub.address.state
  s.checks.push({ label: 'GST state vs address', status: stOk ? 'pass' : 'fail', detail: stOk ? `${gState || g.slice(0, 2)} on both` : `GSTIN is registered in ${gState}, address is in ${sub.address.state}` })
  if (!stOk) F(ctx, { code: 'XCK-STATE', severity: 'vendor', stage: 'cross', title: 'GSTIN state differs from the address', detail: `The GSTIN is registered in ${gState} but the address given is in ${sub.address.state}. Each state needs its own GSTIN.`, ask: ask.field('gstin', `Give the GSTIN registered in ${sub.address.state}, or correct the address`) })
  // Documents vs form
  if (gst) {
    const gstNo = (gst.gstin || '').toUpperCase()
    s.checks.push({ label: 'GSTIN on certificate', status: gstNo === g ? 'pass' : 'fail', detail: gstNo === g ? 'Matches the form' : `Certificate shows ${gstNo || 'no GSTIN'}, form says ${g}` })
    if (gstNo && gstNo !== g) F(ctx, { code: 'XCK-GSTCERT', severity: 'vendor', stage: 'cross', title: 'GST certificate is for a different GSTIN', detail: `The certificate shows ${gstNo}; the form says ${g}.`, ask: ask.doc('gst_certificate', `Upload the GST certificate for ${g}`) })
    const names = [gst.legal_name, gst.trade_name].filter(Boolean) as string[]
    const m = await Promise.all(names.map(n => sameName(ctx, sub.legal_name, n, 'vendor form legal name vs GST certificate')))
    const hit = m.findIndex(x => x.same)
    const tradeOnly = hit === 1 && names[0] !== names[1]
    const altTrade = sub.trade_name ? (await sameName(ctx, sub.trade_name, gst.trade_name || '', 'trade name on form vs GST certificate')).same : false
    s.checks.push({ label: 'Name on GST certificate', status: hit >= 0 || (sub.business_type === 'Proprietorship' && altTrade) ? (tradeOnly ? 'warn' : 'pass') : 'fail', detail: `${gst.legal_name}${gst.trade_name && gst.trade_name !== gst.legal_name ? ` (trade name ${gst.trade_name})` : ''} · ${m.map(x => x.how).join(' / ')}` })
    if (hit < 0 && !(sub.business_type === 'Proprietorship' && altTrade)) F(ctx, { code: 'XCK-NAME-GST', severity: panIn ? 'vendor' : 'reject', stage: 'cross', title: 'Name on the GST certificate is a different business', detail: `The certificate is for ${gst.legal_name}, not ${sub.legal_name}.`, ask: panIn ? ask.field('legal_name', 'Correct your legal name to match your GST certificate') : null })
    if (sub.trade_name && altTrade) F(ctx, { code: 'XCK-TRADENAME', severity: 'info', stage: 'cross', title: `Trades as ${sub.trade_name}`, detail: `GST lists ${gst.trade_name} as the trade name of ${gst.legal_name}. Invoices may arrive under either name; both are recorded on the vendor.` })
    // Business type: form vs GST constitution vs PAN 4th character
    const cons = CONSTITUTION[(gst.constitution || '').toLowerCase().trim()]
    const panType = PAN_ENTITY[p[3]]
    const panFits = !panType || panType.fits.includes(sub.business_type)
    const consFits = !cons || cons === sub.business_type
    s.checks.push({ label: 'Business type', status: panFits && consFits ? 'pass' : 'fail', detail: `Form: ${sub.business_type} · GST: ${gst.constitution || 'n/a'} · PAN holder type: ${panType?.label || p[3]}` })
    if (!(panFits && consFits)) F(ctx, { code: 'XCK-BIZTYPE', severity: 'vendor', stage: 'cross', title: `Declared as ${sub.business_type}, but PAN and GST say ${cons || panType?.label}`, detail: `The PAN's 4th character (${p[3]}) means ${panType?.label || 'another holder type'} and the GST certificate says ${gst.constitution}. The contract, TDS rate and documents needed all depend on the real business type.`, ask: ask.field('business_type', `Confirm your business type (your PAN and GST registration say ${cons || panType?.label})`) })
  }
  if (pan) {
    const pNo = (pan.pan || '').toUpperCase()
    s.checks.push({ label: 'PAN on PAN card', status: pNo === p ? 'pass' : 'fail', detail: pNo === p ? 'Matches the form' : `Card shows ${pNo || 'no PAN'}, form says ${p}` })
    if (pNo && pNo !== p) F(ctx, { code: 'XCK-PANCARD', severity: 'vendor', stage: 'cross', title: 'PAN card is for a different PAN', detail: `The card shows ${pNo}; the form says ${p}.`, ask: ask.doc('pan_card', `Upload the PAN card for ${p}`) })
  }
  if (chq) {
    const acc = (chq.account_number || '').replace(/\D/g, ''), fAcc = sub.bank.account_number.replace(/\D/g, '')
    const accOk = acc === fAcc, ifOk = !chq.ifsc || chq.ifsc.toUpperCase() === sub.bank.ifsc.toUpperCase()
    s.checks.push({ label: 'Account on cheque', status: accOk && ifOk ? 'pass' : 'fail', detail: accOk && ifOk ? `${last4(acc)} · ${chq.ifsc || ''}, matches the form` : `Cheque: ${last4(acc)} ${chq.ifsc || ''} · form: ${last4(fAcc)} ${sub.bank.ifsc}` })
    if (!(accOk && ifOk)) F(ctx, { code: 'XCK-CHEQUE', severity: 'vendor', stage: 'cross', title: 'Cancelled cheque is for a different account', detail: 'The account number or IFSC on the cheque does not match the bank details on the form.', ask: ask.doc('cancelled_cheque', 'Upload a cancelled cheque for the account given on the form') })
  }
  s.summary = ctx.findings.some(f => f.stage === 'cross' && f.severity !== 'info') ? 'The form and documents disagree' : 'Form and documents agree'
}

// ---------------- 6. external verification ----------------
async function ifscLookup(ifsc: string, live: boolean): Promise<{ found: boolean; bank?: string; branch?: string; city?: string; state?: string; source: 'live' | 'snapshot' | 'none' }> {
  if (live) {
    try {
      const r = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
      if (r.status === 404) return { found: false, source: 'live' }
      if (r.ok) { const j = await r.json(); return { found: true, bank: j.BANK, branch: j.BRANCH, city: j.CITY, state: j.STATE, source: 'live' } }
    } catch { /* fall back to the snapshot */ }
  }
  const s = IFSC_SNAPSHOT[ifsc]
  return s ? { found: true, ...s, source: 'snapshot' } : { found: false, source: 'none' }
}

async function verify(ctx: Ctx, s: Stage) {
  const { sub, settings } = ctx
  const g = sub.gstin.toUpperCase()
  const reg = REGISTRY[g]
  if (!reg) {
    s.checks.push({ label: 'GST registry', status: 'warn', detail: `No record for ${g} in the simulated registry. In production this is a live GST lookup.` })
    if (GSTIN_RE.test(g)) F(ctx, { code: 'VER-GST-UNKNOWN', severity: 'review', stage: 'verify', title: 'GSTIN could not be verified', detail: 'The GSTIN is well-formed but has no record in the registry lookup, so a person should check it on the GST portal.' })
  } else {
    const active = reg.status === 'Active'
    s.checks.push({ label: 'GST registry status', status: active ? 'pass' : 'fail', detail: `${reg.status}${reg.cancellation_date ? ` since ${reg.cancellation_date}` : ''} · ${reg.legal_name} · ${reg.constitution} · registered ${reg.registration_date} (simulated registry)` })
    if (!active) F(ctx, { code: 'VER-GST-INACTIVE', severity: 'reject', stage: 'verify', title: `GST registration is ${reg.status.toLowerCase()}`, detail: `The registry shows ${g} as ${reg.status.toLowerCase()}${reg.cancellation_date ? ` since ${reg.cancellation_date}` : ''}. Invoices from a cancelled GSTIN give no input tax credit. The certificate sent is out of date.` })
    const regName = await sameName(ctx, sub.legal_name, reg.legal_name, 'vendor legal name vs GST registry')
    const tradeName = reg.trade_name ? await sameName(ctx, sub.trade_name || sub.legal_name, reg.trade_name, 'trade name vs GST registry') : { same: false, how: '' }
    s.checks.push({ label: 'Legal name in registry', status: regName.same || tradeName.same ? 'pass' : 'fail', detail: `${reg.legal_name} · ${regName.how}` })
    if (!regName.same && !tradeName.same && !ctx.findings.some(f => f.code === 'XCK-NAME-GST')) F(ctx, { code: 'VER-GST-NAME', severity: 'reject', stage: 'verify', title: 'GSTIN is registered to a different business', detail: `The registry lists ${g} under ${reg.legal_name}, not ${sub.legal_name}.` })
    ctx.registryAge = daysBetween(reg.registration_date, DAY())
    const young = ctx.registryAge < settings.newRegistrationDays
    s.checks.push({ label: 'Registration age', status: young ? 'warn' : 'pass', detail: `${ctx.registryAge} days (policy flags under ${settings.newRegistrationDays})` })
    if (young) { ctx.risk.push({ why: `GST registered only ${ctx.registryAge} days ago`, points: 25 }); F(ctx, { code: 'VER-GST-NEW', severity: 'info', stage: 'verify', title: `GST registration is ${ctx.registryAge} days old`, detail: 'Brand-new registrations are a common pattern in fake-vendor fraud. Not a problem on its own.' }) }
  }
  const ifsc = sub.bank.ifsc.toUpperCase()
  if (IFSC_RE.test(ifsc)) {
    const i = await ifscLookup(ifsc, settings.liveIfsc)
    s.checks.push({ label: `IFSC directory${i.source === 'live' ? ' (live lookup)' : i.source === 'snapshot' ? ' (saved snapshot)' : ''}`, status: i.found ? 'pass' : 'fail', detail: i.found ? `${i.bank}, ${i.branch}, ${i.city}` : `${ifsc} is not a real branch code` })
    if (!i.found) F(ctx, { code: 'VER-IFSC', severity: 'vendor', stage: 'verify', title: 'IFSC does not exist', detail: `${ifsc} is not a branch code in the IFSC directory.`, ask: ask.field('bank', 'Re-enter your IFSC (it is printed on your cheque book)') })
  }
  // Penny drop: ₹1 to the account, the bank returns the holder's name.
  const acc = sub.bank.account_number.replace(/\D/g, '')
  const pd = BANK_RECORDS[acc]
  if (!pd) {
    s.checks.push({ label: 'Account holder (penny drop)', status: 'warn', detail: 'No response for this account in the simulated bank. In production this is a ₹1 test credit.' })
    F(ctx, { code: 'VER-BANK-UNKNOWN', severity: 'review', stage: 'verify', title: 'Bank account could not be verified', detail: 'The penny-drop check returned no account holder, so a person should verify the account with the bank letter.' })
  } else {
    const candidates = [sub.legal_name, sub.trade_name, sub.business_type === 'Proprietorship' ? ctx.panName : null].filter(Boolean) as string[]
    const res = await Promise.all(candidates.map(c => sameName(ctx, c, pd.holder, 'vendor name vs bank account holder name')))
    const i = res.findIndex(r => r.same)
    const viaOwner = i >= 0 && candidates[i] === ctx.panName && candidates[i] !== sub.legal_name
    s.checks.push({ label: 'Account holder (penny drop)', status: i >= 0 ? (viaOwner ? 'warn' : 'pass') : 'fail', detail: `Bank says: ${pd.holder} · ${i >= 0 ? res[i].how + (viaOwner ? ', the proprietor\'s own name' : '') : 'does not match ' + sub.legal_name} (simulated bank)` })
    if (i < 0) F(ctx, { code: 'VER-BANK-NAME', severity: 'vendor', stage: 'verify', title: 'Bank account is not in the vendor\'s name', detail: `The bank reports the account holder as ${pd.holder}, not ${sub.legal_name}. Payments must go to an account in the vendor's own name.`, ask: ask.doc('cancelled_cheque', `Give an account held in the name of ${sub.legal_name}, with a cancelled cheque or bank letter for it`) })
    if (viaOwner) F(ctx, { code: 'VER-BANK-OWNER', severity: 'info', stage: 'verify', title: 'Account in the proprietor\'s own name', detail: `${pd.holder} is the proprietor named on the PAN card. Normal for a sole proprietorship, which has no separate legal identity.` })
  }
  s.summary = ctx.findings.some(f => f.stage === 'verify' && f.severity !== 'info') ? 'External checks raised issues' : 'GST, IFSC and bank account verified'
}

// ---------------- 7. fraud & duplicates ----------------
function fraud(ctx: Ctx, s: Stage) {
  const { sub, settings, vendors } = ctx
  const acc = sub.bank.account_number.replace(/\D/g, ''), g = sub.gstin.toUpperCase(), p = sub.pan.toUpperCase()
  const bankOwner = vendors.find(v => v.bank.account_number === acc)
  s.checks.push({ label: 'Bank account used by another vendor', status: bankOwner ? 'fail' : 'pass', detail: bankOwner ? `Already on file for ${bankOwner.name} (${bankOwner.id})` : `Checked against ${vendors.length} vendors` })
  if (bankOwner) F(ctx, { code: 'FRAUD-SHARED-BANK', severity: settings.sharedBankAction, stage: 'fraud', title: `Bank account belongs to ${bankOwner.name}`, detail: `This account is already the payment account of approved vendor ${bankOwner.id} ${bankOwner.name}. A new vendor sharing it is the classic set-up for diverting payments. Do not tell the vendor which vendor matched.` })
  const gOwner = vendors.find(v => v.gstin === g)
  s.checks.push({ label: 'Already a vendor', status: gOwner ? 'fail' : 'pass', detail: gOwner ? `${gOwner.id} ${gOwner.name} already has this GSTIN` : 'GSTIN is new to the vendor master' })
  if (gOwner) F(ctx, { code: 'DUP-VENDOR', severity: 'reject', stage: 'fraud', title: `Already onboarded as ${gOwner.id}`, detail: `${gOwner.name} already has GSTIN ${g}. Update the existing vendor instead of creating a duplicate.` })
  if (g === BUYER.gstin) F(ctx, { code: 'FRAUD-OWN-GSTIN', severity: 'reject', stage: 'fraud', title: "Northwind's own GSTIN", detail: 'The submission uses the buyer\'s own GSTIN.' })
  const bl = BLOCKLIST.find(b => b.pan === p)
  s.checks.push({ label: 'Blocklist', status: bl ? 'fail' : 'pass', detail: bl ? `${bl.name}: ${bl.reason}` : 'Not on the blocklist' })
  if (bl) F(ctx, { code: 'FRAUD-BLOCKED', severity: 'reject', stage: 'fraud', title: 'Entity is on the blocklist', detail: `${bl.name}: ${bl.reason}.` })
  const phone = sub.contact.phone.replace(/\D/g, '').slice(-10), email = sub.contact.email.toLowerCase()
  const shared = vendors.find(v => (phone && v.contact.phone.replace(/\D/g, '').slice(-10) === phone) || v.contact.email.toLowerCase() === email)
  s.checks.push({ label: 'Phone and email', status: shared ? 'warn' : 'pass', detail: shared ? `Same contact as ${shared.name} (${shared.id})` : 'Not shared with another vendor' })
  if (shared) { ctx.risk.push({ why: `Contact shared with ${shared.name}`, points: 25 }); F(ctx, { code: 'FRAUD-SHARED-CONTACT', severity: 'review', stage: 'fraud', title: 'Contact details shared with another vendor', detail: `Phone or email matches ${shared.id} ${shared.name}. Could be a related business; a person should check.` }) }
  s.summary = bankOwner || gOwner || bl ? 'Fraud or duplicate signal found' : 'No fraud or duplicate signals'
}

// ---------------- 8. decide ----------------
const PRIORITY = ['FRAUD-SHARED-BANK', 'FRAUD-BLOCKED', 'FRAUD-OWN-GSTIN', 'DUP-VENDOR', 'VER-GST-INACTIVE', 'XCK-PAN-GSTIN', 'VER-GST-NAME', 'XCK-NAME-GST', 'VER-BANK-NAME', 'DOC-WRONG', 'XCK-BIZTYPE']
const SEV_RANK: Record<string, number> = { reject: 0, vendor: 1, review: 2, info: 3 }
function ruleValue(ctx: Ctx, f: CustomRule['conditions'][number]['field'], risk: number): string | number {
  const s = ctx.sub
  switch (f) {
    case 'legal_name': return s.legal_name; case 'business_type': return s.business_type; case 'state': return s.address.state; case 'category': return s.category
    case 'msme': return s.msme ? 'yes' : 'no'; case 'email_domain': return s.contact.email.split('@')[1] || ''; case 'sponsor_department': return s.sponsor?.department || 'none'
    case 'risk': return risk; case 'registration_age_days': return ctx.registryAge ?? 9999
  }
}
function evalRule(ctx: Ctx, r: CustomRule, risk: number) {
  return r.conditions.every(c => {
    const v = ruleValue(ctx, c.field, risk)
    if (typeof v === 'number') { const n = Number(c.value); return c.op === 'gt' ? v > n : c.op === 'lt' ? v < n : v === n }
    const a = String(v).toLowerCase(), b = c.value.toLowerCase()
    return c.op === 'is' ? a === b : c.op === 'is_not' ? a !== b : c.op === 'contains' ? a.includes(b) : !a.includes(b)
  })
}

function decide(ctx: Ctx, s: Stage): { decision: Decision; waiting_on: Outcome['waiting_on']; risk: number } {
  const { settings } = ctx
  // Risk: each hard problem weighs in too, so the score reflects the whole picture.
  for (const f of ctx.findings) if (f.severity === 'reject') ctx.risk.push({ why: f.title, points: 40 }); else if (f.severity === 'vendor') ctx.risk.push({ why: f.title, points: 10 })
  const risk = Math.min(100, ctx.risk.reduce((a, r) => a + r.points, 0))
  const riskOnly = !ctx.findings.some(f => f.severity !== 'info')
  if (risk >= settings.riskReviewThreshold && riskOnly) F(ctx, { code: 'RISK-HIGH', severity: 'review', stage: 'decide', title: `High risk score: ${risk}/100`, detail: `No single check failed, but together: ${ctx.risk.map(r => `${r.why} (+${r.points})`).join(', ')}. Policy sends ${settings.riskReviewThreshold}+ to a person.` })
  for (const [i, r] of (settings.customRules || []).entries()) {
    if (!r.enabled) continue
    const hit = evalRule(ctx, r, risk)
    s.checks.push({ label: `Custom rule · ${r.name}`, status: hit ? (r.action === 'note' ? 'info' : 'warn') : 'pass', detail: hit ? `Fired: ${ruleSentence(r)}` : `Not triggered (${ruleSentence(r)})` })
    if (hit) F(ctx, { code: `CUSTOM-${i + 1}`, severity: r.action === 'note' ? 'info' : r.action, stage: 'decide', title: `Custom rule "${r.name}" applies`, detail: `${r.message ? r.message + ' ' : ''}(${ruleSentence(r)}.)` })
  }
  ctx.findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (PRIORITY.indexOf(a.code) + 1 || 99) - (PRIORITY.indexOf(b.code) + 1 || 99))
  const has = (sv: string) => ctx.findings.some(f => f.severity === sv)
  const decision: Decision = has('reject') ? 'rejected' : has('vendor') || has('review') ? 'pending' : 'approved'
  const waiting_on = decision !== 'pending' ? null : has('vendor') ? 'vendor' : 'reviewer'
  s.checks.push({ label: 'Reject rules fired', status: has('reject') ? 'fail' : 'pass', detail: ctx.findings.filter(f => f.severity === 'reject').map(f => f.code).join(', ') || 'None' })
  s.checks.push({ label: 'Needs the vendor', status: has('vendor') ? 'warn' : 'pass', detail: ctx.findings.filter(f => f.severity === 'vendor').map(f => f.code).join(', ') || 'None' })
  s.checks.push({ label: 'Needs a reviewer', status: has('review') ? 'warn' : 'pass', detail: ctx.findings.filter(f => f.severity === 'review').map(f => f.code).join(', ') || 'None' })
  s.checks.push({ label: 'Risk score', status: risk >= settings.riskReviewThreshold ? 'warn' : 'info', detail: `${risk}/100${ctx.risk.length ? ': ' + ctx.risk.map(r => `${r.why} +${r.points}`).join(', ') : ''}` })
  s.data = { risk, factors: ctx.risk }
  s.summary = decision === 'approved' ? 'Approved: every check passed' : decision === 'rejected' ? 'Rejected by policy' : waiting_on === 'vendor' ? 'Pending: the vendor must fix something' : 'Pending: a reviewer must decide'
  s.status = decision === 'approved' ? 'pass' : decision === 'rejected' ? 'fail' : 'warn'
  return { decision, waiting_on, risk }
}

// ---------------- 9. explain ----------------
const nd = (t: string) => t.replace(/\s*—\s*/g, ', ').replace(/–/g, '-')
export const fixLink = (run: Pick<Run, 'case_id'>) => `${process.env.PUBLIC_URL || 'https://vetted-onboarding.vercel.app'}/fix/${run.case_id}`
async function explain(ctx: Ctx, s: Stage, d: { decision: Decision; waiting_on: Outcome['waiting_on']; risk: number }): Promise<Outcome> {
  const { sub, run } = ctx
  const asks = ctx.findings.filter(f => f.severity === 'vendor' && f.ask).map(f => f.ask!).filter((a, i, all) => all.findIndex(x => JSON.stringify(x) === JSON.stringify(a)) === i)
  const vendorId = d.decision === 'approved' ? 'pending-id' : null
  const base: Outcome = { decision: d.decision, waiting_on: d.waiting_on, risk: d.risk, findings: ctx.findings, asks, vendor_id: vendorId, explained_by: 'template', ...template(ctx, d, asks) }
  const fx = d.waiting_on === 'vendor' ? fixLink(run) : null
  if (!aiConfigured()) { s.checks.push({ label: 'Explanation', status: 'info', detail: 'Written from templates (live AI not configured)' }); s.summary = 'Explained from templates'; return base }
  const key = 'exp:' + sha256(JSON.stringify({ c: run.case_id.startsWith('c_') && run.sample_id ? run.sample_id : run.id, r: run.round, d, f: ctx.findings.map(f => [f.code, f.severity, f.detail]) }))
  const cached = await ctx.store.getReading(key).catch(() => null)
  try {
    const r = (cached?.data as unknown as Awaited<ReturnType<typeof aiExplain>>) || await withBudget(aiExplain({ decision: d.decision, waiting_on: d.waiting_on, vendor: { name: sub.legal_name, contact: sub.contact.name, email: sub.contact.email }, findings: ctx.findings, fix_link: fx, vendor_id: d.decision === 'approved' ? '(assigned on approval)' : null, round: run.round }))
    if (!cached) ctx.store.saveReading(key, r as unknown as DocReading, 'explain').catch(() => {})
    s.checks.push({ label: 'Reviewer summary', status: 'pass', detail: nd(r.headline) })
    s.checks.push({ label: 'Vendor email', status: 'pass', detail: nd(r.vendor_email.subject) })
    s.summary = 'Reasoning and vendor email written by Gemini'
    return { ...base, headline: nd(r.headline), summary: nd(r.summary), next_steps: r.next_steps.map(nd), vendor_email: { to: sub.contact.email, subject: nd(r.vendor_email.subject), body: nd(r.vendor_email.body).replace(/\(assigned on approval\)/g, 'VENDOR_ID') }, explained_by: 'ai' }
  } catch {
    s.checks.push({ label: 'Explanation', status: 'info', detail: 'AI explanation timed out, written from templates' }); s.summary = 'Explained from templates'; return base
  }
}
const AI_BUDGET_MS = 9000
function withBudget<T>(p: Promise<T>): Promise<T> { return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('budget')), AI_BUDGET_MS))]) }

function template(ctx: Ctx, d: { decision: Decision; waiting_on: Outcome['waiting_on']; risk: number }, asks: Ask[]) {
  const { sub, run } = ctx
  const top = ctx.findings.find(f => f.severity !== 'info')
  const lc = (t = '') => (/^[A-Z][A-Z]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1))
  const headline = d.decision === 'approved' ? `Approved: ${sub.trade_name || sub.legal_name} ready to be paid` : d.decision === 'rejected' ? `Rejected: ${lc(top?.title)}` : d.waiting_on === 'vendor' ? `Pending: ${asks.length} item${asks.length === 1 ? '' : 's'} needed from the vendor` : `Pending review: ${lc(top?.title)}`
  const summary = d.decision === 'approved' ? `${sub.legal_name} passed every check: documents, GST registry, bank account and fraud screening. Risk score ${d.risk}/100.` : `${sub.legal_name} ${d.decision === 'rejected' ? 'cannot be onboarded' : 'is not onboarded yet'}: ${lc(top?.title)}.${ctx.findings.filter(f => f.severity !== 'info').length > 1 ? ` ${ctx.findings.filter(f => f.severity !== 'info').length - 1} more issue(s) below.` : ''}`
  const next_steps = d.decision === 'approved' ? ['Share the vendor ID with the vendor and the sponsor.', 'Ask the vendor to quote the vendor ID and PO number on every invoice.'] : d.decision === 'rejected' ? ['Close the case and inform the vendor.', ...(ctx.findings.some(f => f.code.startsWith('FRAUD')) ? ['Alert the finance controller about the fraud signal.'] : [])] : d.waiting_on === 'vendor' ? ['Send the email with the fix link.', 'Chase the vendor if nothing comes back in 3 working days.'] : ['Review the flagged items against the documents.', 'Call the vendor on the number given if anything looks off.']
  const greet = `Dear ${sub.contact.name},\n\n`, sign = '\n\nRegards,\nVendor Onboarding, Northwind Retail India'
  const body = d.decision === 'approved' ? `${greet}Welcome aboard: ${sub.legal_name} is now an approved Northwind vendor with vendor ID VENDOR_ID. Please quote this ID and the PO number on every invoice.${sign}`
    : d.decision === 'rejected' ? `${greet}Thank you for applying. We are unable to complete the registration of ${sub.legal_name}${ctx.findings.some(f => f.code.startsWith('FRAUD')) ? '. Please contact your Northwind sponsor if you have questions.' : `: ${lc(top?.title)}. You are welcome to apply again once this is resolved.`}${sign}`
    : d.waiting_on === 'vendor' ? `${greet}Thank you for your submission. To complete your registration we need:\n\n${asks.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}\n\nPlease use this link, which shows only these items: ${fixLink(run)}${sign}`
    : `${greet}Thank you for your submission. It is being reviewed by our team and nothing is needed from you right now. We will be in touch shortly.${sign}`
  return { headline, summary, next_steps, vendor_email: { to: sub.contact.email, subject: d.decision === 'approved' ? `Welcome to Northwind: vendor ID VENDOR_ID` : d.decision === 'rejected' ? `Your vendor registration with Northwind` : d.waiting_on === 'vendor' ? `Action needed: ${asks.length} item${asks.length === 1 ? '' : 's'} for your Northwind registration` : `Your Northwind registration is under review`, body } }
}

// ---------------- 10. record ----------------
export async function approveVendor(st: Store, run: Run, by: string): Promise<Vendor> {
  const sub = run.submission
  const existing = await st.listVendors()
  const same = existing.find(v => v.onboarded?.case_id === run.case_id)
  if (same) return same
  const id = `V-${301 + existing.length}`
  const v: Vendor = { id, name: sub.legal_name, trade_name: sub.trade_name, gstin: sub.gstin.toUpperCase(), pan: sub.pan.toUpperCase(), business_type: sub.business_type, state: sub.gstin.slice(0, 2), address: `${sub.address.line}, ${sub.address.city} ${sub.address.pin}`, status: 'active',
    bank: { bank_name: sub.bank.bank_name || '-', account_number: sub.bank.account_number.replace(/\D/g, ''), ifsc: sub.bank.ifsc.toUpperCase(), account_name: sub.bank.account_name }, contact: { name: sub.contact.name, phone: sub.contact.phone, email: sub.contact.email },
    onboarded: { by, at: new Date().toISOString(), run_id: run.id, case_id: run.case_id, rounds: run.round } }
  await st.addVendor(v)
  return v
}
export function stampVendorId(o: Outcome, id: string) {
  o.vendor_id = id
  if (o.vendor_email) o.vendor_email = { ...o.vendor_email, subject: o.vendor_email.subject.replace(/VENDOR_ID/g, id), body: o.vendor_email.body.replace(/VENDOR_ID/g, id) }
}

async function record(ctx: Ctx, s: Stage, o: Outcome, t0: number) {
  const { run, store: st } = ctx
  if (o.decision === 'approved') {
    const v = await approveVendor(st, run, 'VETTED')
    stampVendorId(o, v.id)
    s.checks.push({ label: 'Vendor master', status: 'pass', detail: `${v.id} created: ${v.name}, paid to ${v.bank.bank_name} ${last4(v.bank.account_number)}` })
  } else s.checks.push({ label: 'Vendor master', status: 'info', detail: o.decision === 'rejected' ? 'Not added' : 'Added only once approved' })
  if (o.decision === 'pending' && o.waiting_on === 'vendor') s.checks.push({ label: 'Fix link', status: 'info', detail: `${o.asks.length} item(s) open for the vendor · ${fixLink(run)}` })
  await st.addAudit({ run_id: run.id, actor: 'VETTED', action: `decision:${o.decision}`, detail: `Round ${run.round}: ${o.headline}` })
  s.checks.push({ label: 'Case timeline', status: 'pass', detail: `Case ${run.case_id} · round ${run.round} · ${((Date.now() - t0) / 1000).toFixed(1)}s end to end` })
  s.summary = o.decision === 'approved' ? `Vendor ${o.vendor_id} created` : 'Decision recorded'
}
