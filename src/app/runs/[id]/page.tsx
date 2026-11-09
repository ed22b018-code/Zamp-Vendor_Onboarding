'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DotWordmark } from '@/components/DotWordmark'
import { IBack, ICheck, ICopy, IDownload, IExternal, IInfo, IMail, IRefresh, ISend, IX } from '@/components/icons'
import { ByChip, CheckIcon, Confidence, DECISION_META, DecisionPill, StageIcon, useToast } from '@/components/ui'
import { streamRun } from '@/lib/client'
import type { AuditEntry, Decision, DocReading, Run, Severity, Stage } from '@/lib/types'
import { DOC_LABEL } from '@/lib/types'
import { fmtDateTime } from '@/lib/util'

const PLAIN: Record<string, string> = {
  intake: 'Take in the form and documents, fingerprint each file', complete: 'Required fields and documents for this business type', read: 'Gemini reads every document and checks it is what it claims to be',
  format: 'GSTIN check digit, PAN, IFSC (or foreign tax ID, SWIFT, IBAN), PIN, email', cross: 'Form vs documents: names, PAN inside GSTIN, state, business type', verify: 'GST registry, IFSC directory, bank account holder',
  fraud: 'Bank account or GSTIN already used, blocklist, shared contacts', decide: 'Apply onboarding policy to every finding, score the risk', explain: 'Reasoning for the reviewer and an exact ask for the vendor', record: 'Vendor master on approval, case timeline, audit trail',
}
const SEV: Record<Severity, { cls: string; label: string }> = { reject: { cls: 'reject', label: 'Reject' }, vendor: { cls: 'hold', label: 'Vendor must fix' }, review: { cls: 'review', label: 'Reviewer decides' }, info: { cls: 'info', label: 'Note' } }
type Round = { id: string; round: number; created_at: string; source: string; decision: Decision | null; waiting_on: 'vendor' | 'reviewer' | null; changes: string[]; status: string; headline: string | null }

export default function RunPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const [run, setRun] = useState<Run | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'compare' | 'docs' | 'timeline' | 'audit'>('compare')
  const [now, setNow] = useState(Date.now())
  const started = useRef<number>(Date.now())
  const refresh = () => fetch(`/api/runs/${id}`, { cache: 'no-store' }).then(x => x.json()).then(x => { if (x.run) { setRun(x.run); setAudit(x.audit || []); setRounds(x.rounds || []) } })

  useEffect(() => {
    const ctl = new AbortController(); let alive = true
    ;(async () => {
      const r = await fetch(`/api/runs/${id}`, { cache: 'no-store' }); const j = await r.json()
      if (!r.ok) { setErr(j.error || 'Run not found'); return }
      if (!alive) return
      setRun(j.run); setAudit(j.audit); setRounds(j.rounds || [])
      if (j.run.status === 'queued' || j.run.status === 'running') {
        started.current = Date.now()
        await streamRun(id, e => {
          if (!alive) return
          if (e.type === 'stage') setRun(prev => prev && { ...prev, status: 'running', stages: prev.stages.map(s => (s.key === e.stage.key ? e.stage : s)) })
          if (e.type === 'reading') setRun(prev => prev && { ...prev, reading: e.reading, reading_source: e.source })
          if (e.type === 'notice') setNotices(n => [...n, e.message])
          if (e.type === 'done') { setRun(e.run); refresh() }
          if (e.type === 'error') setErr(e.message)
        }, { signal: ctl.signal }).catch(() => {})
      }
    })()
    return () => { alive = false; ctl.abort() }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const running = run && (run.status === 'running' || run.status === 'queued')
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t) }, [running])
  useEffect(() => { if (run?.status === 'done') setOpen(o => Object.keys(o).length ? o : Object.fromEntries(run.stages.filter(s => s.status === 'fail' || s.status === 'warn').map(s => [s.key, true]))) }, [run?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !run) return <div className="page"><div className="card empty"><h3>{err}</h3><Link className="btn" href="/inbox">Back to inbox</Link></div></div>
  if (!run) return <div className="page"><div className="card empty">Loading…</div></div>

  const sub = run.submission
  const current = run.stages.find(s => s.status === 'running')
  const doneCount = run.stages.filter(s => !['pending', 'running'].includes(s.status)).length
  const elapsed = run.duration_ms != null ? run.duration_ms / 1000 : (now - started.current) / 1000
  const final = run.final_decision || run.decision
  async function rerun() {
    const r = await fetch(`/api/runs/${id}/rerun`, { method: 'POST' }); const j = await r.json()
    if (!r.ok) return toast(j.error || 'Could not re-run')
    router.push(`/runs/${j.id}`)
  }

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <Link href="/inbox" className="btn sm ghost"><IBack />Inbox</Link>
        <span className="right" />
        {run.status === 'done' && run.outcome?.waiting_on === 'vendor' && final === 'pending' && !run.superseded_by && <Link className="btn sm ghost" href={`/fix/${run.case_id}`} target="_blank" title="The page the vendor sees from the link in the email"><IExternal /><span className="hide-m">Vendor's fix link</span><span className="only-m">Fix link</span></Link>}
        {run.status === 'done' && <Link className="btn sm ghost" href={`/runs/${id}/record`} title="One-page record of this decision, ready to print or save as PDF"><IDownload /><span className="hide-m">Decision record</span><span className="only-m">Record</span></Link>}
        {run.status === 'done' && !run.superseded_by && final !== 'approved' && !run.review && <button className="btn sm ghost" onClick={rerun} title="Run this submission again under the current rules"><IRefresh /><span className="hide-m">Re-run with current rules</span><span className="only-m">Re-run</span></button>}
      </div>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
            <DecisionPill d={run.status === 'done' ? final : null} waiting={run.outcome?.waiting_on} reviewed={!!run.review} />
            {run.round > 1 && <span className="pill blue">Round {run.round}</span>}
            {run.reading_source && <span className={`pill ${run.reading_source !== 'cached' ? 'violet' : ''}`} title={run.reading_source === 'ai' ? 'Read live by Gemini' : run.reading_source === 'reused' ? 'These exact files (same SHA-256) were read by Gemini before; those readings were reused' : 'Saved Gemini reading of these sample documents (live AI unavailable)'}><span className="dot" />{run.reading_source === 'ai' ? `Read live by Gemini${run.reading_model ? ' · ' + run.reading_model.replace('gemini-', '') : ''}` : run.reading_source === 'reused' ? 'AI readings reused (same files)' : 'Saved AI reading'}</span>}
            {run.source === 'portal' && <span className="pill">Vendor portal</span>}
          </div>
          <h1 className="ellipsis">{sub.trade_name || sub.legal_name}</h1>
          <p>{sub.trade_name ? `${sub.legal_name} · ` : ''}{sub.business_type} · {sub.address.city}, {sub.address.state} · <span className="mono">{sub.country && sub.country !== 'India' ? `${sub.country} · ${sub.tax_id}` : sub.gstin}</span></p>
        </div>
      </div>

      {run.superseded_by && <div className="notice amber" style={{ marginBottom: 14 }}><IInfo /><span>A newer round of this case exists. <Link href={`/runs/${run.superseded_by}`} style={{ textDecoration: 'underline', fontWeight: 600 }}>Open the latest round</Link></span></div>}
      {run.round > 1 && run.changes.length > 0 && <div className="notice" style={{ marginBottom: 14 }}><IInfo /><span><b>Round {run.round}:</b> {run.changes.join('; ')}.</span></div>}
      {notices.length > 0 && <div className="notices">{notices.slice(-3).map((n, i) => <div key={i} className="notice"><IInfo /><span>{n}</span></div>)}</div>}
      {run.status === 'error' && <div className="notice red" style={{ marginBottom: 14 }}><IX /><span>{run.error}</span></div>}

      <div className="run-grid">
        <div className="card">
          <div className="card-head">
            <div className="grow"><b>Live run</b><div className="tiny muted">{running ? `Stage ${Math.min(doneCount + 1, 10)} of 10 · ${current?.title || 'starting'}…` : `10 stages · ${elapsed.toFixed(1)}s`}</div></div>
            <span className="num small muted">{elapsed.toFixed(1)}s</span>
          </div>
          <div className="bar" style={{ borderRadius: 0, height: 3 }}><i style={{ width: `${(doneCount / 10) * 100}%`, borderRadius: 0, background: running || !final ? 'var(--blue)' : DECISION_META[final].color }} /></div>
          <div className="timeline">
            {run.stages.map(s => <StageRow key={s.key} s={s} open={!!open[s.key] || s.status === 'running'} toggle={() => setOpen(o => ({ ...o, [s.key]: !o[s.key] }))} />)}
          </div>
        </div>

        <div className="run-side">
          <DecisionCard run={run} onReviewed={() => refresh()} />
          <div className="card">
            <div className="card-head" style={{ paddingTop: 12, paddingBottom: 12 }}>
              <div className="seg" style={{ overflowX: 'auto', maxWidth: '100%' }}>
                {([['compare', 'Form vs documents'], ['docs', 'Documents'], ['timeline', `Case${rounds.length > 1 ? ` (${rounds.length})` : ''}`], ['audit', 'Audit']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
              </div>
            </div>
            {tab === 'compare' && <Compare run={run} />}
            {tab === 'docs' && <Docs run={run} />}
            {tab === 'timeline' && <Timeline rounds={rounds} current={run.id} />}
            {tab === 'audit' && (
              <div className="audit">{audit.length ? audit.map(a => <div key={a.id} className="a"><span className="muted num">{fmtDateTime(a.at)}</span><span><b>{a.actor}</b> · {a.action.replace(':', ' → ')}<div className="muted">{a.detail}</div></span></div>) : <div className="empty small">No audit entries yet</div>}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StageRow({ s, open, toggle }: { s: Stage; open: boolean; toggle: () => void }) {
  return (
    <div className={`stg ${s.status}`}>
      <span className="ic"><StageIcon s={s.status} /></span>
      <div className="head" onClick={toggle} role="button" aria-expanded={open}>
        <div className="t1">{s.title}<ByChip by={s.by} />{s.ms != null && s.status !== 'skip' && <span className="tiny faint num" style={{ fontWeight: 500 }}>{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>}{s.checks.length > 0 && <span className="tiny faint right" style={{ fontWeight: 500 }}>{open ? 'Hide' : `${s.checks.length} checks`}</span>}</div>
        <div className="t2">{s.summary || (s.status === 'running' ? PLAIN[s.key] + '…' : PLAIN[s.key])}</div>
      </div>
      {open && s.checks.length > 0 && <div className="checks rise">{s.checks.map((c, i) => <div key={i} className={`ck ${c.status}`}><CheckIcon s={c.status} /><span className="lab">{c.label}</span><span className="det">{c.detail}</span></div>)}</div>}
    </div>
  )
}

function Risk({ v, threshold }: { v: number; threshold: number }) {
  const c = v >= threshold ? 'var(--red)' : v >= threshold * 0.6 ? 'var(--amber)' : 'var(--green)'
  return <span className="row" style={{ gap: 8 }} title={`Reviewer threshold ${threshold}`}><span className="risk"><i style={{ width: `${Math.max(3, v)}%`, background: c }} /><b style={{ left: `${threshold}%` }} /></span><b className="num" style={{ color: 'var(--ink)' }}>{v}</b><span>/100 risk</span></span>
}

function DecisionCard({ run, onReviewed }: { run: Run; onReviewed: () => void }) {
  const toast = useToast()
  const o = run.outcome
  const d: Decision | null = run.status === 'done' ? run.final_decision || run.decision : null
  const meta = d ? DECISION_META[d] : null
  const palette = useMemo(() => (meta ? [meta.color, meta.color, '#4f46e5', '#a5b4fc'] : ['#4f46e5']), [meta])
  const [note, setNote] = useState(''), [who, setWho] = useState(''), [saving, setSaving] = useState(false)
  async function review(action: 'approve' | 'reject' | 'request') {
    setSaving(true)
    const r = await fetch(`/api/runs/${run.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, note, reviewer: who || 'Reviewer' }) })
    const j = await r.json(); setSaving(false)
    if (!r.ok) return toast(j.error || 'Could not save')
    setNote(''); onReviewed()
    toast(action === 'approve' ? `Approved: vendor ${j.run.outcome?.vendor_id} created` : action === 'reject' ? 'Rejected and logged' : 'Question sent: the case now waits on the vendor')
  }
  if (run.status === 'error') return <div className="card decision reject"><div className="top"><h2>Run failed</h2><p className="sum">{run.error}</p></div></div>
  const reviewerOpen = d === 'pending' && o?.waiting_on === 'reviewer' && !run.review && !run.superseded_by
  return (
    <div className={`card decision ${meta?.cls || 'wait'}`}>
      <div className="top">
        <div className="stamp"><DotWordmark key={d || 'wait'} lines={[meta ? meta.word : 'CHECKING']} label={meta ? meta.label : 'Checking'} ink={meta ? meta.color : '#c7c7cc'} palette={palette} density={0.62} /></div>
        {o ? <><h2>{o.headline}</h2><p className="sum">{o.summary}</p></> : <><h2>Working through the checks…</h2><p className="sum">The decision appears here the moment the rules have run.</p></>}
        {o && <div className="row wrap small muted" style={{ marginTop: 10, gap: 14 }}>
          <Risk v={o.risk} threshold={run.settings_snapshot?.riskReviewThreshold ?? 50} />
          {o.vendor_id && <span>Vendor ID <b className="num" style={{ color: 'var(--ink)' }}>{o.vendor_id}</b></span>}
          <span>{o.explained_by === 'ai' ? 'Explained by Gemini' : 'Explained from templates'}</span>
        </div>}
      </div>
      {o && o.findings.length > 0 && <>
        <div className="sec-title">Why: rules that fired</div>
        {o.findings.map((f, i) => <div key={i} className={`finding ${SEV[f.severity].cls}`}><span className="sv" /><div><b>{f.title}<span className="code">{f.code}</span></b><p>{f.detail}</p>{f.severity !== 'info' && <span className={`sevtag ${SEV[f.severity].cls}`}>{SEV[f.severity].label}</span>}</div></div>)}
      </>}
      {o && o.findings.length === 0 && <div className="finding info"><span className="sv" style={{ background: 'var(--green)' }} /><div><b>No exceptions</b><p>Documents, GST registry, bank account holder and fraud screening all check out.</p></div></div>}
      {o && o.asks.length > 0 && d === 'pending' && <>
        <div className="sec-title">Asked of the vendor</div>
        <ol className="steps">{o.asks.map((a, i) => <li key={i}>{a.text}</li>)}</ol>
      </>}
      {o && <><div className="sec-title">Next steps</div><ol className="steps">{o.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
      {o?.vendor_email && <>
        <div className="sec-title">Email to the vendor</div>
        <div className="email">
          <div className="eh"><span><span className="muted">To</span> {o.vendor_email.to}</span><span><span className="muted">Subject</span> <b>{o.vendor_email.subject}</b></span></div>
          <pre>{o.vendor_email.body}</pre>
          <div className="row wrap" style={{ padding: '8px 10px', borderTop: '1px solid var(--line)', background: '#fafafc', gap: 6 }}>
            <button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(`Subject: ${o.vendor_email!.subject}\n\n${o.vendor_email!.body}`); toast('Email copied') }}><ICopy />Copy</button>
            <a className="btn sm ghost" href={`mailto:${o.vendor_email.to}?subject=${encodeURIComponent(o.vendor_email.subject)}&body=${encodeURIComponent(o.vendor_email.body)}`}><IMail />Open in mail</a>
            {o.waiting_on === 'vendor' && d === 'pending' && !run.superseded_by && <Link className="btn sm ghost" href={`/fix/${run.case_id}`} target="_blank"><IExternal />Open fix link as the vendor</Link>}
          </div>
        </div>
      </>}
      {reviewerOpen && (
        <div className="review-box stack" style={{ gap: 10 }}>
          <b>Reviewer decision</b>
          <input className="input" style={{ maxWidth: 220 }} placeholder="Your name" value={who} onChange={e => setWho(e.target.value)} />
          <textarea className="input" placeholder="Note for the audit trail, or the question for the vendor, e.g. 'Called Arun Kumar on the number given; confirmed the Ritchie Street shop.'" value={note} onChange={e => setNote(e.target.value)} />
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn green" disabled={saving || note.trim().length < 3} onClick={() => review('approve')}><ICheck />Approve and create vendor</button>
            <button className="btn ghost" disabled={saving || note.trim().length < 3} onClick={() => review('request')}><ISend />Ask the vendor</button>
            <button className="btn red" disabled={saving || note.trim().length < 3} onClick={() => review('reject')}><IX />Reject</button>
            {note.trim().length < 3 && <span className="tiny muted">A note is required</span>}
          </div>
        </div>
      )}
      {run.review && (
        <div className="review-box">
          <div className="row"><DecisionPill d={run.final_decision} reviewed /><span className="small muted right">{fmtDateTime(run.review.at)}</span></div>
          <p className="small" style={{ margin: '8px 0 0' }}><b>{run.review.reviewer}:</b> {run.review.note}</p>
        </div>
      )}
    </div>
  )
}

/** Side-by-side: what the vendor typed vs what each document and external source says. */
function Compare({ run }: { run: Run }) {
  const sub = run.submission
  const docs = run.reading?.docs || []
  const by = (k: DocReading['detected']) => docs.find(d => d.detected === k)
  const gst = by('gst_certificate')?.fields, pan = by('pan_card')?.fields, chq = (by('cancelled_cheque') || by('bank_letter'))?.fields
  const ver = run.stages.find(s => s.key === 'verify')
  const vck = (label: string) => ver?.checks.find(c => c.label.startsWith(label))
  const bad = (a?: string | null, b?: string | null) => !!a && !!b && a.replace(/\W/g, '').toUpperCase() !== b.replace(/\W/g, '').toUpperCase()
  const cell = (v: string | null | undefined, ref?: string | null, soft = false) => v ? <span className={bad(v, ref) && !soft ? 'mism' : ''}>{v}</span> : <span className="faint">–</span>
  if (!run.reading) return <div className="empty small">{run.status === 'done' ? 'No documents were read.' : 'Gemini is reading the documents…'}</div>
  if (sub.country && sub.country !== 'India') {
    const cert = (by('tax_certificate') || by('gst_certificate'))?.fields, bl = (by('bank_letter') || by('cancelled_cheque'))?.fields
    const frows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
      ['Country', sub.country, cell(cert?.country, sub.country, true), cell(bl?.country, sub.country, true)],
      ['Legal name', sub.legal_name, cell(cert?.legal_name, sub.legal_name, true), cell(bl?.account_name, sub.legal_name, true)],
      ['Tax ID', <span key="t" className="mono">{sub.tax_id}</span>, <span key="tc" className="mono">{cell(cert?.tax_id || cert?.gstin, sub.tax_id)}</span>, <span key="tb" className="faint">–</span>],
      ['SWIFT', <span key="s" className="mono">{sub.bank.swift || '–'}</span>, <span key="sc" className="faint">–</span>, <span key="sb" className="mono">{cell(bl?.swift || bl?.ifsc, sub.bank.swift)}</span>],
      ['IBAN / account', <span key="i" className="mono">{sub.bank.iban || `••${sub.bank.account_number.slice(-4)}`}</span>, <span key="ic" className="faint">–</span>, <span key="ib" className="mono">{cell(bl?.iban || (bl?.account_number ? `••${bl.account_number.slice(-4)}` : null), sub.bank.iban || `••${sub.bank.account_number.slice(-4)}`)}</span>],
    ]
    return (
      <div>
        <div className="scroll-x"><table className="t cmp">
          <thead><tr><th></th><th>Form</th><th>Tax certificate</th><th>Bank letter</th></tr></thead>
          <tbody>{frows.map(([k, a, b, c]) => <tr key={k}><td className="muted">{k}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table></div>
        {ver && ver.status !== 'pending' && <dl className="kv" style={{ borderTop: '1px solid var(--line)' }}>
          {ver.checks.map(c => <div key={c.label} style={{ display: 'contents' }}><dt>{c.label}</dt><dd><span className={`ckdot ${c.status}`} />{c.detail}</dd></div>)}
        </dl>}
      </div>
    )
  }
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ['Legal name', sub.legal_name, cell(gst?.legal_name, sub.legal_name, true), cell(pan?.name, sub.legal_name, true)],
    ['GSTIN', <span key="g" className="mono">{sub.gstin}</span>, <span key="gg" className="mono">{cell(gst?.gstin, sub.gstin)}</span>, <span key="gp" className="mono faint">PAN inside: {sub.gstin.slice(2, 12)}</span>],
    ['PAN', <span key="p" className="mono">{sub.pan}</span>, <span key="pg" className="mono">{cell(sub.gstin.slice(2, 12), sub.pan)}</span>, <span key="pp" className="mono">{cell(pan?.pan, sub.pan)}</span>],
    ['Business type', sub.business_type, cell(gst?.constitution, null), <span key="bt" className="faint">PAN type: {sub.pan[3]}</span>],
    ['Bank account', <span key="b" className="mono">••{sub.bank.account_number.slice(-4)} · {sub.bank.ifsc}</span>, <span key="bc" className="mono">{chq?.account_number ? cell(`••${chq.account_number.slice(-4)} · ${chq.ifsc || ''}`, `••${sub.bank.account_number.slice(-4)} · ${sub.bank.ifsc}`) : <span className="faint">–</span>}</span>, (() => { const pd = vck('Account holder'); const h = pd?.detail?.match(/Bank says: ([^·]+)/)?.[1]?.trim() || chq?.account_name; return h ? <span key="h" className={pd?.status === 'fail' ? 'mism' : ''}>{h}</span> : <span key="h" className="faint">–</span> })()],
  ]
  return (
    <div>
      <div className="scroll-x">
        <table className="t cmp">
          <thead><tr><th></th><th>Form</th><th>GST certificate / GSTIN</th><th>PAN card / bank</th></tr></thead>
          <tbody>{rows.map(([k, a, b, c]) => <tr key={k}><td className="muted">{k}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </div>
      {ver && ver.status !== 'pending' && <dl className="kv" style={{ borderTop: '1px solid var(--line)' }}>
        {[['GST registry', vck('GST registry')], ['IFSC directory', vck('IFSC directory')], ['Bank says holder is', vck('Account holder')]].map(([k, c]) => c && typeof c !== 'string' ? <div key={k as string} style={{ display: 'contents' }}><dt>{k as string}</dt><dd><span className={`ckdot ${c.status}`} />{c.detail}</dd></div> : null)}
      </dl>}
    </div>
  )
}

function Docs({ run }: { run: Run }) {
  const reads = new Map((run.reading?.docs || []).map(d => [d.doc_id, d]))
  return (
    <div className="docs">
      {run.submission.documents.map(d => {
        const r = reads.get(d.id)
        const url = `/api/doc/${run.id}/${d.id}`
        const wrong = r && r.detected !== d.declared && !(['cancelled_cheque', 'bank_letter'].includes(r.detected) && ['cancelled_cheque', 'bank_letter'].includes(d.declared))
        return (
          <div key={d.id} className="doc">
            <a href={url} target="_blank" rel="noreferrer" className="thumb">{d.mime.startsWith('image/') ? <img src={url} alt={d.file_name} loading="lazy" /> : <span className="pdfico">PDF</span>}</a>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small ellipsis" style={{ fontWeight: 600 }}>{DOC_LABEL[d.declared]}</div>
              <div className="tiny muted ellipsis">{d.file_name} · {Math.max(1, Math.round(d.bytes / 1024))} KB</div>
              {r && <div className="tiny" style={{ marginTop: 4 }}>{wrong ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>Actually a {DOC_LABEL[r.detected].toLowerCase()}</span> : <span className="muted">Read as {DOC_LABEL[r.detected].toLowerCase()}{r.is_scanned ? ' · scan' : ''}</span>} <Confidence v={r.confidence} /></div>}
              {r?.notes?.slice(0, 2).map((n, i) => <div key={i} className="tiny muted">• {n}</div>)}
            </div>
            <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer" aria-label="Open document"><IExternal /></a>
          </div>
        )
      })}
    </div>
  )
}

function Timeline({ rounds, current }: { rounds: Round[]; current: string }) {
  if (!rounds.length) return <div className="empty small">No rounds yet</div>
  return (
    <div className="rounds">
      {rounds.map(r => (
        <Link key={r.id} href={`/runs/${r.id}`} className={`round ${r.id === current ? 'on' : ''}`}>
          <span className="rn">{r.round}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 8 }}><b className="small">{r.source === 'resubmission' ? 'Vendor resubmitted' : r.source === 'rerun' ? 'Re-run with current rules' : r.source === 'portal' ? 'Submitted via portal' : 'Received in inbox'}</b><span className="tiny muted">{fmtDateTime(r.created_at)}</span></div>
            {r.changes.length > 0 && <div className="tiny muted">{r.changes.join('; ')}</div>}
            {r.headline && <div className="tiny" style={{ marginTop: 2 }}>{r.headline}</div>}
          </div>
          <DecisionPill d={r.status === 'done' ? r.decision : null} waiting={r.waiting_on} />
        </Link>
      ))}
    </div>
  )
}
