// A reviewer decides a pending case: approve (creates the vendor), reject, or ask the vendor for something specific.
import { NextResponse } from 'next/server'
import { approveVendor, fixLink, stampVendorId } from '@/lib/engine'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { action, note, reviewer } = await req.json().catch(() => ({}))
  if (!['approve', 'reject', 'request'].includes(action)) return NextResponse.json({ error: 'Action must be approve, reject or request' }, { status: 400 })
  const text = String(note || '').trim().slice(0, 500)
  if (text.length < 3) return NextResponse.json({ error: action === 'request' ? 'Write what the vendor should send or confirm' : 'Add a short note explaining the decision' }, { status: 400 })
  const st = store()
  const run = await st.getRun(id)
  if (!run || run.status !== 'done' || !run.outcome) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.decision !== 'pending' || run.review || run.superseded_by) return NextResponse.json({ error: 'Only an open pending case can be reviewed' }, { status: 409 })
  const who = String(reviewer || 'Reviewer').slice(0, 60)
  run.review = { action, note: text, reviewer: who, at: new Date().toISOString() }
  const sub = run.submission, o = run.outcome
  const sign = '\n\nRegards,\nVendor Onboarding, Northwind Retail India'
  if (action === 'approve') {
    const v = await approveVendor(st, run, who)
    run.final_decision = 'approved'
    o.vendor_email = { to: sub.contact.email, subject: 'Welcome to Northwind: vendor ID VENDOR_ID', body: `Dear ${sub.contact.name},\n\nWelcome aboard: ${sub.legal_name} is now an approved Northwind vendor with vendor ID VENDOR_ID. Please quote this ID and the PO number on every invoice.${sign}` }
    stampVendorId(o, v.id)
  } else if (action === 'reject') {
    run.final_decision = 'rejected'
    o.vendor_email = { to: sub.contact.email, subject: 'Your vendor registration with Northwind', body: `Dear ${sub.contact.name},\n\nThank you for applying. After review we are unable to complete the registration of ${sub.legal_name}. Please contact your Northwind sponsor if you have questions.${sign}` }
  } else {
    // Back to the vendor with a specific question; the case stays pending, now waiting on the vendor.
    run.review = null
    o.waiting_on = 'vendor'
    o.asks = [...o.asks, { kind: 'confirm', text }]
    o.vendor_email = { to: sub.contact.email, subject: 'One question about your Northwind registration', body: `Dear ${sub.contact.name},\n\nThank you for your submission. Before we can complete your registration, please help us with this:\n\n${text}\n\nYou can reply and upload anything needed here: ${fixLink(run)}${sign}` }
  }
  await st.saveRun(run)
  await st.addAudit({ run_id: id, actor: who, action: `review:${action}`, detail: text })
  return NextResponse.json({ run })
}
