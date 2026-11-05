'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ICheck, IUpload } from './icons'
import { Logo } from './Shell'

export function VendorHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div className="vp-head">
      <Logo size={30} />
      <div><div className="who">Northwind Retail India</div><div className="tiny muted">Vendor registration · powered by VETTED</div></div>
      <span className="right">{right}</span>
    </div>
  )
}

export function Upload({ label, hint, file, onFile }: { label: string; hint?: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className={`upl ${file ? 'ok' : ''}`}>
      {file ? <ICheck style={{ color: 'var(--green)' }} /> : <IUpload />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small" style={{ fontWeight: 600 }}>{label}</div>
        <div className="tiny muted ellipsis">{file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : hint || 'PDF, PNG or JPG'}</div>
      </div>
      <span className="btn sm ghost">{file ? 'Change' : 'Choose'}</span>
      <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => onFile(e.target.files?.[0] || null)} />
    </label>
  )
}

/** Live IFSC lookup against the public IFSC directory as the vendor types. */
export function useIfsc(ifsc: string) {
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    const c = ifsc.trim().toUpperCase()
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c)) { setInfo(c.length >= 11 ? { ok: false, text: 'Not a valid IFSC format' } : null); return }
    let alive = true
    fetch(`https://ifsc.razorpay.com/${c}`).then(async r => { if (!alive) return; if (r.ok) { const j = await r.json(); setInfo({ ok: true, text: `${j.BANK}, ${j.BRANCH}, ${j.CITY}` }) } else setInfo({ ok: false, text: 'No bank branch has this IFSC' }) }).catch(() => alive && setInfo(null))
    return () => { alive = false }
  }, [ifsc])
  return info
}

export async function sampleFile(path: string, name: string): Promise<File> {
  const b = await fetch(path).then(r => r.blob())
  return new File([b], name, { type: b.type })
}

export const BackToApp = () => <Link href="/inbox" className="btn sm ghost">Procurement view</Link>
