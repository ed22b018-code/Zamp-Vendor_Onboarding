'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CheckStatus, Decision, StageStatus } from '@/lib/types'
import { IAlert, ICheck, IInfo, ILoader, IMinus, IPause, IX } from './icons'

export const DECISION_META: Record<Decision, { label: string; color: string; soft: string; word: string; cls: string }> = {
  approved: { label: 'Approved', color: '#1a8f4c', soft: '#e6f5ec', word: 'APPROVED', cls: 'approve' },
  pending: { label: 'Pending', color: '#b86e00', soft: '#fff4e0', word: 'PENDING', cls: 'hold' },
  rejected: { label: 'Rejected', color: '#d70015', soft: '#fdecee', word: 'REJECTED', cls: 'reject' },
}

/** Decision pill. A pending case says who it waits on; a reviewer's decision says so. */
export function DecisionPill({ d, waiting, reviewed }: { d: Decision | null | undefined; waiting?: 'vendor' | 'reviewer' | null; reviewed?: boolean }) {
  if (!d) return <span className="pill live blue"><span className="dot" />Checking</span>
  const label = d === 'pending' ? (waiting === 'vendor' ? 'Waiting on vendor' : 'Needs review') : reviewed ? `${DECISION_META[d].label} by reviewer` : DECISION_META[d].label
  return <span className={`pill ${d === 'pending' && waiting !== 'vendor' ? 'violet' : DECISION_META[d].cls}`}><span className="dot" />{label}</span>
}

export function StageIcon({ s }: { s: StageStatus }) {
  if (s === 'running') return <ILoader className="spin" />
  if (s === 'pass') return <ICheck />
  if (s === 'warn') return <IAlert />
  if (s === 'fail') return <IX />
  if (s === 'skip') return <IMinus />
  return <IPause style={{ opacity: 0 }} />
}

export function CheckIcon({ s }: { s: CheckStatus }) {
  if (s === 'pass') return <ICheck />
  if (s === 'warn') return <IAlert />
  if (s === 'fail') return <IX />
  return <IInfo />
}

export function ByChip({ by }: { by: 'code' | 'ai' | 'ai+code' }) {
  if (by === 'ai') return <span className="chip ai">AI</span>
  if (by === 'ai+code') return <span className="chip aicode">AI + RULES</span>
  return <span className="chip code">RULES</span>
}

export function avatarColor(s: string) {
  const c = ['#0071e3', '#8944ab', '#1a8f4c', '#c2410c', '#0f766e', '#be185d', '#4f46e5', '#b45309']
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return c[h % c.length]
}

// ---------- toast ----------
const ToastCtx = createContext<(m: string) => void>(() => {})
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t) }, [msg])
  return <ToastCtx.Provider value={setMsg}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>
}
export const useToast = () => useContext(ToastCtx)

// ---------- data ----------
export function useJson<T>(url: string | null, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!url) return
    try { const r = await fetch(url, { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); setData(j); setError(null) }
    catch (e) { setError((e as Error).message) }
  }, [url])
  useEffect(() => { load(); if (!refreshMs) return; const t = setInterval(load, refreshMs); return () => clearInterval(t) }, [load, refreshMs])
  return { data, error, reload: load, setData }
}

export function Confidence({ v }: { v: number | undefined }) {
  if (v === undefined) return null
  const c = v >= 0.95 ? '#1a8f4c' : v >= 0.85 ? '#5aa469' : v > 0 ? '#e08a00' : '#d2d2d7'
  return <span className="conf" title={`${Math.round(v * 100)}% confident`}><i style={{ width: `${Math.max(6, v * 100)}%`, background: c }} /></span>
}
