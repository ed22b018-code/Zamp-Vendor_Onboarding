import 'server-only'
import { store } from './store'

/** The current (latest, not superseded) round of a case. */
export async function latestOfCase(caseId: string) {
  const runs = (await store().listRuns()).filter(r => r.case_id === caseId && !r.superseded_by)
  return runs.sort((a, b) => b.round - a.round || b.created_at.localeCompare(a.created_at))[0] || null
}
