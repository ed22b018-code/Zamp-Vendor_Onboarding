'use client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { IArrow, ICheck, IInfo } from '@/components/icons'
import { useToast } from '@/components/ui'
import { BackToApp, sampleFile, Upload, useIfsc, VendorHeader } from '@/components/VendorBits'
import { BUSINESS_TYPES } from '@/lib/types'
import { gstinChecksumOk, GSTIN_RE, PAN_RE, STATES } from '@/lib/util'

const DEPTS = ['Admin', 'IT', 'Facilities', 'Store Fit-outs', 'Warehouse', 'Marketing', 'Finance']
const EMPTY = { legal_name: '', trade_name: '', business_type: 'Private Limited', category: 'Goods', gstin: '', pan: '', address_line: '', city: '', state: 'Tamil Nadu', pin: '', contact_name: '', email: '', phone: '', account_name: '', account_number: '', ifsc: '', bank_name: '', msme: false, udyam: '', sponsor_name: '', sponsor_department: 'Admin' }
type F = typeof EMPTY
type Files = { gst_certificate: File | null; pan_card: File | null; cancelled_cheque: File | null; msme_certificate: File | null }

/** The vendor portal: a new supplier registers with Northwind. Public, no sign-in. */
export default function Apply() {
  const router = useRouter()
  const toast = useToast()
  const [f, setF] = useState<F>(EMPTY)
  const [files, setFiles] = useState<Files>({ gst_certificate: null, pan_card: null, cancelled_cheque: null, msme_certificate: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })
  const g = f.gstin.toUpperCase().replace(/\s/g, '')
  const gHint = useMemo(() => {
    if (g.length < 15) return null
    if (!GSTIN_RE.test(g)) return { ok: false, t: 'Not a valid GSTIN format' }
    if (!gstinChecksumOk(g)) return { ok: false, t: 'Check digit fails: please re-check the GSTIN' }
    return { ok: true, t: `${STATES[g.slice(0, 2)] || 'State ' + g.slice(0, 2)} · PAN ${g.slice(2, 12)}` }
  }, [g])
  const pHint = f.pan.length === 10 ? (PAN_RE.test(f.pan.toUpperCase()) ? (g.length === 15 && g.slice(2, 12) !== f.pan.toUpperCase() ? { ok: false, t: "Doesn't match the PAN inside your GSTIN" } : { ok: true, t: 'Looks right' }) : { ok: false, t: 'Not a valid PAN format' }) : null
  const ifsc = useIfsc(f.ifsc)

  async function fillSample() {
    setF({ ...EMPTY, legal_name: 'Brightline Facility Services Pvt Ltd', business_type: 'Private Limited', category: 'Services', gstin: '33AAECB4417K1ZU', pan: 'AAECB4417K', address_line: '14, Cathedral Road, Gopalapuram', city: 'Chennai', state: 'Tamil Nadu', pin: '600086', contact_name: 'Anitha Raman', email: 'accounts@brightlinefs.in', phone: '+91 44 2811 4417', account_name: 'Brightline Facility Services Pvt Ltd', account_number: '50200012344417', ifsc: 'HDFC0000082', bank_name: 'HDFC Bank', msme: true, udyam: 'UDYAM-TN-02-0044170', sponsor_name: 'Divya N.', sponsor_department: 'Admin' })
    const [a, b, c, d] = await Promise.all([sampleFile('/samples/v01/gst_certificate.pdf', 'gst_certificate.pdf'), sampleFile('/samples/v01/pan_card.png', 'pan_card.png'), sampleFile('/samples/v01/cancelled_cheque.png', 'cancelled_cheque.png'), sampleFile('/samples/v01/udyam_certificate.pdf', 'udyam_certificate.pdf')])
    setFiles({ gst_certificate: a, pan_card: b, cancelled_cheque: c, msme_certificate: d })
    toast('Filled with a sample vendor and its documents')
  }

  async function submit() {
    setErr(null)
    const need: [keyof F, string][] = [['legal_name', 'business name'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['contact_name', 'contact name'], ['email', 'email'], ['phone', 'phone'], ['account_number', 'bank account number'], ['ifsc', 'IFSC']]
    const miss = need.filter(([k]) => !String(f[k]).trim()).map(([, l]) => l)
    if (miss.length) return setErr('Please fill in: ' + miss.join(', '))
    if (!files.gst_certificate || !files.pan_card || !files.cancelled_cheque) return setErr('Please attach your GST certificate, PAN card and a cancelled cheque (or bank letter).')
    const total = Object.values(files).reduce((a, x) => a + (x?.size || 0), 0)
    if (total > 4 * 1024 * 1024) return setErr('Your files add up to more than 4 MB. Please attach smaller scans.')
    setBusy(true)
    const fd = new FormData()
    fd.append('fields', JSON.stringify(f))
    for (const [k, v] of Object.entries(files)) if (v) fd.append(`doc:${k}`, v)
    const r = await fetch('/api/apply', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}))
    if (!r.ok) { setBusy(false); return setErr(j.error || 'Something went wrong, please try again') }
    router.push(`/fix/${j.case_id}?new=1`)
  }

  const field = (k: keyof F, label: string, ph = '', o: { wide?: boolean; mono?: boolean; type?: string; hint?: { ok: boolean; t: string } | null } = {}) => (
    <div className={`field ${o.wide ? 'wide' : ''}`}>
      <label>{label}</label>
      <input className={`input${o.mono ? ' mono' : ''}`} type={o.type || 'text'} placeholder={ph} value={String(f[k])} onChange={set(k)} />
      {o.hint && <span className="tiny" style={{ color: o.hint.ok ? 'var(--green)' : 'var(--red)' }}>{o.hint.ok && <ICheck style={{ width: 12, height: 12, verticalAlign: -2 }} />} {o.hint.t}</span>}
    </div>
  )

  return (
    <div className="vp"><div className="vp-in">
      <VendorHeader right={<BackToApp />} />
      <h1>Register as a Northwind vendor</h1>
      <p className="lead">Takes about 5 minutes. We check your details automatically, and if anything is missing we tell you exactly what, so you only fix that.</p>
      <div className="notice" style={{ marginBottom: 18 }}><IInfo /><span>Demo portal. <button className="linkbtn" onClick={fillSample}>Fill with a sample vendor</button> to try it in one click, or use your own test documents.</span></div>

      <div className="card card-pad stack" style={{ gap: 18 }}>
        <div className="sec-h">Business</div>
        <div className="vform2">
          {field('legal_name', 'Registered business name', 'As on your GST certificate', { wide: true })}
          {field('trade_name', 'Trade name (if different)', 'Optional')}
          <div className="field"><label>Business type</label><select className="input" value={f.business_type} onChange={set('business_type')}>{BUSINESS_TYPES.map(b => <option key={b}>{b}</option>)}</select></div>
          {field('gstin', 'GSTIN', '15 characters', { mono: true, hint: gHint })}
          {field('pan', 'PAN', '10 characters', { mono: true, hint: pHint })}
          <div className="field"><label>You supply</label><select className="input" value={f.category} onChange={set('category')}><option>Goods</option><option>Services</option></select></div>
          <div className="field"><label>MSME (Udyam registered)?</label><label className="row small" style={{ gap: 8, height: 40 }}><input type="checkbox" checked={f.msme} onChange={set('msme')} /> Yes, we are an MSME</label></div>
          {f.msme && field('udyam', 'Udyam registration number', 'UDYAM-XX-00-0000000', { wide: true, mono: true })}
        </div>
        <div className="sec-h">Address and contact</div>
        <div className="vform2">
          {field('address_line', 'Address', 'Street, area', { wide: true })}
          {field('city', 'City', 'e.g. Chennai')}
          <div className="field"><label>State</label><select className="input" value={f.state} onChange={set('state')}>{[...new Set(Object.values(STATES))].sort().map(s => <option key={s}>{s}</option>)}</select></div>
          {field('pin', 'PIN code', '6 digits')}
          {field('contact_name', 'Contact person', 'Name')}
          {field('email', 'Accounts email', 'accounts@yourcompany.in', { type: 'email' })}
          {field('phone', 'Phone', '+91 …')}
        </div>
        <div className="sec-h">Bank account for payments</div>
        <div className="vform2">
          {field('account_name', 'Account holder name', 'Must be your business')}
          {field('account_number', 'Account number', 'Digits only', { mono: true })}
          {field('ifsc', 'IFSC', 'e.g. HDFC0000082', { mono: true, hint: ifsc ? { ok: ifsc.ok, t: ifsc.text } : null })}
          {field('bank_name', 'Bank', 'e.g. HDFC Bank')}
        </div>
        <div className="sec-h">Who at Northwind asked you to register?</div>
        <div className="vform2">
          {field('sponsor_name', 'Name', 'Optional, but speeds things up')}
          <div className="field"><label>Department</label><select className="input" value={f.sponsor_department} onChange={set('sponsor_department')}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
        </div>
        <div className="sec-h">Documents</div>
        <div className="stack" style={{ gap: 10 }}>
          <Upload label="GST registration certificate" file={files.gst_certificate} onFile={x => setFiles({ ...files, gst_certificate: x })} />
          <Upload label="PAN card" file={files.pan_card} onFile={x => setFiles({ ...files, pan_card: x })} />
          <Upload label="Cancelled cheque or bank letter" hint="For the account above" file={files.cancelled_cheque} onFile={x => setFiles({ ...files, cancelled_cheque: x })} />
          {f.msme && <Upload label="Udyam (MSME) certificate" file={files.msme_certificate} onFile={x => setFiles({ ...files, msme_certificate: x })} />}
        </div>
        {err && <div className="notice red"><IInfo /><span>{err}</span></div>}
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn lg blue" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit registration'} <IArrow /></button>
          <span className="tiny muted">By submitting you confirm these details are correct. Files up to 4 MB in total.</span>
        </div>
      </div>
    </div></div>
  )
}
