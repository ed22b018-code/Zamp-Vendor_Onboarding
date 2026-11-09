// VETTED's reference data. In production each of these is a live system:
// the ERP vendor master, a GST Suvidha Provider (registry lookups), the bank's penny-drop API and an IFSC directory.
// Here the registry and bank records are realistic simulations, labelled as such in the UI. IFSC lookups are real.
import data from './samples.json'
import type { BusinessType, DocKind, Settings, Vendor } from '@/lib/types'

export const BUYER = { name: 'Northwind Retail India Pvt Ltd', gstin: '33AAFCN5517L1ZC', state: '33', city: 'Chennai' }

type VV = { id: string; name: string; gstin: string; pan: string; account_number: string; ifsc: string; bank_name: string; phone: string; email: string; address: string }
/** Approved vendors already in the ERP (the same vendor master VERITY pays from). */
export const VENDORS: Vendor[] = (data.verity_vendors as VV[]).map(v => ({
  id: v.id, name: v.name, gstin: v.gstin, pan: v.pan, state: v.gstin.slice(0, 2), address: v.address, status: 'active',
  bank: { bank_name: v.bank_name, account_number: v.account_number, ifsc: v.ifsc }, contact: { name: 'Accounts', phone: v.phone, email: v.email },
}))

export type RegistryEntry = { legal_name: string; trade_name: string; constitution: string; status: 'Active' | 'Cancelled' | 'Suspended'; registration_date: string; cancellation_date: string | null; state: string; principal_place: string }
/** Simulated GST registry (what a GSP API returns for a GSTIN). */
export const REGISTRY = data.registry as Record<string, RegistryEntry>
/** Simulated penny-drop: the bank returns the account holder's name for a ₹1 test credit. */
export const BANK_RECORDS = data.bank_records as Record<string, { holder: string; ifsc: string; status: string }>

/** Entities Northwind must not onboard (debarred, past fraud). */
export const BLOCKLIST: { pan: string; name: string; reason: string }[] = [
  { pan: 'AAQCS9001K', name: 'Sterling Office Mart Pvt Ltd', reason: 'Debarred in 2025 after invoicing for undelivered goods' },
]

/** IFSC snapshot used when the live directory can't be reached (codes checked against the public directory). */
export const IFSC_SNAPSHOT: Record<string, { bank: string; branch: string; city: string; state: string }> = {
  HDFC0000082: { bank: 'HDFC Bank', branch: 'CHENNAI - NUNGAMBAKKAM', city: 'CHENNAI', state: 'TAMIL NADU' },
  ICIC0000001: { bank: 'ICICI Bank', branch: 'CHENNAICENOTAPH ROAD', city: 'CHENNAI', state: 'TAMIL NADU' },
  UTIB0000006: { bank: 'Axis Bank', branch: 'CHENNAI', city: 'CHENNAI', state: 'TAMIL NADU' },
  SBIN0000800: { bank: 'State Bank of India', branch: 'CHENNAI MAIN', city: 'CHENNAI', state: 'TAMIL NADU' },
  HDFC0001234: { bank: 'HDFC Bank', branch: 'PARK STREET', city: 'JAIPUR', state: 'RAJASTHAN' },
  HDFC0000140: { bank: 'HDFC Bank', branch: 'RT NAGAR', city: 'BANGALORE URBAN', state: 'KARNATAKA' },
  KKBK0000462: { bank: 'Kotak Mahindra Bank', branch: 'CHENNAI - ANNAI SALAI', city: 'CHENNAI', state: 'TAMIL NADU' },
  CIUB0000001: { bank: 'City Union Bank', branch: 'CHENNAI T NAGAR', city: 'CHENNAI', state: 'TAMIL NADU' },
  IOBA0000002: { bank: 'Indian Overseas Bank', branch: 'ADYAR', city: 'CHENNAI', state: 'TAMIL NADU' },
}

/** PAN 4th character → kind of taxpayer. */
export const PAN_ENTITY: Record<string, { label: string; fits: BusinessType[] }> = {
  C: { label: 'Company', fits: ['Private Limited', 'Public Limited'] },
  F: { label: 'Firm or LLP', fits: ['Partnership', 'LLP'] },
  P: { label: 'Individual', fits: ['Proprietorship'] },
  H: { label: 'Hindu Undivided Family', fits: [] }, A: { label: 'Association of Persons', fits: [] }, T: { label: 'Trust', fits: [] },
}
/** GST "Constitution of Business" → business type. */
export const CONSTITUTION: Record<string, BusinessType> = {
  'private limited company': 'Private Limited', 'public limited company': 'Public Limited', 'limited liability partnership': 'LLP', llp: 'LLP',
  partnership: 'Partnership', proprietorship: 'Proprietorship', 'sole proprietorship': 'Proprietorship',
}

export const FREE_EMAIL = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'live.com', 'icloud.com', 'proton.me']
export const DEPARTMENTS = ['Admin', 'IT', 'Facilities', 'Store Fit-outs', 'Warehouse', 'Marketing', 'Finance']

export function requiredDocs(s: { msme: boolean; country?: string }, st: Settings): { kind: DocKind | 'bank_proof'; label: string }[] {
  if (s.country && s.country !== 'India') return [{ kind: 'tax_certificate', label: 'Tax registration certificate' }, { kind: 'bank_proof', label: 'Bank letter or cancelled cheque' }]
  const r: { kind: DocKind | 'bank_proof'; label: string }[] = [
    { kind: 'gst_certificate', label: 'GST registration certificate' }, { kind: 'pan_card', label: 'PAN card' }, { kind: 'bank_proof', label: 'Cancelled cheque or bank letter' },
  ]
  if (s.msme && st.requireMsmeCert) r.push({ kind: 'msme_certificate', label: 'MSME (Udyam) certificate' })
  return r
}

export const DEFAULT_SETTINGS: Settings = {
  nameMatchStrict: 0.82,
  minConfidence: 0.85,
  newRegistrationDays: 90,
  riskReviewThreshold: 50,
  freeEmailAction: 'info',
  requireMsmeCert: true,
  requireSponsor: false,
  sharedBankAction: 'reject',
  liveIfsc: true,
  foreignNeedsReview: false,
  customRules: [],
  useCachedReadings: true,
}
