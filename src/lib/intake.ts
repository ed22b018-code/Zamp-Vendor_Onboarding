// Turning a portal form (or a fix) into a Submission. Shared by /api/apply and /api/case/[id]/fix.
import 'server-only'
import { sha256 } from './engine'
import type { Store } from './store'
import type { BusinessType, Country, DocKind, Submission, SubmissionDoc } from './types'
import { BUSINESS_TYPES, COUNTRIES } from './types'
import { uid } from './util'
import { FIXES } from './samples'

export const MAX_TOTAL = 4 * 1024 * 1024
const OK_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const KINDS: DocKind[] = ['gst_certificate', 'pan_card', 'cancelled_cheque', 'bank_letter', 'msme_certificate', 'tax_certificate', 'other']
const c = (x: unknown, n = 120) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function cleanFields(b: Record<string, unknown>, base?: Submission): Omit<Submission, 'documents'> {
  const g = (k: string, fallback: string) => (k in b ? c(b[k]) : fallback)
  const bt = c(b.business_type) as BusinessType
  const ct = c(b.country) as Country
  const country: Country = COUNTRIES.includes(ct) ? ct : base?.country || 'India'
  return {
    country, tax_id: ('tax_id' in b ? c(b.tax_id, 40) : base?.tax_id || '') || null,
    legal_name: g('legal_name', base?.legal_name || ''), trade_name: ('trade_name' in b ? c(b.trade_name) : base?.trade_name || '') || null,
    business_type: BUSINESS_TYPES.includes(bt) ? bt : base?.business_type || 'Private Limited',
    gstin: g('gstin', base?.gstin || '').toUpperCase().replace(/\s/g, ''), pan: g('pan', base?.pan || '').toUpperCase().replace(/\s/g, ''),
    address: { line: g('address_line', base?.address.line || ''), city: g('city', base?.address.city || ''), state: g('state', base?.address.state || ''), pin: g('pin', base?.address.pin || '').replace(/\s/g, '') },
    contact: { name: g('contact_name', base?.contact.name || ''), email: g('email', base?.contact.email || '').toLowerCase(), phone: g('phone', base?.contact.phone || '') },
    bank: { account_name: g('account_name', base?.bank.account_name || ''), account_number: g('account_number', base?.bank.account_number || '').replace(/[\s-]/g, ''), ifsc: g('ifsc', base?.bank.ifsc || '').toUpperCase(), bank_name: g('bank_name', base?.bank.bank_name || '') || null, swift: g('swift', base?.bank.swift || '').toUpperCase() || null, iban: g('iban', base?.bank.iban || '').toUpperCase().replace(/\s/g, '') || null },
    category: (c(b.category) || base?.category) === 'Services' ? 'Services' : 'Goods',
    msme: 'msme' in b ? b.msme === true || b.msme === 'true' || b.msme === 'yes' : !!base?.msme,
    udyam: ('udyam' in b ? c(b.udyam).toUpperCase() : base?.udyam || '') || null,
    sponsor: 'sponsor_name' in b ? (c(b.sponsor_name) ? { name: c(b.sponsor_name), department: c(b.sponsor_department) || 'Admin' } : null) : base?.sponsor || null,
  }
}

/** Store uploaded files (content-addressed) and describe them. Form keys: doc:<kind> (one file each). */
export async function takeFiles(form: FormData, st: Store, runId: string): Promise<{ docs: SubmissionDoc[]; error?: string }> {
  const docs: SubmissionDoc[] = []; let total = 0
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('doc:') || !(v instanceof File) || !v.size) continue
    const kind = k.slice(4) as DocKind
    if (!KINDS.includes(kind)) continue
    const mime = v.type || (v.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
    if (!OK_MIME.includes(mime)) return { docs, error: `${v.name}: only PDF, PNG or JPG files` }
    total += v.size
    if (total > MAX_TOTAL) return { docs, error: 'Files add up to more than 4 MB. Please send smaller scans.' }
    const buf = Buffer.from(await v.arrayBuffer())
    const sha = sha256(buf)
    await st.saveFile('f_' + sha, runId, buf.toString('base64'))
    docs.push({ id: uid('d'), declared: kind, file_name: v.name.replace(/[^\w.\- ]/g, '_').slice(0, 80) || `${kind}.pdf`, mime, sha, bytes: buf.length })
  }
  return { docs }
}

/** What the vendor is allowed to see about their case: decision, the asks and the email. Never the internal findings. */
export function publicCase(run: { sample_id: string | null; case_id: string; round: number; status: string; decision: string | null; final_decision: string | null; review: { action: string } | null; submission: Submission; outcome: { waiting_on: string | null; asks: unknown[]; vendor_email: { subject: string; body: string } | null; vendor_id: string | null } | null }) {
  const final = run.final_decision || run.decision
  return {
    case_id: run.case_id, sample: run.sample_id, demo_fix: run.sample_id ? FIXES[run.sample_id] ?? null : null, round: run.round, status: run.status === 'done' ? final : 'checking',
    waiting_on: run.status === 'done' && final === 'pending' ? run.outcome?.waiting_on ?? null : null,
    asks: run.status === 'done' && final === 'pending' && run.outcome?.waiting_on === 'vendor' ? run.outcome.asks : [],
    message: run.status === 'done' ? run.outcome?.vendor_email ?? null : null,
    vendor_id: run.outcome?.vendor_id ?? null,
    vendor: { country: run.submission.country || 'India', tax_id: run.submission.tax_id, legal_name: run.submission.legal_name, trade_name: run.submission.trade_name, business_type: run.submission.business_type, gstin: run.submission.gstin, pan: run.submission.pan, bank_last4: (run.submission.bank.iban || run.submission.bank.account_number).slice(-4), ifsc: run.submission.bank.swift || run.submission.bank.ifsc, documents: run.submission.documents.map(d => ({ declared: d.declared, file_name: d.file_name })) },
  }
}
