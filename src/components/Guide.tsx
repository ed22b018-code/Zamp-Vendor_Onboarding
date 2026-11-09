'use client'
// The in-app guide: greets first-time visitors, runs a spotlight tour of the real screens,
// then stays bottom-right to answer questions about whichever page you're on.
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type TourStep = {
  path: string                    // page to show; '__run__' = a live run (created on demand)
  target?: string                 // CSS selector to spotlight; omitted = centred card
  title: string
  body: string
}
export type PageInfo = { prefix: string; title: string; about: string; questions: string[] }
export type GuideConfig = {
  name: string                    // persona name, e.g. "Vera"
  app: string                     // product name
  storageKey: string
  welcome: string
  steps: TourStep[]
  pages: PageInfo[]
  demoRun: { createBody: Record<string, string>; label: string }
}

type Msg = { from: 'bot' | 'you'; text: string; chips?: string[] }
const SEEN = (k: string) => { try { return localStorage.getItem(k) } catch { return '1' } }
const MARK = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function Guide({ cfg }: { cfg: GuideConfig }) {
  const path = usePathname()
  const router = useRouter()
  const [mode, setMode] = useState<'closed' | 'welcome' | 'tour' | 'chat'>('closed')
  const [step, setStep] = useState(0)
  const [nudge, setNudge] = useState(false)
  const page = cfg.pages.find(p => (p.prefix === '/' ? path === '/' : path.startsWith(p.prefix))) || cfg.pages[0]

  useEffect(() => {
    if (!SEEN(cfg.storageKey)) { const t = setTimeout(() => setMode(m => (m === 'closed' ? 'welcome' : m)), 1200); return () => clearTimeout(t) }
  }, [cfg.storageKey])

  const startTour = () => { MARK(cfg.storageKey, 'tour'); setStep(0); setMode('tour') }
  const explore = () => { MARK(cfg.storageKey, 'explore'); setMode('closed'); setNudge(true); setTimeout(() => setNudge(false), 6000) }
  const skip = () => { MARK(cfg.storageKey, 'skip'); setMode('closed') }

  return (
    <>
      {mode === 'tour' && <Tour cfg={cfg} step={step} setStep={setStep} router={router} path={path} onEnd={(toChat) => setMode(toChat ? 'chat' : 'closed')} />}
      {mode === 'welcome' && (
        <div className="gd-panel gd-welcome rise" role="dialog" aria-label={`${cfg.name}, your guide`}>
          <div className="gd-head"><Avatar /><div className="grow"><b>Hi, I'm {cfg.name}</b><div className="tiny muted">Your guide to {cfg.app}</div></div><button className="gd-x" aria-label="Close" onClick={skip}>×</button></div>
          <p className="gd-text">{cfg.welcome}</p>
          <div className="gd-choices">
            <button className="btn blue" onClick={startTour}>Show me around (about 5 min)</button>
            <button className="btn ghost" onClick={explore}>I'll explore myself</button>
            <button className="gd-skip" onClick={skip}>Skip</button>
          </div>
        </div>
      )}
      {mode === 'chat' && <Chat cfg={cfg} page={page} path={path} onClose={() => setMode('closed')} onTour={startTour} />}
      {mode === 'closed' && (
        <button className={`gd-fab ${nudge ? 'nudge' : ''}`} onClick={() => setMode('chat')} aria-label={`Ask ${cfg.name} about this page`}>
          <Avatar />{nudge && <span className="gd-tip">I'm here if you need me. Ask about any page.</span>}
        </button>
      )}
    </>
  )
}

function Avatar() {
  // A friendly face drawn in the same dot language as the wordmark.
  return (
    <span className="gd-av" aria-hidden>
      <svg viewBox="0 0 32 32" width="100%" height="100%">
        <circle cx="16" cy="16" r="16" fill="var(--blue)" />
        <circle cx="11" cy="13" r="2.2" fill="#fff" /><circle cx="21" cy="13" r="2.2" fill="#fff" />
        {[[9, 19.5], [12, 21.5], [16, 22.3], [20, 21.5], [23, 19.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.35" fill="#fff" />)}
      </svg>
    </span>
  )
}

// ---------------- tour ----------------
function Tour({ cfg, step, setStep, router, path, onEnd }: { cfg: GuideConfig; step: number; setStep: (n: number) => void; router: ReturnType<typeof useRouter>; path: string; onEnd: (toChat: boolean) => void }) {
  const s = cfg.steps[step]
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [busy, setBusy] = useState(false)
  const runPath = useRef<string | null>(null)
  const last = step === cfg.steps.length - 1

  // Go to the step's page (creating a demo run for the live-run step if needed).
  useEffect(() => {
    let alive = true
    ;(async () => {
      let dest = s.path
      if (dest === '__run__') {
        if (path.startsWith('/runs/') && !path.endsWith('/record')) { runPath.current = path; return }
        if (!runPath.current) {
          setBusy(true)
          try {
            const runs: { id: string; status: string; sample_id?: string | null; superseded_by?: string | null }[] = await fetch('/api/runs', { cache: 'no-store' }).then(r => r.json())
            const want = Object.values(cfg.demoRun.createBody)[0]
            const existing = runs.find(r => r.sample_id === want && !r.superseded_by) || runs.find(r => r.status === 'done' && !r.superseded_by)
            let id = existing?.id
            if (!id) { const j = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg.demoRun.createBody) }).then(r => r.json()); id = j.id }
            runPath.current = `/runs/${id}`
          } catch { runPath.current = '/inbox' }
          if (alive) setBusy(false)
        }
        dest = runPath.current!
      }
      if (alive && dest !== path) router.push(dest)
    })()
    return () => { alive = false }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Find and follow the spotlight target.
  useLayoutEffect(() => {
    setRect(null)
    if (!s.target) return
    let tries = 0, el: Element | null = null, raf = 0, scrolled = false
    const tick = () => {
      el = el && document.contains(el) ? el : document.querySelector(s.target!)
      if (el) {
        if (!scrolled) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); scrolled = true }
        const r = el.getBoundingClientRect()
        setRect(prev => (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.height - r.height) < 1 && Math.abs(prev.width - r.width) < 1 ? prev : r))
      } else if (++tries > 240) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step, path, s.target])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onEnd(false); if (e.key === 'ArrowRight' && !last) setStep(step + 1); if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [step, last, onEnd, setStep])

  const pad = 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const mobile = vw < 820
  const box = rect && { top: Math.max(4, rect.top - pad), left: Math.max(4, rect.left - pad), width: Math.min(vw - 8, rect.width + pad * 2), height: Math.min(vh - 8, rect.height + pad * 2) }
  let card: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
  if (box && !mobile) {
    const below = box.top + box.height + 14, w = 360
    const left = Math.min(Math.max(12, box.left), vw - w - 12)
    card = below + 230 < vh ? { top: below, left } : box.top - 14 > 240 ? { top: box.top - 14, left, transform: 'translateY(-100%)' } : { right: 24, bottom: 24 }
  } else if (mobile) card = { left: 12, right: 12, bottom: 'calc(84px + env(safe-area-inset-bottom))' }

  return (
    <div className="gd-tour" aria-live="polite">
      {box ? <div className="gd-spot" style={box} /> : <div className="gd-dim" />}
      <div className="gd-card rise" key={step} style={card} role="dialog" aria-label={s.title}>
        <div className="row" style={{ gap: 10, marginBottom: 6 }}><Avatar /><b className="grow">{s.title}</b><span className="tiny muted num">{step + 1} / {cfg.steps.length}</span></div>
        <p className="gd-text" style={{ margin: '0 0 12px' }}>{busy ? 'Starting a live run for you…' : s.body}</p>
        <div className="gd-dots">{cfg.steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}</div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="gd-skip" onClick={() => onEnd(false)}>End tour</button>
          <span className="grow" />
          {step > 0 && <button className="btn sm ghost" onClick={() => setStep(step - 1)}>Back</button>}
          {last ? <button className="btn sm blue" onClick={() => onEnd(true)}>Ask me anything</button> : <button className="btn sm blue" disabled={busy} onClick={() => setStep(step + 1)}>Next</button>}
        </div>
      </div>
    </div>
  )
}

// ---------------- chat ----------------
function Chat({ cfg, page, path, onClose, onTour }: { cfg: GuideConfig; page: PageInfo; path: string; onClose: () => void; onTour: () => void }) {
  const intro = useCallback((): Msg => ({ from: 'bot', text: `You're on ${page.title}. ${page.about}`, chips: [...page.questions.slice(0, 3), 'Take the tour'] }), [page])
  const [msgs, setMsgs] = useState<Msg[]>(() => [intro()])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const lastPage = useRef(page.prefix)
  useEffect(() => { if (lastPage.current !== page.prefix) { lastPage.current = page.prefix; setMsgs(m => [...m, intro()]) } }, [page, intro])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  async function ask(text: string) {
    const t = text.trim(); if (!t || busy) return
    if (t === 'Take the tour') return onTour()
    setQ(''); setMsgs(m => [...m, { from: 'you', text: t }]); setBusy(true)
    try {
      const history = msgs.slice(-6).map(m => ({ from: m.from, text: m.text }))
      const r = await fetch('/api/guide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: t, path, history }) })
      const j = await r.json()
      setMsgs(m => [...m, { from: 'bot', text: j.answer || 'Sorry, I could not answer that just now.', chips: j.followups }])
    } catch { setMsgs(m => [...m, { from: 'bot', text: 'I could not reach the server just now. Try again in a moment.' }]) }
    setBusy(false)
  }

  return (
    <div className="gd-panel gd-chat rise" role="dialog" aria-label={`Ask ${cfg.name}`}>
      <div className="gd-head"><Avatar /><div className="grow"><b>{cfg.name}</b><div className="tiny muted">Ask me about any page in {cfg.app}</div></div><button className="gd-x" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="gd-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`gd-msg ${m.from}`}>
            <div className="gd-bubble">{m.text}</div>
            {m.chips && i === msgs.length - 1 && <div className="gd-chips">{m.chips.map(c => <button key={c} onClick={() => ask(c)}>{c}</button>)}</div>}
          </div>
        ))}
        {busy && <div className="gd-msg bot"><div className="gd-bubble gd-typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      <form className="gd-input" onSubmit={e => { e.preventDefault(); ask(q) }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Ask about ${page.title.toLowerCase()}…`} aria-label="Your question" />
        <button className="btn sm blue" disabled={!q.trim() || busy}>Ask</button>
      </form>
    </div>
  )
}
