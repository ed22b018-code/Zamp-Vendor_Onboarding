// Tax ID and bank identifier rules per country. Formats and check digits are the real ones;
// a live registry lookup (GST portal, HMRC/VIES, IRS, FTA, IRAS) would sit behind these in production.
import type { Country } from './types'
import { gstinChecksumOk, GSTIN_RE } from './util'

export const ISO: Record<Country, string> = { India: 'IN', 'United States': 'US', 'United Kingdom': 'GB', 'United Arab Emirates': 'AE', Singapore: 'SG' }

/** UK VAT: 9 digits, mod-97 check (both the original and the 9755 scheme). */
function ukVatOk(d: string) {
  const n = d.replace(/^GB/, '')
  if (!/^\d{9}$/.test(n)) return false
  const sum = [8, 7, 6, 5, 4, 3, 2].reduce((a, w, i) => a + w * Number(n[i]), 0) + Number(n.slice(7))
  return sum % 97 === 0 || (sum + 55) % 97 === 0
}
/** US EIN: 9 digits; the 2-digit prefix must be one the IRS issues. */
const EIN_PREFIX = new Set([...range(1, 6), ...range(10, 16), ...range(20, 27), ...range(30, 48), ...range(50, 68), ...range(71, 77), ...range(80, 88), ...range(90, 95), 98, 99].map(n => String(n).padStart(2, '0')))
function range(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i) }

export type TaxRule = { label: string; example: string; normalise: (s: string) => string; ok: (s: string) => boolean; why: string }
export const TAX_RULES: Record<Country, TaxRule> = {
  India: { label: 'GSTIN', example: '33ABCDE1234F1Z5', normalise: s => s.toUpperCase().replace(/\s/g, ''), ok: s => GSTIN_RE.test(s) && gstinChecksumOk(s), why: '15 characters: state code, PAN, entity number, Z and a check character' },
  'United States': { label: 'EIN', example: '12-3456789', normalise: s => s.replace(/\D/g, '').replace(/^(\d{2})(\d{7})$/, '$1-$2'), ok: s => /^\d{2}-\d{7}$/.test(s) && EIN_PREFIX.has(s.slice(0, 2)), why: '9 digits as XX-XXXXXXX, with a prefix the IRS issues' },
  'United Kingdom': { label: 'VAT number', example: 'GB293615284', normalise: s => s.toUpperCase().replace(/[\s.-]/g, '').replace(/^(?!GB)(\d{9})$/, 'GB$1'), ok: ukVatOk, why: 'GB followed by 9 digits that pass the HMRC mod-97 check' },
  'United Arab Emirates': { label: 'TRN', example: '100123456700003', normalise: s => s.replace(/\D/g, ''), ok: s => /^100\d{12}$/.test(s), why: '15 digits starting with 100' },
  Singapore: { label: 'GST registration no. / UEN', example: '201912345K', normalise: s => s.toUpperCase().replace(/\s/g, ''), ok: s => /^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z]|M\d{8}[A-Z])$/.test(s), why: 'a UEN (e.g. 201912345K) or an M-prefixed GST number' },
}

/** Which country's tax ID does this string actually look like? (Used to explain a mismatch.) */
export function looksLike(raw: string): { country: Country; label: string } | null {
  const s = raw.toUpperCase().replace(/[\s.-]/g, '')
  if (GSTIN_RE.test(s)) return { country: 'India', label: 'Indian GSTIN' }
  if (/^GB\d{9}$/.test(s)) return { country: 'United Kingdom', label: 'UK VAT number' }
  if (/^100\d{12}$/.test(s)) return { country: 'United Arab Emirates', label: 'UAE TRN' }
  if (/^\d{9}$/.test(s) && EIN_PREFIX.has(s.slice(0, 2))) return { country: 'United States', label: 'US EIN' }
  if (/^(\d{8,9}[A-Z]|M\d{8}[A-Z])$/.test(s)) return { country: 'Singapore', label: 'Singapore UEN' }
  return null
}

export const SWIFT_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/
const IBAN_LEN: Partial<Record<string, number>> = { GB: 22, AE: 23 }
export const ibanRequired = (c: Country) => ISO[c] in IBAN_LEN
/** IBAN: country prefix, length and the ISO 13616 mod-97 check. */
export function ibanCheck(raw: string): { ok: boolean; country: string; why?: string } {
  const s = raw.toUpperCase().replace(/\s/g, '')
  const cc = s.slice(0, 2)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return { ok: false, country: cc, why: 'not an IBAN format' }
  if (IBAN_LEN[cc] && s.length !== IBAN_LEN[cc]) return { ok: false, country: cc, why: `${cc} IBANs are ${IBAN_LEN[cc]} characters` }
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55))
  let r = 0; for (const d of moved) r = (r * 10 + Number(d)) % 97
  return r === 1 ? { ok: true, country: cc } : { ok: false, country: cc, why: 'check digits are wrong' }
}

/** "an Indian GSTIN", "a UK VAT number". */
export const withArticle = (label: string) => `${/^(Indian|EIN|[AEIO])/.test(label) && !/^(UK|UAE|US)\b/.test(label) ? 'an' : 'a'} ${label}`
