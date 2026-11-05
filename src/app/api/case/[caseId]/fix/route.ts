// The vendor fixes only what was asked and resubmits: a new round of the same case.
import { NextResponse } from 'next/server'
import { newRun } from '@/lib/engine'
import { cleanFields, takeFiles } from '@/lib/intake'
import { store } from '@/lib/store'
import { DOC_LABEL } from '@/lib/types'
import { uid } from '@/lib/util'
import { latestOfCase } from '@/lib/cases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIELD_LABEL: Record<string, string> = { legal_name: 'legal name', trade_name: 'trade name', business_type: 'business type', gstin: 'GSTIN', pan: 'PAN', account_number: 'bank account', ifsc: 'IFSC', account_name: 'account name', bank_name: 'bank', udyam: 'Udyam number', address_line: 'address', city: 'city', state: 'state', pin: 'PIN code', email: 'email' }

export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const st = store()
  const prev = await latestOfCase(caseId)
  if (!prev || prev.status !== 'done') return NextResponse.json({ error: 'This registration is not waiting for changes' }, { status: 409 })
  if ((prev.final_decision || prev.decision) !== 'pending' || prev.outcome?.waiting_on !== 'vendor') return NextResponse.json({ error: 'Nothing is needed from you on this registration right now' }, { status: 409 })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  let fields: Record<string, unknown> = {}
  try { fields = JSON.parse(String(form.get('fields') || '{}')) } catch { /* none */ }
  const reply = String(form.get('reply') || '').trim().slice(0, 600)
  const base = prev.submission
  const merged = cleanFields(fields, base)
  const { docs, error } = await takeFiles(form, st, uid('r_'))
  if (error) return NextResponse.json({ error }, { status: 400 })
  // A new document replaces the earlier one of the same kind (and a wrongly-labelled one).
  const replaced = new Set(docs.map(d => d.declared))
  const keep = base.documents.filter(d => !replaced.has(d.declared) && !(replaced.has('cancelled_cheque') && d.declared === 'bank_letter') && !(replaced.has('bank_letter') && d.declared === 'cancelled_cheque'))
  const changes: string[] = []
  for (const [k, label] of Object.entries(FIELD_LABEL)) {
    const before = JSON.stringify(flat(base)[k] ?? ''), after = JSON.stringify(flat(merged)[k] ?? '')
    if (k in fields && before !== after) changes.push(`${label} changed`)
  }
  for (const d of docs) changes.push(`new ${DOC_LABEL[d.declared].toLowerCase()} (${d.file_name})`)
  if (reply) changes.push(`vendor replied: "${reply.slice(0, 120)}"`)
  if (!changes.length) return NextResponse.json({ error: 'Nothing changed: update the items listed, then resubmit' }, { status: 400 })
  const run = newRun({ submission: { ...merged, documents: [...keep, ...docs] }, source: 'resubmission', sample_id: prev.sample_id, case_id: prev.case_id, round: prev.round + 1, previous_run: prev.id, changes })
  prev.superseded_by = run.id
  await st.saveRun(prev); await st.saveRun(run)
  await st.addAudit({ run_id: run.id, actor: base.contact.name || 'Vendor', action: 'resubmitted', detail: `Round ${run.round}: ${changes.join('; ')}` })
  return NextResponse.json({ case_id: run.case_id, id: run.id })
}
function flat(s: { legal_name: string; trade_name: string | null; business_type: string; gstin: string; pan: string; bank: Record<string, unknown>; udyam: string | null; address: Record<string, unknown>; contact: Record<string, unknown> }): Record<string, unknown> {
  return { legal_name: s.legal_name, trade_name: s.trade_name, business_type: s.business_type, gstin: s.gstin, pan: s.pan, ...s.bank, udyam: s.udyam, address_line: s.address.line, city: s.address.city, state: s.address.state, pin: s.address.pin, email: s.contact.email }
}
