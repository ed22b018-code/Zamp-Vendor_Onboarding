import type { Metadata, Viewport } from 'next'
import { Shell } from '@/components/Shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'VETTED, vendor onboarding decisions',
  description: 'From vendor submission to a reasoned Approved / Pending / Rejected decision, with every check visible and the vendor told exactly what to fix.',
  icons: { icon: '/favicon.svg' },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f5f7' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  )
}
