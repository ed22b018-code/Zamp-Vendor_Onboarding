import { NextResponse } from 'next/server'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const st = store()
  const run = await st.getRun(id)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  const all = await st.listRuns()
  const rounds = all.filter(r => r.case_id === run.case_id).sort((a, b) => a.round - b.round || a.created_at.localeCompare(b.created_at))
    .map(r => ({ id: r.id, round: r.round, created_at: r.created_at, source: r.source, decision: r.final_decision || r.decision, waiting_on: r.outcome?.waiting_on ?? null, changes: r.changes, status: r.status, headline: r.outcome?.headline ?? null }))
  const audit = (await Promise.all(rounds.map(r => st.listAudit(r.id)))).flat().sort((a, b) => b.at.localeCompare(a.at))
  return NextResponse.json({ run, audit, rounds })
}
