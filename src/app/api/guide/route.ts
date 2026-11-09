// The guide's answers. Gemini answers from the app's knowledge plus the page the person is on;
// without AI, it falls back to the best-matching lines of the same knowledge.
import { NextResponse } from 'next/server'
import { aiConfigured, aiGuide } from '@/lib/gemini'
import { GUIDE, KNOWLEDGE } from '@/lib/guideContent'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const nd = (t: string) => t.replace(/\s*—\s*/g, ', ')

async function pageContext(path: string): Promise<string> {
  const m = path.match(/^\/runs\/([\w-]+)/)
  if (!m) return ''
  const run = await store().getRun(m[1]).catch(() => null)
  if (!run) return ''
  const o = run.outcome
  const s = run.submission
  return `The person is looking at the registration of ${s.legal_name} (${s.business_type}, ${s.country || 'India'}${s.country && s.country !== 'India' ? `, tax ID ${s.tax_id}` : `, GSTIN ${s.gstin}`}), round ${run.round} of case ${run.case_id}. Status: ${run.status}. ${o ? `Decision: ${run.decision}${o.waiting_on ? ` (waiting on the ${o.waiting_on})` : ''}${run.review ? `, then ${run.review.action} by reviewer ${run.review.reviewer} ("${run.review.note}")` : ''}. Risk ${o.risk}/100. Headline: ${o.headline}. Summary: ${o.summary} Findings: ${o.findings.map(f => `${f.code} (${f.severity}): ${f.title}. ${f.detail}`).join(' | ') || 'none'}. Next steps: ${o.next_steps.join('; ')}.${o.vendor_id ? ` Vendor ID ${o.vendor_id}.` : ''}` : 'Still processing.'}`
}

const STOP = new Set(['test', 'tests', 'number', 'submission', 'invoice', 'the', 'and', 'for', 'was', 'why', 'what', 'how', 'does', 'this', 'that', 'are', 'can', 'with', 'who', 'when', 'where', 'which', 'did', 'does', 'mean', 'means', 'about', 'page', 'here', 'there', 'get', 'got', 'is', 'it', 'of', 'to', 'in', 'on', 'do', 'an', 'my', 'me', 'be'])
function offline(q: string, page: { title: string; about: string }, ctx: string) {
  const words = (q.toLowerCase().match(/[a-z0-9]+/g) || []).map(w => (/^\d$/.test(w) ? '0' + w : w)).filter(w => w.length > 1 && !STOP.has(w))
  // About the case on screen: answer from the case itself.
  if (ctx && /\b(this|why|fix|pending|approved|rejected|decid|vendor|risk|wrong|need)/i.test(q)) return ctx.replace(/^The person is looking at the registration of /, 'This is ').split(' Next steps:')[0]
  const lines = KNOWLEDGE.split('\n').flatMap(l => l.split(/(?<=[.)])\s+(?=(?:\d{1,2} )?[A-Z])/)).map(x => x.trim()).filter(x => x.length > 12)
  const scored = lines.map(l => { const t = l.toLowerCase(); return { l, s: words.reduce((a, w) => a + (new RegExp(`\\b${w}`).test(t) ? (/^\d+$/.test(w) ? 4 : w.length > 5 ? 2 : 1) : 0), 0) / Math.sqrt(1 + l.length / 160) } }).sort((a, b) => b.s - a.s)
  const best = scored.filter(x => x.s > 0).slice(0, 2).map(x => x.l)
  return best.length ? best.join(' ') : `On ${page.title}: ${page.about}`
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const q = String(b.q || '').trim().slice(0, 500)
  const path = String(b.path || '/').slice(0, 200)
  if (!q) return NextResponse.json({ answer: 'Ask me anything about this page.' })
  const page = GUIDE.pages.find(p => (p.prefix === '/' ? path === '/' : path.startsWith(p.prefix))) || GUIDE.pages[0]
  const history = Array.isArray(b.history) ? b.history.slice(-6).map((h: { from: string; text: string }) => ({ from: String(h.from).slice(0, 4), text: String(h.text).slice(0, 600) })) : []
  const ctx = await pageContext(path).catch(() => '')
  if (aiConfigured()) {
    try {
      const r = await Promise.race([
        aiGuide({ knowledge: KNOWLEDGE, page: `${page.title}: ${page.about}`, pageContext: ctx, question: q, history }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
      ])
      return NextResponse.json({ answer: nd(r.answer), followups: (r.followups || []).slice(0, 3).map(nd), source: 'ai' })
    } catch { /* fall through */ }
  }
  return NextResponse.json({ answer: offline(q, page, ctx), followups: page.questions.slice(0, 3), source: 'offline' })
}
