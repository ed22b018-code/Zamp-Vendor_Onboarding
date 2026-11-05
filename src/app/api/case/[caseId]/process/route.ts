// Runs the checks for the vendor's latest round (portal or fix link) and returns the vendor-facing result.
import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/engine'
import { publicCase } from '@/lib/intake'
import { store } from '@/lib/store'
import { sleep } from '@/lib/util'
import { latestOfCase } from '@/lib/cases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const st = store()
  let run = await latestOfCase(caseId)
  if (!run) return NextResponse.json({ error: 'We could not find this registration' }, { status: 404 })
  if (run.status === 'queued' && (await st.claimRun(run.id))) {
    try { run = await runPipeline(run, st, () => {}, { fast: true }) } catch (e) { run.status = 'error'; run.error = (e as Error).message; await st.saveRun(run) }
  } else {
    for (let i = 0; i < 90 && run && (run.status === 'queued' || run.status === 'running'); i++) { await sleep(1000); const next: typeof run | null = await st.getRun(run.id); if (!next) break; run = next }
  }
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(publicCase(run))
}
