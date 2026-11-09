import { NextResponse } from 'next/server'
import { DEFAULT_SETTINGS } from '@/data/master'
import { sanitizeRules } from '@/lib/rules'
import { store } from '@/lib/store'
import type { Settings } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() { return NextResponse.json(await store().getSettings()) }
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export async function PUT(req: Request) {
  const b = await req.json(); const d = DEFAULT_SETTINGS
  const s: Settings = {
    nameMatchStrict: clamp(b.nameMatchStrict, 0.6, 1, d.nameMatchStrict), minConfidence: clamp(b.minConfidence, 0.5, 1, d.minConfidence),
    newRegistrationDays: clamp(b.newRegistrationDays, 0, 730, d.newRegistrationDays), riskReviewThreshold: clamp(b.riskReviewThreshold, 10, 100, d.riskReviewThreshold),
    freeEmailAction: b.freeEmailAction === 'review' ? 'review' : 'info', requireMsmeCert: b.requireMsmeCert !== false, requireSponsor: Boolean(b.requireSponsor),
    sharedBankAction: b.sharedBankAction === 'review' ? 'review' : 'reject', liveIfsc: b.liveIfsc !== false, foreignNeedsReview: Boolean(b.foreignNeedsReview), customRules: sanitizeRules(b.customRules), useCachedReadings: b.useCachedReadings !== false,
  }
  const st = store(); const before = await st.getSettings()
  await st.saveSettings(s)
  const changed = (Object.keys(s) as (keyof Settings)[]).filter(k => k !== 'customRules' && s[k] !== before[k]).map(k => `${k}: ${before[k]} → ${s[k]}`)
  if (JSON.stringify(s.customRules) !== JSON.stringify(before.customRules || [])) changed.push(`custom rules: ${(before.customRules || []).length} → ${s.customRules.length}`)
  if (changed.length) await st.addAudit({ run_id: null, actor: 'Procurement admin', action: 'rules:update', detail: changed.join('; ') })
  return NextResponse.json(s)
}
