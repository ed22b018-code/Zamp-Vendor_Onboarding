import { NextResponse } from 'next/server'
import { newRun, sampleSubmission } from '@/lib/engine'
import { sampleById } from '@/lib/samples'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const runs = await store().listRuns()
  return NextResponse.json(runs.map(r => ({ ...r, stages: r.stages.map(s => ({ key: s.key, title: s.title, status: s.status })), reading: null, settings_snapshot: null })))
}

/** Start a run for a demo submission from the onboarding inbox. */
export async function POST(req: Request) {
  const { sampleId } = await req.json().catch(() => ({}))
  const s = sampleById(sampleId); const sub = s && sampleSubmission(s.id)
  if (!s || !sub) return NextResponse.json({ error: 'Unknown submission' }, { status: 404 })
  const st = store()
  const run = newRun({ submission: sub, source: 'inbox', sample_id: s.id })
  await st.saveRun(run)
  await st.addAudit({ run_id: run.id, actor: 'Onboarding inbox', action: 'received', detail: `${s.email.subject}, from ${s.email.from}` })
  return NextResponse.json({ id: run.id, case_id: run.case_id })
}
