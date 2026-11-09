'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { IArrow, IBack, IExternal, IFile, IInfo, IPlay, IUser } from '@/components/icons'
import { avatarColor, DecisionPill, useJson, useToast } from '@/components/ui'
import { streamRun } from '@/lib/client'
import type { RunRow } from '@/lib/stats'
import { currentState } from '@/lib/stats'
import type { Decision, DocKind, Submission } from '@/lib/types'
import { DOC_LABEL } from '@/lib/types'
import { fmtDateTime } from '@/lib/util'

type SampleRow = { id: string; type: string; scenario: string; expect: Decision; title: string; email: { from: string; subject: string; body: string; received: string }; docs: { id: string; declared: DocKind; file: string; mime: string }[]; submission: Omit<Submission, 'documents'>; latest: { id: string; case_id: string; round: number; status: string; decision: Decision | null; waiting_on: 'vendor' | 'reviewer' | null } | null }
type BatchItem = { id: string; label: string; state: 'waiting' | 'running' | 'done' | 'error'; decision?: Decision; waiting?: 'vendor' | 'reviewer' | null; runId?: string; stage?: string }

async function createRun(sampleId: string): Promise<string> {
  const r = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sampleId }) })
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not start'); return j.id
}

export default function Inbox() {
  const router = useRouter()
  const toast = useToast()
  const { data: samples, reload } = useJson<SampleRow[]>('/api/samples', 6000)
  const { data: runs } = useJson<RunRow[]>('/api/runs', 6000)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState<BatchItem[] | null>(null)
  const [wide, setWide] = useState(false)
  useEffect(() => { const f = () => setWide(window.innerWidth > 820); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])

  const list = useMemo(() => [...(samples || [])].sort((a, b) => b.email.received.localeCompare(a.email.received)), [samples])
  const current = list.find(s => s.id === sel) || (wide ? list[0] : undefined)
  const fresh = list.filter(s => !s.latest)
  // Current state per case: a resubmitted case shows its latest round.
  const caseState = (caseId: string) => { const rs = (runs || []).filter(r => r.case_id === caseId && !r.superseded_by); return rs[0] ? { ...currentState(rs[0]), id: rs[0].id, round: rs[0].round } : null }
  const portal = useMemo(() => {
    const m = new Map<string, RunRow>()
    for (const r of runs || []) if (!r.sample_id && !r.superseded_by) m.set(r.case_id, r)
    return [...m.values()]
  }, [runs])

  async function process(sampleId: string) {
    setBusy(true)
    try { const id = await createRun(sampleId); router.push(`/runs/${id}`) } catch (e) { toast((e as Error).message); setBusy(false) }
  }
  async function processAll() {
    const items: BatchItem[] = fresh.map(s => ({ id: s.id, label: s.title, state: 'waiting' }))
    setBatch(items)
    for (let i = 0; i < items.length; i++) {
      const up = (p: Partial<BatchItem>) => setBatch(b => b && b.map((x, j) => (j === i ? { ...x, ...p } : x)))
      up({ state: 'running', stage: 'Starting' })
      try {
        const runId = await createRun(items[i].id); up({ runId })
        await streamRun(runId, e => {
          if (e.type === 'stage' && e.stage.status === 'running') up({ stage: e.stage.title })
          if (e.type === 'done') up({ state: 'done', decision: e.run.decision || undefined, waiting: e.run.outcome?.waiting_on })
          if (e.type === 'error') up({ state: 'error', stage: e.message })
        }, { fast: true })
      } catch (e) { up({ state: 'error', stage: (e as Error).message }) }
    }
    reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Onboarding inbox</h1>
          <p>New vendor registrations arrive here with their documents, as they do for a procurement team. Open one and run the checks.</p>
        </div>
        <button className="btn blue" disabled={!fresh.length || busy || !!batch} onClick={processAll}><IPlay />Process all new ({fresh.length})</button>
      </div>

      <Link href="/apply" target="_blank" className="drop" style={{ marginBottom: 16 }}>
        <IUser />
        <div className="grow"><b>Try it as a vendor</b><div className="small muted">Open the vendor portal, fill in a registration with your own documents and watch it arrive here</div></div>
        <span className="btn sm ghost hide-m"><IExternal />Open portal</span>
      </Link>

      <div className={`inbox ${sel ? 'detail' : ''}`}>
        <div className="card mail-list">
          <div className="card-head"><b>Registrations</b><span className="right small muted">{fresh.length} new</span></div>
          {!samples && <div className="empty">Loading…</div>}
          {list.map(s => {
            const st = s.latest ? caseState(s.latest.case_id) : null
            const name = s.email.from.split('<')[0].trim()
            return (
              <div key={s.id} className={`mail ${current?.id === s.id ? 'on' : ''}`} onClick={() => setSel(s.id)}>
                {!s.latest && <span className="unread" />}
                <span className="av" style={{ background: avatarColor(s.title) }}>{s.title.replace(/[^A-Za-z ]/g, '').split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
                <div className="grow">
                  <div className="row"><span className="from ellipsis grow" style={{ fontWeight: s.latest ? 500 : 700 }}>{s.submission.trade_name || s.submission.legal_name}</span><span className="tiny muted">{fmtDateTime(s.email.received)}</span></div>
                  <div className="subj ellipsis">{name} · {s.submission.business_type} · {s.submission.address.city}</div>
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    <span className="tiny muted row" style={{ gap: 4 }}><IFile style={{ width: 13, height: 13 }} />{s.docs.length} documents</span>
                    <span className="right">{st ? <DecisionPill d={st.decision} waiting={st.waiting} /> : <span className="pill blue">New</span>}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {current && (
          <div className="card mail-view rise" key={current.id}>
            <div className="card-head">
              <button className="btn sm ghost only-m" onClick={() => setSel(null)} aria-label="Back"><IBack /></button>
              <div className="grow"><div style={{ fontWeight: 650, fontSize: 16 }}>{current.email.subject}</div><div className="small muted ellipsis">{current.email.from} · {fmtDateTime(current.email.received)}</div></div>
            </div>
            <div className="card-pad stack" style={{ gap: 16 }}>
              <div className="mail-body">{current.email.body}</div>
              <dl className="kv">
                <dt>Legal name</dt><dd>{current.submission.legal_name}{current.submission.trade_name ? <span className="muted"> · trades as {current.submission.trade_name}</span> : null}</dd>
                <dt>Business type</dt><dd>{current.submission.business_type} · {current.submission.category}{current.submission.msme ? ' · MSME' : ''}</dd>
                {current.submission.country && current.submission.country !== 'India' ? <>
                <dt>Country · Tax ID</dt><dd>{current.submission.country} · <span className="mono">{current.submission.tax_id}</span></dd>
                <dt>Bank</dt><dd>{current.submission.bank.bank_name} ••{current.submission.bank.account_number.slice(-4)} · <span className="mono">{current.submission.bank.swift}</span></dd>
                </> : <>
                <dt>GSTIN · PAN</dt><dd className="mono">{current.submission.gstin} · {current.submission.pan}</dd>
                <dt>Bank</dt><dd>{current.submission.bank.bank_name} ••{current.submission.bank.account_number.slice(-4)} · <span className="mono">{current.submission.bank.ifsc}</span></dd>
                </>}
                <dt>Sponsor</dt><dd>{current.submission.sponsor ? `${current.submission.sponsor.name}, ${current.submission.sponsor.department}` : <span className="muted">None named</span>}</dd>
              </dl>
              <div className="stack" style={{ gap: 8 }}>
                {current.docs.map(d => (
                  <div key={d.id} className="attach">
                    <span className="ico">{d.file.split('.').pop()!.toUpperCase()}</span>
                    <div className="grow"><div className="small ellipsis" style={{ fontWeight: 600 }}>{d.file}</div><div className="tiny muted">Uploaded as {DOC_LABEL[d.declared].toLowerCase()}</div></div>
                    <a className="btn sm ghost" href={`/samples/${current.id}/${d.file}`} target="_blank" rel="noreferrer"><IExternal />View</a>
                  </div>
                ))}
              </div>
              <div className="notice"><IInfo /><span><b>{current.type}:</b> {current.scenario}.</span></div>
              {current.latest ? (() => { const st = caseState(current.latest.case_id); return (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="row wrap"><span className="small muted">{st && st.round > 1 ? `Round ${st.round}` : 'Checked'}</span>{st && <DecisionPill d={st.decision} waiting={st.waiting} />}</div>
                  <div className="row wrap">
                    <Link className="btn" href={`/runs/${st?.id || current.latest.id}`}>Open the case <IArrow /></Link>
                    {st?.waiting === 'vendor' && <Link className="btn ghost" href={`/fix/${current.latest.case_id}`} target="_blank"><IExternal />Vendor's fix link</Link>}
                  </div>
                </div>) })() : (
                <button className="btn lg blue" disabled={busy} onClick={() => process(current.id)} style={{ alignSelf: 'flex-start' }}><IPlay />{busy ? 'Starting…' : 'Run the checks'}</button>
              )}
            </div>
          </div>
        )}
      </div>

      {portal.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><b>From the vendor portal</b></div>
          {portal.map(r => { const st = currentState(r); return (
            <Link key={r.id} href={`/runs/${r.id}`} className="mail">
              <span className="av" style={{ background: avatarColor(r.submission.legal_name) }}>{r.submission.legal_name.slice(0, 2).toUpperCase()}</span>
              <div className="grow"><div className="from ellipsis">{r.submission.trade_name || r.submission.legal_name}</div><div className="subj ellipsis">{r.submission.contact.name} · {r.submission.documents.length} documents{r.round > 1 ? ` · round ${r.round}` : ''}</div></div>
              <DecisionPill d={r.status === 'done' ? st.decision : null} waiting={st.waiting} />
            </Link>) })}
        </div>
      )}

      {batch && (
        <div className="batch" onClick={e => { if (e.target === e.currentTarget && batch.every(b => b.state === 'done' || b.state === 'error')) setBatch(null) }}>
          <div className="card">
            <div className="card-head"><b>Checking {batch.length} registrations</b><span className="right small muted">{batch.filter(b => b.state === 'done').length}/{batch.length}</span></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <div className="bar"><i style={{ width: `${(batch.filter(b => b.state === 'done' || b.state === 'error').length / batch.length) * 100}%` }} /></div>
              {batch.map(b => (
                <div key={b.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="grow"><div className="small ellipsis" style={{ fontWeight: 600 }}>{b.label}</div><div className="tiny muted ellipsis">{b.state === 'waiting' ? 'Queued' : b.state === 'running' ? b.stage + '…' : b.state === 'error' ? b.stage : 'Done'}</div></div>
                  {b.state === 'done' && b.runId ? <Link href={`/runs/${b.runId}`}><DecisionPill d={b.decision} waiting={b.waiting} /></Link> : b.state === 'running' ? <span className="pill live blue"><span className="dot" />Running</span> : b.state === 'error' ? <span className="pill reject">Error</span> : <span className="pill">Queued</span>}
                </div>
              ))}
              {batch.every(b => b.state === 'done' || b.state === 'error') && (
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <Link href="/dashboard" className="btn blue">View dashboard <IArrow /></Link>
                  <Link href="/review" className="btn ghost">Open review queue</Link>
                  <button className="btn ghost right" onClick={() => setBatch(null)}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
