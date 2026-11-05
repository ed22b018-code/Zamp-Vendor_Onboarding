'use client'
import { useEffect, useState } from 'react'
import { IInfo, IRefresh, ISpark } from '@/components/icons'
import { useJson, useToast } from '@/components/ui'
import { CustomRules } from '@/components/CustomRules'
import type { Settings } from '@/lib/types'

type Status = { ai: 'live' | 'cached'; model: string; db: 'supabase' | 'memory'; ping?: { ok: boolean; model?: string; error?: string } }

export default function Rules() {
  const toast = useToast()
  const { data: saved, setData: setSaved } = useJson<Settings>('/api/settings')
  const { data: status } = useJson<Status>('/api/status')
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [ping, setPing] = useState<Status['ping'] | 'busy' | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [forget, setForget] = useState(false)
  useEffect(() => { if (saved && !s) setS(saved) }, [saved, s])
  if (!s || !saved) return <div className="page"><div className="card empty">Loading…</div></div>
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v })

  async function save() {
    setSaving(true)
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) })
    const j = await r.json(); setSaving(false)
    if (!r.ok) return toast('Could not save rules')
    setSaved(j); setS(j); toast('Rules saved, new runs use them immediately')
  }
  async function reset() {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return }
    await fetch('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ forgetReadings: forget }) })
    toast('Demo reset: inbox and rules restored')
    setConfirmReset(false)
    const j = await fetch('/api/settings').then(r => r.json()); setSaved(j); setS(j)
  }
  async function test() {
    setPing('busy')
    const j: Status = await fetch('/api/status?check=1').then(r => r.json())
    setPing(j.ping || { ok: false, error: 'No Gemini API key configured' })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>Rules</h1><p>The onboarding policy VETTED applies. Procurement owns these: change one here and the very next check follows it, no code change needed.</p></div>
      </div>
      <div className="rules">
        <div>
          <div className="card">
            <div className="card-head"><b>Identity matching</b></div>
            <Rule title="Name match strictness" desc="How closely names must agree across the form, GST certificate, PAN and bank account holder before a mismatch is raised. Borderline names go to Gemini for a same-business judgement.">
              <Unit v={Math.round(s.nameMatchStrict * 100)} unit="%" step={1} onChange={v => set('nameMatchStrict', v / 100)} />
            </Rule>
            <Rule title="Minimum AI confidence" desc="If Gemini is less sure than this about a document, a person confirms it against the file.">
              <Unit v={Math.round(s.minConfidence * 100)} unit="%" step={1} onChange={v => set('minConfidence', v / 100)} />
            </Rule>
            <Rule title="Require MSME certificate" desc="When a vendor declares MSME status (45-day payment protection), require the Udyam certificate.">
              <Toggle on={s.requireMsmeCert} set={v => set('requireMsmeCert', v)} />
            </Rule>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><b>Fraud & risk</b></div>
            <Rule title="Bank account shared with another vendor" desc="The classic set-up for diverting payments. Reject outright, or send to a reviewer (e.g. for known group companies).">
              <div className="seg">{(['reject', 'review'] as const).map(k => <button key={k} className={s.sharedBankAction === k ? 'on' : ''} onClick={() => set('sharedBankAction', k)}>{k === 'reject' ? 'Reject' : 'Reviewer'}</button>)}</div>
            </Rule>
            <Rule title="Risk score for review" desc="Small signals add up (new GST registration, webmail, no sponsor, PIN/state mismatch, shared contacts). At or above this score a person reviews, even if no single check failed.">
              <Unit v={s.riskReviewThreshold} unit="/100" step={5} onChange={v => set('riskReviewThreshold', v)} />
            </Rule>
            <Rule title="New GST registration" desc="Registrations younger than this add risk. Brand-new GSTINs are common in fake-vendor fraud.">
              <Unit v={s.newRegistrationDays} unit="days" step={15} onChange={v => set('newRegistrationDays', v)} />
            </Rule>
            <Rule title="Free webmail contact" desc="Gmail, Yahoo and similar addresses: note it and add risk, or always send to a reviewer.">
              <div className="seg">{(['info', 'review'] as const).map(k => <button key={k} className={s.freeEmailAction === k ? 'on' : ''} onClick={() => set('freeEmailAction', k)}>{k === 'info' ? 'Note + risk' : 'Reviewer'}</button>)}</div>
            </Rule>
            <Rule title="Require a Northwind sponsor" desc="Every new vendor must name the Northwind employee who asked for them. Off: a missing sponsor only adds risk.">
              <Toggle on={s.requireSponsor} set={v => set('requireSponsor', v)} />
            </Rule>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><b>Verification sources</b></div>
            <Rule title="Live IFSC lookup" desc="Check the bank branch against the public IFSC directory in real time. Off: use the saved snapshot.">
              <Toggle on={s.liveIfsc} set={v => set('liveIfsc', v)} />
            </Rule>
            <Rule title="Saved readings as fallback" desc="If live AI is unavailable, the 10 sample submissions use their saved Gemini reading, clearly labelled, so a demo never stalls.">
              <Toggle on={s.useCachedReadings} set={v => set('useCachedReadings', v)} />
            </Rule>
          </div>
          <CustomRules rules={s.customRules || []} onChange={r => set('customRules', r)} />
          {dirty && (
            <div className="save-bar">
              <span className="grow small">Unsaved rule changes</span>
              <button className="btn sm ghost" style={{ color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.3)' }} onClick={() => setS(saved)}>Discard</button>
              <button className="btn sm blue" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save rules'}</button>
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="notice"><IInfo /><span><b>Try it:</b> set <b>Bank account shared with another vendor</b> to Reviewer, save, then open Shree Kaveri Traders and press <b>Re-run with current rules</b>: it now goes to a person instead of being rejected.</span></div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <b>System</b>
            <div className="row small"><span className="grow muted">Document reading</span><span className={`pill ${status?.ai === 'live' ? 'violet' : ''}`}><span className="dot" />{status?.ai === 'live' ? `Gemini · ${status.model}` : 'Saved readings'}</span></div>
            <div className="row small"><span className="grow muted">Database</span><span className={`pill ${status?.db === 'supabase' ? 'approve' : ''}`}><span className="dot" />{status?.db === 'supabase' ? 'Supabase Postgres' : 'In-memory'}</span></div>
            <button className="btn sm ghost" onClick={test} disabled={ping === 'busy'}><ISpark />{ping === 'busy' ? 'Testing…' : 'Test Gemini connection'}</button>
            {ping && ping !== 'busy' && <div className={`notice ${ping.ok ? '' : 'amber'}`}><IInfo /><span>{ping.ok ? `Gemini responded (${ping.model}).` : ping.error}</span></div>}
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <b>Demo data</b>
            <p className="small muted" style={{ margin: 0 }}>Clears every case, review, onboarded vendor and audit entry and restores the default rules: use before a fresh demo. AI readings of files are kept, so documents already read once don't need Gemini again.</p>
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={forget} onChange={e => setForget(e.target.checked)} />Also forget AI readings (every document is read live again)</label>
            <button className={`btn sm ${confirmReset ? 'red' : 'ghost'}`} onClick={reset}><IRefresh />{confirmReset ? 'Click again to confirm reset' : 'Reset demo'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Rule({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return <div className="rule"><div><h3>{title}</h3><p>{desc}</p></div>{children}</div>
}
function Unit({ v, unit, pre, step, onChange }: { v: number; unit: string; pre?: boolean; step: number; onChange: (n: number) => void }) {
  return (
    <div className={`unit-input ${pre ? 'pre' : ''}`}>
      {pre && <span>{unit}</span>}
      <input type="number" inputMode="decimal" step={step} value={v} onChange={e => onChange(Number(e.target.value))} />
      {!pre && <span>{unit}</span>}
    </div>
  )
}
function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => set(!on)} />
}
