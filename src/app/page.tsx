'use client'
import Link from 'next/link'
import { DotWordmark } from '@/components/DotWordmark'
import { IArrow, IBolt, IChart, IClock, IShield, IUser } from '@/components/icons'
import { ByChip, useJson } from '@/components/ui'
import { computeStats, type RunRow } from '@/lib/stats'
import { pct } from '@/lib/util'

const FLOW: { n: string; t: string; by: 'ai' | 'code' | 'ai+code'; p: string }[] = [
  { n: '01', t: 'Receive', by: 'code', p: 'Registration arrives from the portal or inbox. Every document is fingerprinted.' },
  { n: '02', t: 'Completeness', by: 'code', p: 'Required fields and documents for this business type are all there.' },
  { n: '03', t: 'Read documents', by: 'ai', p: 'Gemini reads GST certificate, PAN and cheque, even scans, and spots the wrong document.' },
  { n: '04', t: 'Format checks', by: 'code', p: 'GSTIN check digit, PAN, IFSC, PIN code and email domain.' },
  { n: '05', t: 'Cross-check', by: 'ai+code', p: 'Form vs documents: names, PAN inside GSTIN, state, business type.' },
  { n: '06', t: 'Verify', by: 'code', p: 'GST registry status, live IFSC directory, bank account holder (penny drop).' },
  { n: '07', t: 'Fraud', by: 'code', p: 'Bank account or GSTIN already used, blocklist, shared contacts.' },
  { n: '08', t: 'Decide', by: 'code', p: 'Policy turns findings into Approved, Pending or Rejected, with a risk score.' },
  { n: '09', t: 'Communicate', by: 'ai', p: 'An exact list of what the vendor must fix, with a link to fix only that.' },
  { n: '10', t: 'Record', by: 'code', p: 'Vendor created on approval; every round and decision in the audit trail.' },
]

export default function Home() {
  const { data: runs } = useJson<RunRow[]>('/api/runs', 8000)
  const s = computeStats(runs || [])
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-mark"><DotWordmark lines={['VETTED']} label="VETTED" palette={['#4f46e5', '#a5b4fc', '#30d158', '#ff9f0a']} /></div>
        <h1>Every new vendor, from submission to a decision you can defend.</h1>
        <p className="lead">VETTED reads a vendor's documents, cross-checks them against the form, the GST registry and the bank, screens for fraud, and returns <b style={{ color: '#1a8f4c' }}>Approved</b>, <b style={{ color: '#b86e00' }}>Pending</b> or <b style={{ color: '#d70015' }}>Rejected</b>. When something's missing, it tells the vendor exactly what, and lets them fix only that.</p>
        <div className="row wrap" style={{ gap: 10 }}>
          <Link href="/inbox" className="btn lg blue">Open the onboarding inbox <IArrow /></Link>
          <Link href="/apply" target="_blank" className="btn lg ghost"><IUser />Try the vendor portal</Link>
        </div>
      </section>

      <div className="grid-kpi" style={{ marginTop: 34 }}>
        <Kpi k="Vendors checked" v={String(s.cases)} sub={s.cases ? `${s.approved} approved · ${s.pending} pending · ${s.rejected} rejected` : 'Run one from the inbox'} icon={<IChart />} />
        <Kpi k="Approved first time" v={s.cases ? pct(s.firstPassRate, 0) : '-'} sub="no back-and-forth with the vendor" icon={<IBolt />} />
        <Kpi k="Fraud stopped" v={String(s.fraud)} sub="shared bank accounts, borrowed GSTINs" icon={<IShield />} />
        <Kpi k="Procurement time saved" v={s.cases ? `${Math.max(0, s.hoursSaved).toFixed(1)} h` : '-'} sub="vs ~45 min per vendor by hand" icon={<IClock />} />
      </div>

      <h2 className="h2" style={{ margin: '36px 0 12px', fontSize: 20 }}>How a decision is made</h2>
      <div className="flow">
        {FLOW.map(f => (
          <div key={f.n} className="flow-step">
            <div className="row"><span className="n">{f.n}</span><span className="right"><ByChip by={f.by} /></span></div>
            <b>{f.t}</b>
            <p>{f.p}</p>
          </div>
        ))}
      </div>

      <div className="principle" style={{ marginTop: 16 }}>
        <div className="card">
          <span className="chip ai">AI</span>
          <h3>Gemini reads and writes language</h3>
          <ul>
            <li>Reads GST certificates, PAN cards and cheques, including scans</li>
            <li>Notices when a file isn't the document it claims to be</li>
            <li>Judges borderline names: same business, or a different one?</li>
            <li>Writes the reviewer summary and the exact ask to the vendor</li>
          </ul>
        </div>
        <div className="card">
          <span className="chip code">RULES</span>
          <h3>Deterministic rules make every decision</h3>
          <ul>
            <li>Same submission → same decision, every time</li>
            <li>GSTIN check digit, PAN-in-GSTIN and registry status checked exactly</li>
            <li>Every rule that fired is shown and auditable</li>
            <li>Procurement changes the policy without touching code</li>
          </ul>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}

/** Closing section: link columns in the style of zamp.ai's footer. */
function SiteFooter() {
  const cols: { h: string; links: [string, string][] }[] = [
    { h: 'Workflow', links: [['Onboarding inbox', '/inbox'], ['Review queue', '/review'], ['Dashboard', '/dashboard']] },
    { h: 'Controls', links: [['Rules', '/rules'], ['Records', '/records'], ['Vendor portal', '/apply']] },
    { h: 'Project', links: [['VERITY (invoices)', 'https://verity-ap.vercel.app'], ['Zamp AI', 'https://www.zamp.ai']] },
  ]
  return (
    <footer className="vfoot">
      <div className="vfoot-cols">
        <div className="vfoot-lead">
          <div className="vfoot-h"><i />AI reads. Rules decide.</div>
          <p>Every new vendor, from submission to a decision you can defend.</p>
          <Link href="/inbox" className="vfoot-cta"><span>Open the inbox</span><IArrow /></Link>
        </div>
        {cols.map(c => (
          <div key={c.h}>
            <div className="vfoot-h"><i />{c.h}</div>
            {c.links.map(([t, href]) => href.startsWith('http')
              ? <a key={t} href={href} target="_blank" rel="noreferrer" className="vfoot-link"><span>{t}</span><IArrow /></a>
              : <Link key={t} href={href} className="vfoot-link"><span>{t}</span><IArrow /></Link>)}
          </div>
        ))}
      </div>
      <div className="vfoot-note">Built for the Zamp AI Solutions Analyst case study · demo data for Northwind Retail India · fictional vendors and specimen documents</div>
      <details className="assume">
        <summary>Assumptions</summary>
        <ul>
          <li>The buyer is Northwind Retail India, Chennai. Most vendors are Indian businesses registered under GST; foreign vendors (US, UK, UAE, Singapore) are checked against their own country's tax ID and bank rules.</li>
          <li>The vendor master is shared with accounts payable (the same one VERITY pays from). Approved vendors are added to it.</li>
          <li>GST registry lookups and bank penny-drop results are simulated with realistic data. IFSC lookups are real, against the public IFSC directory.</li>
          <li>A vendor is approved only when every check passes; anything uncertain goes to the vendor (an exact ask) or to a reviewer (a judgement call), never silently through.</li>
          <li>A bank account in a different name, a shared bank account, a cancelled GSTIN or a GSTIN of another taxpayer are never approved automatically.</li>
          <li>For a sole proprietorship, an account in the proprietor's own name is acceptable.</li>
          <li>The fraud email to a rejected vendor never says what was detected.</li>
          <li>AI never approves or rejects. It reads documents and writes explanations; coded rules decide.</li>
        </ul>
      </details>
    </footer>
  )
}

function Kpi({ k, v, sub, icon }: { k: string; v: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="row"><span className="k">{k}</span><span className="right faint" style={{ width: 18, height: 18 }}>{icon}</span></div>
      <div className="v">{v}</div>
      <div className="s">{sub}</div>
    </div>
  )
}
