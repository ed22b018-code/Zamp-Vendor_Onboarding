import { NextResponse } from 'next/server'
import { SAMPLES } from '@/lib/samples'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The onboarding inbox: demo submissions and their latest run. */
export async function GET() {
  const runs = await store().listRuns()
  return NextResponse.json(SAMPLES.map(s => {
    const latest = runs.filter(r => r.sample_id === s.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
    return { id: s.id, type: s.type, scenario: s.scenario, expect: s.expect, title: s.title, email: s.email, docs: s.docs, submission: s.submission,
      latest: latest && { id: latest.id, case_id: latest.case_id, round: latest.round, status: latest.status, decision: latest.final_decision || latest.decision, waiting_on: latest.outcome?.waiting_on ?? null } }
  }))
}
