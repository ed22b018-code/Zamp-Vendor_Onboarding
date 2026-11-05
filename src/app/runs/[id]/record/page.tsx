'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { IBack, IDownload } from '@/components/icons'
import { DECISION_META } from '@/components/ui'
import type { AuditEntry, Run } from '@/lib/types'
import { DOC_LABEL } from '@/lib/types'
import { fmtDateTime } from '@/lib/util'

const SEV: Record<string, string> = { reject: 'Reject', vendor: 'Vendor', review: 'Reviewer', info: 'Note' }
const STAT: Record<string, string> = { pass: 'Pass', warn: 'Check', fail: 'Fail', info: 'Info', skip: 'Skipped' }

/** One-page, print-friendly record of an onboarding decision. */
export default function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<Run | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [rounds, setRounds] = useState<{ round: number; created_at: string; decision: string | null; changes: string[] }[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { fetch(`/api/runs/${id}`, { cache: 'no-store' }).then(async r => { const j = await r.json(); if (!r.ok) return setErr(j.error || 'Not found'); setRun(j.run); setAudit(j.audit || []); setRounds(j.rounds || []) }) }, [id])
  useEffect(() => { if (run?.status === 'done') document.title = `Onboarding record · ${run.submission.legal_name}` }, [run])
  if (err) return <div className="rec"><p>{err}</p><Link href="/inbox">Back to inbox</Link></div>
  if (!run) return <div className="rec"><p>Loading…</p></div>
  if (run.status !== 'done' || !run.outcome) return <div className="rec"><p>Still being checked.</p><Link href={`/runs/${id}`}>Back</Link></div>
  const o = run.outcome, sub = run.submission, rv = run.review
  const final = run.final_decision || run.decision!
  const m = DECISION_META[final]
  const label = final === 'pending' ? (o.waiting_on === 'vendor' ? 'Waiting on vendor' : 'Needs review') : rv ? `${m.label} by reviewer` : m.label
  return (
    <div className="rec">
      <div className="rec-bar noprint"><Link href={`/runs/${id}`} className="btn sm ghost"><IBack />Back to case</Link><button className="btn sm" onClick={() => window.print()}><IDownload />Print / Save as PDF</button></div>
      <header className="rec-head">
        <div><div className="rec-brand">VETTED · Vendor onboarding record</div><h1>{sub.legal_name}</h1><div className="rec-sub">{sub.trade_name ? `Trades as ${sub.trade_name} · ` : ''}{sub.business_type} · GSTIN {sub.gstin} · PAN {sub.pan}</div></div>
        <div className="rec-stamp" style={{ color: m.color, borderColor: m.color }}>{label.toUpperCase()}</div>
      </header>
      <section><h2>Decision</h2>
        <table className="rec-kv"><tbody>
          <tr><th>System decision</th><td>{o.headline}</td></tr>
          {rv && <tr><th>Reviewer</th><td>{label} by {rv.reviewer} on {fmtDateTime(rv.at)}. Note: “{rv.note}”</td></tr>}
          <tr><th>Vendor ID</th><td>{o.vendor_id || 'Not created'}</td></tr>
          <tr><th>Risk score</th><td>{o.risk}/100</td></tr>
          <tr><th>Case</th><td>{run.case_id} · round {run.round} · {fmtDateTime(run.created_at)}</td></tr>
        </tbody></table>
        <p className="rec-summary">{o.summary}</p>
      </section>
      <section><h2>Reasons</h2>
        {o.findings.length === 0 ? <p>Every check passed. No exceptions.</p> : <table className="rec-tbl"><thead><tr><th>Effect</th><th>Code</th><th>Finding</th></tr></thead><tbody>{o.findings.map((f, i) => <tr key={i}><td className={`sev-${f.severity === 'vendor' || f.severity === 'review' ? 'hold' : f.severity}`}>{SEV[f.severity]}</td><td className="mono">{f.code}</td><td><b>{f.title}</b><br />{f.detail}</td></tr>)}</tbody></table>}
        {o.asks.length > 0 && final === 'pending' && <><h3>Asked of the vendor</h3><ul>{o.asks.map((a, i) => <li key={i}>{a.text}</li>)}</ul></>}
      </section>
      <section><h2>What was submitted</h2>
        <table className="rec-kv"><tbody>
          <tr><th>Address</th><td>{sub.address.line}, {sub.address.city}, {sub.address.state} {sub.address.pin}</td></tr>
          <tr><th>Contact</th><td>{sub.contact.name} · {sub.contact.email} · {sub.contact.phone}</td></tr>
          <tr><th>Bank</th><td>{sub.bank.account_name} · {sub.bank.bank_name} ••{sub.bank.account_number.slice(-4)} · {sub.bank.ifsc}</td></tr>
          <tr><th>Sponsor</th><td>{sub.sponsor ? `${sub.sponsor.name}, ${sub.sponsor.department}` : 'None'}</td></tr>
          <tr><th>Documents</th><td>{sub.documents.map(d => `${DOC_LABEL[d.declared]} (${d.file_name})`).join('; ')}</td></tr>
        </tbody></table>
      </section>
      <section><h2>Checks run</h2>
        <table className="rec-tbl"><thead><tr><th>Stage</th><th>Result</th><th>Checks</th></tr></thead><tbody>{run.stages.map(s => <tr key={s.key}><td>{s.title}<div className="rec-small">{s.by === 'ai' ? 'AI' : s.by === 'code' ? 'Code' : 'AI + code'}</div></td><td>{STAT[s.status] || s.status}</td><td>{s.checks.length ? s.checks.map((c, i) => <div key={i}>{STAT[c.status]}: {c.label}{c.detail ? ` (${c.detail})` : ''}</div>) : s.summary}</td></tr>)}</tbody></table>
      </section>
      {rounds.length > 1 && <section><h2>Rounds</h2><table className="rec-tbl"><tbody>{rounds.map(r => <tr key={r.round}><td>Round {r.round}</td><td className="nowrap">{fmtDateTime(r.created_at)}</td><td>{r.decision}</td><td>{r.changes.join('; ')}</td></tr>)}</tbody></table></section>}
      {audit.length > 0 && <section><h2>Audit trail</h2><table className="rec-tbl"><tbody>{[...audit].sort((a, b) => a.at.localeCompare(b.at)).map(a => <tr key={a.id}><td className="nowrap">{fmtDateTime(a.at)}</td><td>{a.actor}</td><td>{a.action}: {a.detail}</td></tr>)}</tbody></table></section>}
      <footer className="rec-foot">Generated by VETTED on {fmtDateTime(new Date().toISOString())}. AI reads the documents; fixed rules make the decision; people decide every judgement call. GST registry and penny-drop results are simulated in this demo.</footer>
    </div>
  )
}
