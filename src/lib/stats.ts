// Dashboard numbers, computed from runs. A "case" is one vendor; its latest round is its current state.
import type { Decision, Run } from './types'

export type RunRow = Pick<Run, 'id' | 'case_id' | 'round' | 'created_at' | 'source' | 'sample_id' | 'status' | 'decision' | 'final_decision' | 'duration_ms' | 'review' | 'superseded_by' | 'previous_run'> & { submission: Run['submission']; outcome: Run['outcome']; stages: { key: string; status: string }[] }

export const MIN_BY_HAND = 45 // minutes for a person to check one vendor submission end to end
const GROUP: Record<string, string> = {
  'VER-BANK-NAME': 'Bank account not in vendor\'s name', 'VER-BANK-UNKNOWN': 'Bank account not verified', 'FRAUD-SHARED-BANK': 'Bank account used by another vendor', 'FRAUD-SHARED-CONTACT': 'Contact shared with another vendor', 'FRAUD-BLOCKED': 'Blocklisted entity', 'FRAUD-OWN-GSTIN': 'Fraud signal',
  'XCK-PAN-GSTIN': 'GSTIN belongs to another business', 'VER-GST-NAME': 'GSTIN belongs to another business', 'XCK-NAME-GST': 'GSTIN belongs to another business', 'VER-GST-INACTIVE': 'GST registration cancelled', 'VER-GST-UNKNOWN': 'GSTIN not verified',
  'DOC-WRONG': 'Wrong or missing document', 'CMP-DOC': 'Wrong or missing document', 'DOC-ILLEGIBLE': 'Wrong or missing document', 'CMP-FIELD': 'Missing information', 'CMP-UDYAM': 'Missing information',
  'XCK-BIZTYPE': 'Business type inconsistent', 'XCK-STATE': 'State inconsistent', 'RISK-HIGH': 'High combined risk', 'DUP-VENDOR': 'Already a vendor',
}
export const groupOf = (code: string) => GROUP[code] || (code.startsWith('CUSTOM') ? 'Custom rule' : code.startsWith('FMT') ? 'Malformed identifier' : code.startsWith('XCK') ? 'Form and documents disagree' : 'Other')

export function currentState(r: RunRow): { decision: Decision | null; waiting: 'vendor' | 'reviewer' | null } {
  const d = r.final_decision || r.decision
  return { decision: d, waiting: d === 'pending' ? r.outcome?.waiting_on ?? 'reviewer' : null }
}

export function computeStats(runs: RunRow[]) {
  const done = runs.filter(r => r.status === 'done')
  const cases = new Map<string, RunRow[]>()
  for (const r of done) cases.set(r.case_id, [...(cases.get(r.case_id) || []), r].sort((a, b) => a.round - b.round))
  const latest = [...cases.values()].map(rs => rs[rs.length - 1])
  const st = latest.map(currentState)
  const approved = st.filter(s => s.decision === 'approved').length, rejected = st.filter(s => s.decision === 'rejected').length
  const waitingVendor = st.filter(s => s.waiting === 'vendor').length, waitingReviewer = st.filter(s => s.waiting === 'reviewer').length
  const firsts = [...cases.values()].map(rs => rs[0])
  const firstPass = firsts.filter(r => r.decision === 'approved').length
  const approvedCases = [...cases.values()].filter(rs => currentState(rs[rs.length - 1]).decision === 'approved')
  const avgRounds = approvedCases.length ? approvedCases.reduce((a, rs) => a + rs[rs.length - 1].round, 0) / approvedCases.length : 0
  const fraud = latest.filter(r => r.outcome?.findings.some(f => f.code.startsWith('FRAUD') || f.code === 'XCK-PAN-GSTIN' || f.code === 'VER-GST-NAME')).length
  const secs = done.filter(r => r.duration_ms).map(r => r.duration_ms! / 1000)
  const reasons = new Map<string, number>()
  for (const r of latest) { const seen = new Set<string>(); for (const f of r.outcome?.findings || []) if (f.severity !== 'info') { const g = groupOf(f.code); if (!seen.has(g)) { seen.add(g); reasons.set(g, (reasons.get(g) || 0) + 1) } } }
  return {
    cases: cases.size, rounds: done.length, approved, rejected, pending: waitingVendor + waitingReviewer, waitingVendor, waitingReviewer,
    firstPassRate: cases.size ? firstPass / cases.size : 0, avgRounds, fraud, avgSecs: secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0,
    hoursSaved: (cases.size * MIN_BY_HAND - waitingReviewer * 10) / 60, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), latest,
  }
}
