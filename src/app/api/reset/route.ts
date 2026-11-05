import { NextResponse } from 'next/server'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Restores the demo: clears cases, onboarded vendors and the audit trail, and restores the default rules. */
export async function POST(req: Request) {
  const { forgetReadings } = await req.json().catch(() => ({}))
  const st = store()
  await st.reset({ forgetReadings: Boolean(forgetReadings) })
  await st.addAudit({ run_id: null, actor: 'Procurement admin', action: 'demo:reset', detail: `Demo data restored to its starting state${forgetReadings ? ' (AI readings cleared too)' : ' (AI readings of files kept)'}` })
  return NextResponse.json({ ok: true })
}
