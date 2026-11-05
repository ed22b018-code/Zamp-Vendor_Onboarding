'use client'
import { useState } from 'react'
import { useJson } from '@/components/ui'
import type { AuditEntry, Vendor } from '@/lib/types'
import { fmtDateTime, STATES } from '@/lib/util'

type Reg = { gstin: string; legal_name: string; trade_name: string; constitution: string; status: string; registration_date: string; cancellation_date: string | null; state: string }
type Data = { vendors: Vendor[]; registry: Reg[]; bank: { account: string; holder: string; ifsc: string; status: string }[]; blocklist: { pan: string; name: string; reason: string }[]; audit: AuditEntry[] }
type Tab = 'vendors' | 'registry' | 'bank' | 'blocklist' | 'audit'

export default function Records() {
  const { data } = useJson<Data>('/api/records', 6000)
  const [tab, setTab] = useState<Tab>('vendors')
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Records</h1><p>What VETTED checks against: the vendor master (shared with accounts payable), the GST registry and bank responses, the blocklist and the full audit trail.</p></div></div>
      <div className="seg" style={{ marginBottom: 14, overflowX: 'auto', maxWidth: '100%' }}>
        {([['vendors', 'Vendor master'], ['registry', 'GST registry (simulated)'], ['bank', 'Bank responses (simulated)'], ['blocklist', 'Blocklist'], ['audit', 'Audit trail']] as [Tab, string][]).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {!data ? <div className="card empty">Loading…</div> : (
        <div className="card scroll-x">
          {tab === 'vendors' && <table className="t"><thead><tr><th>ID</th><th>Vendor</th><th>GSTIN</th><th>Bank on file</th><th>Contact</th><th>Source</th></tr></thead>
            <tbody>{data.vendors.map(v => <tr key={v.id}><td className="mono">{v.id}</td><td style={{ fontWeight: 600, minWidth: 200 }}>{v.name}{v.trade_name && <div className="tiny muted">trades as {v.trade_name}</div>}<div className="tiny muted">{v.address}</div></td><td className="mono small">{v.gstin}</td><td className="small">{v.bank.bank_name} ••{v.bank.account_number.slice(-4)}<div className="tiny muted mono">{v.bank.ifsc}</div></td><td className="small">{v.contact.name}<div className="tiny muted">{v.contact.phone}</div></td>
              <td className="small">{v.onboarded ? <span className="pill blue" title={`By ${v.onboarded.by} on ${fmtDateTime(v.onboarded.at)}`}>Onboarded by VETTED{v.onboarded.rounds > 1 ? ` · ${v.onboarded.rounds} rounds` : ''}</span> : <span className="muted">ERP</span>}</td></tr>)}</tbody></table>}
          {tab === 'registry' && <table className="t"><thead><tr><th>GSTIN</th><th>Legal name</th><th>Trade name</th><th>Constitution</th><th>State</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>{data.registry.map(r => <tr key={r.gstin}><td className="mono small">{r.gstin}</td><td className="small" style={{ fontWeight: 600 }}>{r.legal_name}</td><td className="small muted">{r.trade_name}</td><td className="small">{r.constitution}</td><td className="small">{r.state || STATES[r.gstin.slice(0, 2)]}</td><td><span className={`pill ${r.status === 'Active' ? 'approve' : 'reject'}`}>{r.status}{r.cancellation_date ? ` ${r.cancellation_date}` : ''}</span></td><td className="small muted">{r.registration_date}</td></tr>)}</tbody></table>}
          {tab === 'bank' && <table className="t"><thead><tr><th>Account</th><th>Holder name returned by the bank</th><th>IFSC</th><th>Status</th></tr></thead>
            <tbody>{data.bank.map((b, i) => <tr key={i}><td className="mono">{b.account}</td><td className="small" style={{ fontWeight: 600 }}>{b.holder}</td><td className="mono small">{b.ifsc}</td><td className="small">{b.status}</td></tr>)}</tbody></table>}
          {tab === 'blocklist' && <table className="t"><thead><tr><th>PAN</th><th>Entity</th><th>Reason</th></tr></thead>
            <tbody>{data.blocklist.map(b => <tr key={b.pan}><td className="mono">{b.pan}</td><td style={{ fontWeight: 600 }}>{b.name}</td><td className="small muted">{b.reason}</td></tr>)}</tbody></table>}
          {tab === 'audit' && <div className="audit">{data.audit.length ? data.audit.map(a => <div key={a.id} className="a"><span className="muted num">{fmtDateTime(a.at)}</span><span><b>{a.actor}</b> · {a.action.replace(':', ' → ')}<div className="muted">{a.detail}</div></span></div>) : <div className="empty small">No audit entries yet</div>}</div>}
        </div>
      )}
      {tab === 'registry' || tab === 'bank' ? <p className="tiny faint" style={{ marginTop: 10 }}>In production these come from a GST Suvidha Provider API and the bank's penny-drop (₹1 test credit) API. IFSC lookups in VETTED are already live against the public IFSC directory.</p> : null}
    </div>
  )
}
