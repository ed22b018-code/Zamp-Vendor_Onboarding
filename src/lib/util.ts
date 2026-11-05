// Small, deterministic helpers shared by the engine and the UI.

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** GSTIN check digit (mod-36 Luhn variant used by the GST network). */
export function gstinChecksumOk(g: string): boolean {
  const s = g.toUpperCase()
  if (!GSTIN_RE.test(s)) return false
  let total = 0
  for (let i = 0; i < 14; i++) {
    const p = GST_CHARS.indexOf(s[i]) * (i % 2 === 0 ? 1 : 2)
    total += Math.floor(p / 36) + (p % 36)
  }
  return GST_CHARS[(36 - (total % 36)) % 36] === s[14]
}

export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

export function inr(n: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  const dec = opts.decimals ?? !Number.isInteger(Math.round(n * 100) / 100)
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 })
}

export function compactInr(n: number): string {
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L'
  return inr(Math.round(n))
}

export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d).replace(/\.0+$/, '')}%`

export function fmtDate(d: string | null | undefined) {
  if (!d) return '-'
  const t = new Date(d.length === 10 ? d + 'T00:00:00+05:30' : d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export function ago(d: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const STOP = new Set(['the', 'of', 'and', 'with', 'for', 'a', 'an', 'nos', 'in', 'x', 'pc', 'per', '-', '-'])
export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').map(t => t.replace(/\.$/, '')).filter(t => t && !STOP.has(t))
}
/** Dice similarity over word tokens (0..1). */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let hit = 0
  A.forEach(t => { if (B.has(t)) hit++ })
  return (2 * hit) / (A.size + B.size)
}

export function normCompany(s: string) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/\b(pvt|private|ltd|limited|llp|co|company|and|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}

export const round2 = (n: number) => Math.round(n * 100) / 100
export const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
export const last4 = (s: string | null | undefined) => (s ? '••' + s.replace(/\s/g, '').slice(-4) : '-')

export const PAN_RE = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/
export const PIN_RE = /^[1-9]\d{5}$/
/** First digit(s) of a PIN code → postal region, used to sanity-check a declared state. */
export const PIN_STATE: Record<string, string[]> = {
  '60': ['Tamil Nadu', 'Puducherry'], '61': ['Tamil Nadu', 'Puducherry'], '62': ['Tamil Nadu'], '63': ['Tamil Nadu'], '64': ['Tamil Nadu'],
  '56': ['Karnataka'], '57': ['Karnataka'], '58': ['Karnataka'], '59': ['Karnataka'], '40': ['Maharashtra', 'Goa'], '41': ['Maharashtra'], '42': ['Maharashtra'], '43': ['Maharashtra'], '44': ['Maharashtra'],
  '11': ['Delhi'], '50': ['Telangana', 'Andhra Pradesh'], '51': ['Andhra Pradesh', 'Telangana'], '52': ['Andhra Pradesh'], '53': ['Andhra Pradesh'], '67': ['Kerala'], '68': ['Kerala'], '69': ['Kerala'],
  '36': ['Gujarat'], '37': ['Gujarat'], '38': ['Gujarat'], '39': ['Gujarat'], '70': ['West Bengal'], '71': ['West Bengal'], '72': ['West Bengal'], '73': ['West Bengal'],
}
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
