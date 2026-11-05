'use client'
import Link from 'next/link'
import { IArrow, ICheck } from '@/components/icons'
import { DecisionPill, useJson } from '@/components/ui'
import { computeStats, currentState, type RunRow } from '@/lib/stats'
import { ago } from '@/lib/util'

export default function Review() {
  const { data } = useJson<RunRow[]>('/api/runs', 5000)
  const { latest } = computeStats(data || [])
  const open = latest.filter(r => currentState(r).waiting === 'reviewer').sort((a, b) => (b.outcome?.risk || 0) - (a.outcome?.risk || 0))
  const vendor = latest.filter(r => currentState(r).waiting === 'vendor').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const done = latest.filter(r => r.review)
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Review queue</h1><p>Only the judgement calls reach a person. Each case arrives pre-analysed with the reason and the evidence. Sorted by risk.</p></div></div>
      {!data ? <div className="card empty">Loading…</div> : open.length === 0 ? (
        <div className="card empty"><div style={{ width: 44, height: 44, borderRadius: 99, background: 'var(--green-soft)', color: 'var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto' }}><ICheck style={{ width: 22 }} /></div><h3>Queue is clear</h3><p>No registrations are waiting for a reviewer.</p><Link href="/inbox" className="btn ghost" style={{ marginTop: 6 }}>Go to inbox</Link></div>
      ) : (
        <div className="stack">{open.map(r => { const f = r.outcome?.findings.filter(x => x.severity !== 'info') || []; return (
          <Link key={r.id} href={`/runs/${r.id}`} className="card qcard rise">
            <div className="grow">
              <div className="row wrap" style={{ gap: 8 }}><b style={{ fontSize: 16 }}>{r.submission.trade_name || r.submission.legal_name}</b><span className="small muted">{r.submission.business_type} · {r.submission.address.city}</span>{r.round > 1 && <span className="pill blue">Round {r.round}</span>}</div>
              <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--violet)' }}>{f[0]?.title}</div>
              <div className="small muted" style={{ marginTop: 2 }}>{f[0]?.detail}</div>
              {f.length > 1 && <div className="tiny muted" style={{ marginTop: 6 }}>+ {f.length - 1} more: {f.slice(1, 4).map(x => x.title).join(' · ')}</div>}
            </div>
            <div style={{ textAlign: 'right' }} className="stack">
              <span className="amt">{r.outcome?.risk}<span className="small muted">/100</span></span>
              <span className="tiny muted">waiting {ago(r.created_at)}</span>
              <span className="btn sm" style={{ alignSelf: 'flex-end' }}>Review <IArrow /></span>
            </div>
          </Link>) })}</div>
      )}
      {vendor.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <div className="card-head"><b>Waiting on vendors</b><span className="right small muted">fix link sent · oldest first</span></div>
          {vendor.map(r => (
            <Link key={r.id} href={`/runs/${r.id}`} className="mail"><div className="grow">
              <div className="row"><span className="from grow ellipsis">{r.submission.trade_name || r.submission.legal_name}</span><DecisionPill d="pending" waiting="vendor" /></div>
              <div className="subj ellipsis">{r.outcome?.asks.map(a => a.text).join(' · ')}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>Asked {ago(r.created_at)}{r.round > 1 ? ` · round ${r.round}` : ''}</div>
            </div></Link>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <div className="card-head"><b>Decided by reviewers</b></div>
          {done.map(r => (
            <Link key={r.id} href={`/runs/${r.id}`} className="mail"><div className="grow">
              <div className="row"><span className="from grow ellipsis">{r.submission.trade_name || r.submission.legal_name}</span><DecisionPill d={r.final_decision} reviewed /></div>
              <div className="subj ellipsis"><b>{r.review!.reviewer}:</b> {r.review!.note}</div>
            </div></Link>
          ))}
        </div>
      )}
    </div>
  )
}
