'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { IArrow, IDownload, ISearch } from '@/components/icons'
import { DecisionPill, useJson } from '@/components/ui'
import { computeStats, currentState, MIN_BY_HAND, type RunRow } from '@/lib/stats'
import { ago, fmtDateTime, pct } from '@/lib/util'

type Filter = 'all' | 'approved' | 'vendor' | 'reviewer' | 'rejected'

export default function Dashboard() {
  const router = useRouter()
  const { data } = useJson<RunRow[]>('/api/runs', 4000)
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const s = computeStats(data || [])
  const cases = useMemo(() => [...s.latest].sort((a, b) => b.created_at.localeCompare(a.created_at)), [s.latest])
  const shown = cases.filter(r => { const c = currentState(r); return (f === 'all' || c.decision === f || c.waiting === f) && (!q || `${r.submission.legal_name} ${r.submission.trade_name || ''} ${r.submission.gstin || ''} ${r.submission.tax_id || ''}`.toLowerCase().includes(q.toLowerCase())) })
  const maxReason = Math.max(1, ...s.reasons.map(r => r[1]))
  const waiting = cases.filter(r => currentState(r).waiting === 'vendor')

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>Dashboard</h1><p>Every vendor VETTED has checked: outcomes, how fast they get through, where they get stuck and the fraud it stopped.</p></div>
        {cases.length > 0 && <button className="btn ghost" onClick={() => exportCsv(cases)}><IDownload />Export CSV</button>}
        <Link href="/inbox" className="btn ghost">Process more <IArrow /></Link>
      </div>
      {!data ? <div className="card empty">Loading…</div> : cases.length === 0 ? (
        <div className="card empty"><h3>No registrations checked yet</h3><p>Open the onboarding inbox and run the checks on a submission, or all twelve at once.</p><Link href="/inbox" className="btn blue" style={{ marginTop: 10 }}>Open the inbox <IArrow /></Link></div>
      ) : <>
        <div className="grid-6">
          <Kpi k="Vendors checked" v={String(s.cases)} sub={`${s.rounds} rounds of checks`} />
          <Kpi k="Approved" v={String(s.approved)} sub={`${pct(s.firstPassRate, 0)} first time, no back-and-forth`} />
          <Kpi k="Waiting on vendor" v={String(s.waitingVendor)} sub="fix link sent, exact ask" />
          <Kpi k="Needs a reviewer" v={String(s.waitingReviewer)} sub="judgement calls only" />
          <Kpi k="Fraud stopped" v={String(s.fraud)} sub={`${s.rejected} rejected in total`} />
          <Kpi k="Avg. time / check" v={`${s.avgSecs.toFixed(1)}s`} sub={`${Math.max(0, s.hoursSaved).toFixed(1)} h of procurement time saved`} />
        </div>
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card card-pad">
            <h2>Outcomes</h2>
            <div className="split" style={{ marginTop: 16 }}>
              <i style={{ width: `${(s.approved / s.cases) * 100}%`, background: 'var(--green)' }} />
              <i style={{ width: `${(s.waitingVendor / s.cases) * 100}%`, background: '#f0a020' }} />
              <i style={{ width: `${(s.waitingReviewer / s.cases) * 100}%`, background: 'var(--violet)' }} />
              <i style={{ width: `${(s.rejected / s.cases) * 100}%`, background: 'var(--red)' }} />
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--green)' }} />Approved {s.approved}</span>
              <span><i style={{ background: '#f0a020' }} />Waiting on vendor {s.waitingVendor}</span>
              <span><i style={{ background: 'var(--violet)' }} />Needs review {s.waitingReviewer}</span>
              <span><i style={{ background: 'var(--red)' }} />Rejected {s.rejected}</span>
            </div>
            <div className="divider" />
            <table className="t" style={{ fontSize: 13.5 }}><tbody>
              <tr><td style={{ padding: '7px 0' }}>Approved first time</td><td className="r num" style={{ padding: '7px 0' }}>{pct(s.firstPassRate, 0)}</td></tr>
              <tr><td style={{ padding: '7px 0' }}>Average rounds to approval</td><td className="r num" style={{ padding: '7px 0' }}>{s.avgRounds ? s.avgRounds.toFixed(1) : '-'}</td></tr>
              <tr><td style={{ padding: '7px 0' }}>Cases closed without a person</td><td className="r num" style={{ padding: '7px 0' }}>{s.cases - s.waitingReviewer - cases.filter(r => r.review).length}</td></tr>
            </tbody></table>
            {waiting.length > 0 && <><div className="divider" /><div className="small"><b>Waiting on vendors</b>{waiting.map(r => <div key={r.id} className="row" style={{ marginTop: 6 }}><Link href={`/runs/${r.id}`} className="ellipsis grow" style={{ color: 'var(--blue)' }}>{r.submission.trade_name || r.submission.legal_name}</Link><span className="tiny muted">{r.outcome?.asks.length} item(s) · asked {ago(r.created_at)}</span></div>)}</div></>}
          </div>
          <div className="card card-pad">
            <h2>Where vendors get stuck</h2>
            <div style={{ marginTop: 10 }}>
              {s.reasons.length ? s.reasons.map(([t, n]) => <div key={t} className="hbar"><span>{t}</span><span className="track"><i style={{ width: `${(n / maxReason) * 100}%` }} /></span><span className="num small muted r">{n}</span></div>) : <div className="small muted">No exceptions yet, everything was approved.</div>}
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head wrap" style={{ gap: 10 }}>
            <b>All vendors</b>
            <div className="seg" style={{ overflowX: 'auto', maxWidth: '100%' }}>{([['all', 'All'], ['approved', 'Approved'], ['vendor', 'Waiting on vendor'], ['reviewer', 'Needs review'], ['rejected', 'Rejected']] as [Filter, string][]).map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
            <div className="right row" style={{ position: 'relative', minWidth: 200 }}>
              <ISearch style={{ position: 'absolute', left: 10, width: 16, color: 'var(--faint)' }} />
              <input className="input" style={{ height: 34, paddingLeft: 32, borderRadius: 99 }} placeholder="Search vendor or tax ID" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="scroll-x t-desktop">
            <table className="t">
              <thead><tr><th>Vendor</th><th>Type</th><th>GSTIN / tax ID</th><th>Status</th><th className="r">Risk</th><th className="r">Rounds</th><th>Main reason</th><th>Vendor ID</th><th>When</th></tr></thead>
              <tbody>{shown.map(r => { const c = currentState(r); const main = r.outcome?.findings.find(x => x.severity !== 'info'); return (
                <tr key={r.id} className="click" onClick={() => router.push(`/runs/${r.id}`)}>
                  <td style={{ fontWeight: 600, maxWidth: 220 }} className="ellipsis">{r.submission.trade_name || r.submission.legal_name}</td>
                  <td className="small muted">{r.submission.business_type}</td>
                  <td className="mono small">{r.submission.country && r.submission.country !== 'India' ? <>{r.submission.tax_id}<div className="tiny muted" style={{ fontFamily: 'inherit' }}>{r.submission.country}</div></> : r.submission.gstin}</td>
                  <td><DecisionPill d={c.decision} waiting={c.waiting} reviewed={!!r.review} /></td>
                  <td className="r num">{r.outcome?.risk ?? '-'}</td>
                  <td className="r num">{r.round}</td>
                  <td className="small muted ellipsis" style={{ maxWidth: 260 }}>{main?.title || (c.decision === 'approved' ? 'All checks passed' : '-')}</td>
                  <td className="mono small">{r.outcome?.vendor_id || '-'}</td>
                  <td className="small muted" title={fmtDateTime(r.created_at)}>{ago(r.created_at)}</td>
                </tr>) })}</tbody>
            </table>
          </div>
          <div className="rcard">
            {shown.map(r => { const c = currentState(r); return (
              <Link key={r.id} href={`/runs/${r.id}`} className="mail"><div className="grow">
                <div className="row"><span className="from ellipsis grow">{r.submission.trade_name || r.submission.legal_name}</span><span className="tiny muted">risk {r.outcome?.risk ?? '-'}</span></div>
                <div className="subj ellipsis">{r.outcome?.findings.find(x => x.severity !== 'info')?.title || 'All checks passed'}</div>
                <div className="row" style={{ marginTop: 6 }}><DecisionPill d={c.decision} waiting={c.waiting} reviewed={!!r.review} /><span className="tiny muted right">{r.round > 1 ? `round ${r.round} · ` : ''}{ago(r.created_at)}</span></div>
              </div></Link>) })}
          </div>
          {!shown.length && <div className="empty small">No vendors match.</div>}
        </div>
        <p className="tiny faint" style={{ marginTop: 10 }}>Time saved assumes about {MIN_BY_HAND} minutes for a person to check one registration by hand (documents, GST portal, bank, duplicates) and 10 minutes for a reviewer to clear a pre-analysed case. GST registry and penny-drop results are simulated; IFSC lookups are live. Foreign tax IDs and IBANs are checked offline by their published check-digit rules.</p>
      </>}
    </div>
  )
}

function Kpi({ k, v, sub }: { k: string; v: string; sub: string }) { return <div className="card kpi"><div className="k">{k}</div><div className="v">{v}</div><div className="s">{sub}</div></div> }

function exportCsv(rows: RunRow[]) {
  const esc = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const head = ['Checked at', 'Legal name', 'Trade name', 'Business type', 'Country', 'GSTIN / tax ID', 'PAN', 'Status', 'Waiting on', 'Risk', 'Rounds', 'Vendor ID', 'Main reason', 'All rules fired', 'Reviewer', 'Reviewer note']
  const out = rows.map(r => { const c = currentState(r); return [r.created_at, r.submission.legal_name, r.submission.trade_name, r.submission.business_type, r.submission.country || 'India', r.submission.country && r.submission.country !== 'India' ? r.submission.tax_id : r.submission.gstin, r.submission.pan, c.decision, c.waiting, r.outcome?.risk, r.round, r.outcome?.vendor_id, r.outcome?.findings.find(x => x.severity !== 'info')?.title || 'All checks passed', (r.outcome?.findings || []).map(x => x.code).join(' '), r.review?.reviewer, r.review?.note] })
  const csv = '﻿' + [head, ...out].map(r => r.map(esc).join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `vetted-vendors-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
}
