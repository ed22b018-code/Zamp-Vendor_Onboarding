// Plain English → structured custom rule (a draft the person reviews before saving).
import { NextResponse } from 'next/server'
import { DEPARTMENTS } from '@/data/master'
import { aiConfigured, aiDraftRule } from '@/lib/gemini'
import { sanitizeRules } from '@/lib/rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({}))
  const t = String(text || '').trim().slice(0, 400)
  if (t.length < 8) return NextResponse.json({ error: 'Describe the rule in a sentence, e.g. "Send any vendor on Gmail to a reviewer"' }, { status: 400 })
  if (!aiConfigured()) return NextResponse.json({ error: 'Live AI is not configured, so build the rule with the dropdowns instead' }, { status: 503 })
  try {
    const r = await Promise.race([
      aiDraftRule(t, { departments: DEPARTMENTS }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini took too long, please try again')), 20000)),
    ])
    if (!r.understood) return NextResponse.json({ error: r.note || "That policy can't be expressed with the available fields" }, { status: 422 })
    const [rule] = sanitizeRules([{ id: 'draft', name: r.name, enabled: true, conditions: r.conditions, action: r.action, message: r.message }])
    if (!rule) return NextResponse.json({ error: "Couldn't turn that into a valid rule. Try rephrasing, or use the dropdowns." }, { status: 422 })
    return NextResponse.json({ rule, note: r.note })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }) }
}
