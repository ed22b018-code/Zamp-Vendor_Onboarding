// Vendor portal: a new vendor submits the form and documents. Creates round 1 of a new case.
import { NextResponse } from 'next/server'
import { newRun } from '@/lib/engine'
import { cleanFields, takeFiles } from '@/lib/intake'
import { store } from '@/lib/store'
import { uid } from '@/lib/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Send the form as multipart/form-data' }, { status: 400 })
  let fields: Record<string, unknown> = {}
  try { fields = JSON.parse(String(form.get('fields') || '{}')) } catch { return NextResponse.json({ error: 'Bad form data' }, { status: 400 }) }
  const sub = cleanFields(fields)
  if (sub.legal_name.length < 3) return NextResponse.json({ error: 'Enter your registered business name' }, { status: 400 })
  if (!sub.contact.email.includes('@')) return NextResponse.json({ error: 'Enter a contact email' }, { status: 400 })
  const st = store()
  const tmpId = uid('r_')
  const { docs, error } = await takeFiles(form, st, tmpId)
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!docs.length) return NextResponse.json({ error: 'Attach at least your GST certificate, PAN card and a cancelled cheque' }, { status: 400 })
  const run = newRun({ submission: { ...sub, documents: docs }, source: 'portal', sample_id: null })
  await st.saveRun(run)
  await st.addAudit({ run_id: run.id, actor: 'Vendor portal', action: 'received', detail: `${sub.legal_name} submitted ${docs.length} document(s) via the portal` })
  return NextResponse.json({ case_id: run.case_id, id: run.id })
}
