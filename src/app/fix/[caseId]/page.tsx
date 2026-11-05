'use client'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { IArrow, ICheck, IInfo, ILoader, IX } from '@/components/icons'
import { useToast } from '@/components/ui'
import { BackToApp, sampleFile, Upload, useIfsc, VendorHeader } from '@/components/VendorBits'
import type { Ask, DocKind } from '@/lib/types'
import { BUSINESS_TYPES, DOC_LABEL } from '@/lib/types'

type Pub = {
  case_id: string; sample: string | null; demo_fix: { bank?: { account_name: string; account_number: string; ifsc: string; bank_name: string | null } | null; file?: string; fields?: Record<string, string> } | null
  round: number; status: 'checking' | 'approved' | 'pending' | 'rejected'; waiting_on: 'vendor' | 'reviewer' | null; asks: Ask[]
  message: { subject: string; body: string } | null; vendor_id: string | null
  vendor: { legal_name: string; trade_name: string | null; business_type: string; gstin: string; pan: string; bank_last4: string; ifsc: string; documents: { declared: DocKind; file_name: string }[] }
}

export default function FixPage() { return <Suspense><Fix /></Suspense> }

/** The vendor's view of their registration: where it stands and, if something is needed, only that. */
function Fix() {
  const { caseId } = useParams<{ caseId: string }>()
  const q = useSearchParams()
  const toast = useToast()
  const [c, setC] = useState<Pub | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Partial<Record<DocKind, File | null>>>({})
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const process = useCallback(async () => {
    setChecking(true)
    const r = await fetch(`/api/case/${caseId}/process`, { method: 'POST' }); const j = await r.json()
    setChecking(false)
    if (!r.ok) return setErr(j.error || 'Something went wrong')
    setC(j); setFields({}); setFiles({}); setReply('')
  }, [caseId])

  useEffect(() => {
    fetch(`/api/case/${caseId}`, { cache: 'no-store' }).then(async r => {
      const j = await r.json()
      if (!r.ok) return setErr(j.error || 'Not found')
      setC(j)
      if (j.status === 'checking' && !started.current) { started.current = true; process() }
    })
  }, [caseId, process])

  const need = (c?.asks || [])
  const fieldAsks = need.filter(a => a.kind === 'field') as Extract<Ask, { kind: 'field' }>[]
  const docAsks = need.filter(a => a.kind === 'document') as Extract<Ask, { kind: 'document' }>[]
  const confirmAsks = need.filter(a => a.kind === 'confirm')
  const bankNeeded = fieldAsks.some(a => a.field === 'bank') || docAsks.some(a => a.doc === 'cancelled_cheque' && /account held in the name/i.test(a.text))
  const ifsc = useIfsc(fields.ifsc || '')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFields({ ...fields, [k]: e.target.value })

  async function useSample() {
    const fx = c?.demo_fix; if (!fx || !c?.sample) return
    const next: Record<string, string> = { ...fields, ...(fx.fields || {}) }
    if (fx.bank) Object.assign(next, { account_name: fx.bank.account_name, account_number: fx.bank.account_number, ifsc: fx.bank.ifsc, bank_name: fx.bank.bank_name || '' })
    setFields(next)
    if (fx.file) { const f = await sampleFile(`/samples/${c.sample}/${fx.file}`, fx.file); setFiles({ ...files, cancelled_cheque: f }) }
    toast('Filled with the sample correction')
  }

  async function resubmit() {
    setBusy(true)
    const fd = new FormData()
    fd.append('fields', JSON.stringify(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== ''))))
    for (const [k, v] of Object.entries(files)) if (v) fd.append(`doc:${k}`, v)
    if (reply.trim()) fd.append('reply', reply.trim())
    const r = await fetch(`/api/case/${caseId}/fix`, { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return toast(j.error || 'Could not resubmit')
    setC(x => x && { ...x, status: 'checking' }); process()
  }

  if (err) return <div className="vp"><div className="vp-in"><VendorHeader right={<BackToApp />} /><div className="card card-pad"><h2>We couldn't find this registration</h2><p className="muted">{err}</p></div></div></div>
  if (!c) return <div className="vp"><div className="vp-in"><VendorHeader /><div className="card card-pad">Loading…</div></div></div>

  const st = checking ? 'checking' : c.status
  return (
    <div className="vp"><div className="vp-in">
      <VendorHeader right={<BackToApp />} />
      <div className={`status-hero ${st}`}>
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          <span className={`pill ${st === 'approved' ? 'approve' : st === 'rejected' ? 'reject' : st === 'pending' ? 'hold' : 'blue live'}`}><span className="dot" />{st === 'checking' ? 'Checking' : st === 'approved' ? 'Approved' : st === 'rejected' ? 'Not approved' : c.waiting_on === 'vendor' ? 'Action needed' : 'Under review'}</span>
          {c.round > 1 && <span className="pill">Round {c.round}</span>}
        </div>
        <h1>{st === 'checking' ? 'Checking your registration…' : st === 'approved' ? `You're registered: vendor ID ${c.vendor_id}` : st === 'rejected' ? "We couldn't complete your registration" : c.waiting_on === 'vendor' ? `${need.length} thing${need.length === 1 ? '' : 's'} needed to finish` : 'Your registration is being reviewed'}</h1>
        <p className="lead" style={{ margin: 0 }}>{st === 'checking' ? 'We are reading your documents and verifying your GST registration and bank account. This usually takes 10 to 20 seconds.' : st === 'approved' ? 'Please quote your vendor ID and the purchase order number on every invoice.' : st === 'pending' && c.waiting_on === 'vendor' ? 'Everything else checked out. Fix only the items below and resubmit.' : st === 'pending' ? 'Nothing is needed from you right now. We will email you shortly.' : 'The email below explains why.'}</p>
        {st === 'checking' && <div className="row" style={{ marginTop: 14, gap: 8 }}><ILoader className="spin" /><span className="small muted">Verifying…</span></div>}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <dl className="kv">
          <dt>Business</dt><dd>{c.vendor.legal_name}{c.vendor.trade_name ? ` (${c.vendor.trade_name})` : ''} · {c.vendor.business_type}</dd>
          <dt>GSTIN · PAN</dt><dd className="mono">{c.vendor.gstin} · {c.vendor.pan}</dd>
          <dt>Bank</dt><dd>Account ending {c.vendor.bank_last4} · <span className="mono">{c.vendor.ifsc}</span></dd>
          <dt>Documents</dt><dd>{c.vendor.documents.map(d => DOC_LABEL[d.declared]).join(', ')}</dd>
        </dl>
      </div>

      {st === 'pending' && c.waiting_on === 'vendor' && (
        <div className="card card-pad stack" style={{ marginTop: 14, gap: 16 }}>
          <div className="row wrap"><b>What we need</b>{c.demo_fix && <button className="btn sm ghost right" onClick={useSample}>Use the sample correction</button>}</div>
          <ol className="steps" style={{ margin: 0, paddingLeft: 20 }}>{need.map((a, i) => <li key={i}>{a.text}</li>)}</ol>
          {fieldAsks.some(a => a.field === 'business_type') && <div className="field"><label>Business type</label><select className="input" value={fields.business_type || c.vendor.business_type} onChange={set('business_type')}>{BUSINESS_TYPES.map(b => <option key={b}>{b}</option>)}</select></div>}
          {fieldAsks.some(a => a.field === 'legal_name') && <div className="field"><label>Registered business name</label><input className="input" value={fields.legal_name ?? c.vendor.legal_name} onChange={set('legal_name')} /></div>}
          {fieldAsks.some(a => a.field === 'gstin') && <div className="field"><label>GSTIN</label><input className="input mono" value={fields.gstin ?? c.vendor.gstin} onChange={set('gstin')} /></div>}
          {fieldAsks.some(a => a.field === 'pan') && <div className="field"><label>PAN</label><input className="input mono" value={fields.pan ?? c.vendor.pan} onChange={set('pan')} /></div>}
          {fieldAsks.some(a => a.field === 'udyam') && <div className="field"><label>Udyam number</label><input className="input mono" value={fields.udyam || ''} onChange={set('udyam')} /></div>}
          {bankNeeded && <div className="vform2">
            <div className="field"><label>Account holder name</label><input className="input" value={fields.account_name || ''} onChange={set('account_name')} placeholder={c.vendor.legal_name} /></div>
            <div className="field"><label>Account number</label><input className="input mono" value={fields.account_number || ''} onChange={set('account_number')} /></div>
            <div className="field"><label>IFSC</label><input className="input mono" value={fields.ifsc || ''} onChange={set('ifsc')} />{ifsc && <span className="tiny" style={{ color: ifsc.ok ? 'var(--green)' : 'var(--red)' }}>{ifsc.text}</span>}</div>
            <div className="field"><label>Bank</label><input className="input" value={fields.bank_name || ''} onChange={set('bank_name')} /></div>
          </div>}
          {[...new Set(docAsks.map(a => a.doc))].map(k => <Upload key={k} label={DOC_LABEL[k]} hint={k === 'cancelled_cheque' ? 'Cancelled cheque or a bank letter for the account above' : undefined} file={files[k] || null} onFile={x => setFiles({ ...files, [k]: x })} />)}
          {confirmAsks.length > 0 && <div className="field"><label>Your reply</label><textarea className="input" value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your answer here" /><Upload label="Attach a document (optional)" file={files.other || null} onFile={x => setFiles({ ...files, other: x })} /></div>}
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn lg blue" disabled={busy} onClick={resubmit}>{busy ? 'Sending…' : 'Resubmit'} <IArrow /></button>
            <span className="tiny muted">Only these items are checked again with everything else you already sent.</span>
          </div>
        </div>
      )}

      {st !== 'checking' && c.message && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><b>{c.message.subject}</b></div>
          <pre className="card-pad" style={{ whiteSpace: 'pre-wrap', margin: 0, font: 'inherit', fontSize: 14 }}>{c.message.body}</pre>
        </div>
      )}
      {q.get('new') && st !== 'checking' && <div className="notice" style={{ marginTop: 14 }}>{st === 'approved' ? <ICheck /> : st === 'rejected' ? <IX /> : <IInfo />}<span>Keep this page's link: it always shows the latest status of your registration.</span></div>}
    </div></div>
  )
}
