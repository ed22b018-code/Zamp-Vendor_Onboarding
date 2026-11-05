import { NextResponse } from 'next/server'
import { BANK_RECORDS, BLOCKLIST, REGISTRY, VENDORS } from '@/data/master'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vendor master (ERP + vendors VETTED onboarded), the simulated registry and bank, the blocklist and the audit trail. */
export async function GET() {
  const st = store()
  const [audit, added] = await Promise.all([st.listAudit(), st.listVendors()])
  return NextResponse.json({
    vendors: [...VENDORS, ...added], registry: Object.entries(REGISTRY).map(([gstin, r]) => ({ gstin, ...r })),
    bank: Object.entries(BANK_RECORDS).map(([account, b]) => ({ account: '••' + account.slice(-4), ...b })), blocklist: BLOCKLIST, audit,
  })
}
