// The demo submissions that arrive in the simulated onboarding inbox, and their cached readings.
// A cached reading is what Gemini returns for those exact documents; it is used only when live AI is unavailable,
// and the UI always labels it as cached.
import data from '@/data/samples.json'
import type { DocKind, DocReading, Reading, Submission } from './types'

export type SampleDoc = { id: string; declared: DocKind; file: string; mime: string }
export type Sample = {
  id: string; type: string; scenario: string; expect: 'approved' | 'pending' | 'rejected'; title: string
  email: { from: string; subject: string; body: string; received: string }
  submission: Omit<Submission, 'documents'>
  docs: SampleDoc[]
  truth: { doc_id: string; detected: DocKind; fields: DocReading['fields'] }[]
}
export const SAMPLES = (data as unknown as { samples: Sample[] }).samples
export const FIX_V02 = (data as unknown as { fix_v02: { bank: Submission['bank']; doc: { declared: DocKind; file: string; mime: string } } }).fix_v02
export const sampleById = (id: string | null | undefined) => SAMPLES.find(s => s.id === id) || null

const SCANNED = new Set(['v08'])
/** Cached reading for a sample's documents, keyed by document id (so a resubmission can mix cached and new docs). */
export function cachedDoc(sampleId: string, docId: string): DocReading | null {
  const s = sampleById(sampleId); const t = s?.truth.find(x => x.doc_id === docId)
  if (!s || !t) return null
  const scanned = SCANNED.has(sampleId) && !s.docs.find(d => d.id === docId)?.file.endsWith('.pdf')
  const notes: string[] = []
  if (scanned) notes.push('Scanned image, read visually.')
  const declared = s.docs.find(d => d.id === docId)?.declared
  if (declared && declared !== t.detected) notes.push(`Uploaded as ${declared.replace('_', ' ')}, but the document is a ${t.detected.replace('_', ' ')}.`)
  return { doc_id: docId, detected: t.detected, legible: true, confidence: scanned ? 0.9 : 0.98, is_scanned: scanned, fields: { ...t.fields }, notes }
}
export function cachedReading(sampleId: string, docIds: string[]): Reading | null {
  const docs = docIds.map(id => cachedDoc(sampleId, id)).filter(Boolean) as DocReading[]
  return docs.length === docIds.length ? { docs } : null
}

export type DemoFix = { bank?: Submission['bank'] | null; file?: string; holder?: string; fields?: Record<string, string> }
export const FIXES = (data as unknown as { fixes: Record<string, DemoFix> }).fixes

/** Cached reading for a document by its file name within a sample folder (includes the demo corrections). */
export function cachedByFile(sampleId: string, file: string): DocReading | null {
  const s = sampleById(sampleId); if (!s) return null
  const d = s.docs.find(x => x.file === file)
  if (d) return cachedDoc(sampleId, d.id)
  const fx = FIXES[sampleId]
  if (fx?.file === file) {
    const bank = fx.bank || s.submission.bank
    return { doc_id: 'fix', detected: 'cancelled_cheque', legible: true, confidence: 0.98, is_scanned: false, notes: [], fields: { account_name: fx.holder || bank.account_name.toUpperCase(), account_number: bank.account_number, ifsc: bank.ifsc, bank_name: bank.bank_name } }
  }
  return null
}
