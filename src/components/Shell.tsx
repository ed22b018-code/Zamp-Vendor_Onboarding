'use client'
import { Guide } from './Guide'
import { ResetDemo } from './ResetDemo'
import { GUIDE } from '@/lib/guideContent'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IChart, IDb, IHome, IInbox, IReview, ISliders, IUser } from './icons'
import { ToastProvider, useJson } from './ui'

type Status = { ai: 'live' | 'cached'; model: string; db: 'supabase' | 'memory' }
type RunLite = { decision: string | null; review: unknown; superseded_by: string | null; status: string; outcome: { waiting_on: string | null } | null }

const NAV = [
  { href: '/', label: 'Overview', short: 'Home', icon: IHome },
  { href: '/inbox', label: 'Onboarding inbox', short: 'Inbox', icon: IInbox },
  { href: '/dashboard', label: 'Dashboard', short: 'Dashboard', icon: IChart },
  { href: '/review', label: 'Review queue', short: 'Review', icon: IReview },
  { href: '/apply', label: 'Vendor portal', short: 'Portal', icon: IUser, external: true },
  { href: '/rules', label: 'Rules', short: 'Rules', icon: ISliders },
  { href: '/records', label: 'Records', short: 'Records', icon: IDb },
]

export function Logo({ size = 30 }: { size?: number }) {
  // Dot check-mark echoing the dotted wordmark.
  const dots = [[0, 1], [1, 2], [2, 0], [2, 1]]
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 30 30" width={size * 0.62} height={size * 0.62}>
        {dots.map(([x, y], i) => <circle key={i} cx={5 + x * 10} cy={5 + y * 10} r={3.4} fill={i === 4 ? '#a5b4fc' : '#fff'} />)}
      </svg>
    </span>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { data: status } = useJson<Status>('/api/status')
  const { data: runs } = useJson<RunLite[]>('/api/runs', 6000)
  const open = (runs || []).filter(r => r.decision === 'pending' && !r.review && !r.superseded_by && r.outcome?.waiting_on === 'reviewer').length
  if (path.endsWith('/record') || path.startsWith('/apply') || path.startsWith('/fix')) return <ToastProvider>{children}</ToastProvider>
  const on = (href: string) => (href === '/' ? path === '/' : path.startsWith(href) || (href === '/inbox' && path.startsWith('/runs')))
  return (
    <ToastProvider>
      <div className="shell">
        <aside className="side">
          <Link href="/" className="brand"><Logo /><span><div className="brand-name">VETTED</div><div className="brand-sub">Vendor onboarding</div></span></Link>
          <nav className="nav">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''}>
                <n.icon />{n.label}{n.href === '/review' && open > 0 && <span className="badge">{open}</span>}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <StatusBadges status={status} />
            <div className="tiny faint" style={{ padding: '4px 2px' }}>Northwind Retail India · Procurement</div>
          </div>
        </aside>
        <div className="main">
          <header className="mtop">
            <Link href="/" className="row" style={{ gap: 8 }}><Logo size={26} /><b style={{ letterSpacing: '.14em', fontSize: 14 }}>VETTED</b></Link>
            <span className="right" />
            <ResetDemo compact />
            {status && <span className={`pill ${status.ai === 'live' ? 'violet' : ''}`}><span className="dot" />{status.ai === 'live' ? 'AI live' : 'Cached AI'}</span>}
          </header>
          <div className="topstrip"><ResetDemo /></div>
          {children}
        </div>
        <Guide cfg={GUIDE} />
        <nav className="tabbar">
          {NAV.slice(1).filter(n => !('external' in n)).map(n => (
            <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''}>
              <n.icon />{n.short}{n.href === '/review' && open > 0 && <span className="badge">{open}</span>}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}

function StatusBadges({ status }: { status: Status | null }) {
  if (!status) return null
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className={`pill ${status.ai === 'live' ? 'violet' : ''}`} title={status.ai === 'live' ? `Gemini (${status.model}) reads every invoice live` : 'No Gemini key yet, sample invoices use their cached AI reading'}>
        <span className="dot" />{status.ai === 'live' ? `Gemini live · ${status.model.replace('gemini-', '')}` : 'AI: cached readings'}
      </span>
      <span className={`pill ${status.db === 'supabase' ? 'approve' : ''}`} title={status.db === 'supabase' ? 'Runs are stored in Supabase Postgres' : 'In-memory store (development)'}>
        <span className="dot" />{status.db === 'supabase' ? 'Supabase connected' : 'Local memory store'}
      </span>
    </div>
  )
}
