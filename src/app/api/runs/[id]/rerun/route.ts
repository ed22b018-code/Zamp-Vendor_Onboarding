// Re-run the same submission under the current rules: a new round of the same case.
import { NextResponse } from 'next/server'
import { newRun } from '@/lib/engine'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const st = store()
  const old = await st.getRun(id)
  if (!old) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (old.final_decision === 'approved' || old.review) return NextResponse.json({ error: 'This case is already closed' }, { status: 409 })
  const run = newRun({ submission: old.submission, source: 'rerun', sample_id: old.sample_id, case_id: old.case_id, round: old.round + 1, previous_run: old.id, changes: ['re-run with current rules'] })
  old.superseded_by = run.id
  await st.saveRun(old); await st.saveRun(run)
  await st.addAudit({ run_id: run.id, actor: 'Procurement', action: 'rerun', detail: `Re-run of ${old.submission.legal_name} with current rules` })
  return NextResponse.json({ id: run.id })
}
