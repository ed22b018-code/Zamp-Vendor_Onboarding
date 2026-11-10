'use client'
import { useState } from 'react'
import { IRefresh } from './icons'

/** Always-visible Reset demo button (top right). Two clicks: arm, then confirm. Keeps saved document readings. */
export function ResetDemo({ compact = false }: { compact?: boolean }) {
  const [arm, setArm] = useState(false)
  const [busy, setBusy] = useState(false)
  async function go() {
    if (!arm) { setArm(true); setTimeout(() => setArm(false), 4000); return }
    setBusy(true)
    try { await fetch('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) } catch { /* reload anyway */ }
    const p = window.location.pathname
    window.location.assign(/^\/(runs|fix)\//.test(p) ? '/inbox' : p)
  }
  return (
    <button className={`btn sm ${arm ? 'red' : 'ghost'} reset-demo`} onClick={go} disabled={busy} title="Clear all runs and restore the default rules (saved document readings are kept)">
      <IRefresh />{busy ? 'Resetting…' : arm ? (compact ? 'Confirm' : 'Click again to reset') : (compact ? 'Reset' : 'Reset demo')}
    </button>
  )
}
