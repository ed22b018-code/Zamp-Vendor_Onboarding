// Vendor-facing case status (the fix link). Shows only what the vendor may see.
import { NextResponse } from 'next/server'
import { publicCase } from '@/lib/intake'
import { latestOfCase } from '@/lib/cases'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const run = await latestOfCase(caseId)
  if (!run) return NextResponse.json({ error: 'We could not find this registration' }, { status: 404 })
  return NextResponse.json(publicCase(run))
}
