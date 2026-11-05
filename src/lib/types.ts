// VETTED domain types. A "run" is one round of checks on one vendor submission;
// a "case" groups the rounds of the same vendor (submit, fix, resubmit…).

export type BusinessType = 'Private Limited' | 'Public Limited' | 'LLP' | 'Partnership' | 'Proprietorship'
export const BUSINESS_TYPES: BusinessType[] = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship']
export type DocKind = 'gst_certificate' | 'pan_card' | 'cancelled_cheque' | 'bank_letter' | 'msme_certificate' | 'other'
export const DOC_LABEL: Record<DocKind, string> = {
  gst_certificate: 'GST registration certificate', pan_card: 'PAN card', cancelled_cheque: 'Cancelled cheque', bank_letter: 'Bank letter', msme_certificate: 'MSME (Udyam) certificate', other: 'Other document',
}

export type SubmissionDoc = { id: string; declared: DocKind; file_name: string; mime: string; sha: string; bytes: number }

export type Submission = {
  legal_name: string
  trade_name: string | null
  business_type: BusinessType
  gstin: string
  pan: string
  address: { line: string; city: string; state: string; pin: string }
  contact: { name: string; email: string; phone: string }
  bank: { account_name: string; account_number: string; ifsc: string; bank_name: string | null }
  category: 'Goods' | 'Services'
  msme: boolean
  udyam: string | null
  sponsor: { name: string; department: string } | null
  documents: SubmissionDoc[]
}

/** What Gemini read from one document. */
export type DocReading = {
  doc_id: string
  detected: DocKind
  legible: boolean
  confidence: number
  is_scanned: boolean
  fields: {
    legal_name?: string | null; trade_name?: string | null; name?: string | null
    gstin?: string | null; pan?: string | null; constitution?: string | null; state?: string | null; address?: string | null
    registration_date?: string | null; status?: string | null
    account_name?: string | null; account_number?: string | null; ifsc?: string | null; bank_name?: string | null
    udyam?: string | null; date_of_birth_or_incorporation?: string | null
  }
  notes: string[]
}
export type Reading = { docs: DocReading[] }

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'
export type Check = { label: string; status: CheckStatus; detail?: string }
export type StageKey = 'intake' | 'complete' | 'read' | 'format' | 'cross' | 'verify' | 'fraud' | 'decide' | 'explain' | 'record'
export type StageStatus = 'pending' | 'running' | 'pass' | 'warn' | 'fail' | 'skip'
export type Stage = { key: StageKey; title: string; by: 'code' | 'ai' | 'ai+code'; status: StageStatus; summary?: string; checks: Check[]; data?: Record<string, unknown>; ms?: number }

/** reject: never onboard · vendor: the vendor must fix or send something · review: a person here must decide · info: note only */
export type Severity = 'reject' | 'vendor' | 'review' | 'info'
export type Finding = { code: string; severity: Severity; stage: StageKey; title: string; detail: string; ask?: Ask | null }
/** A precise request back to the vendor; drives the fix page. */
export type Ask = { kind: 'document'; doc: DocKind; text: string } | { kind: 'field'; field: FixField; text: string } | { kind: 'confirm'; text: string }
export type FixField = 'legal_name' | 'business_type' | 'gstin' | 'pan' | 'bank' | 'udyam' | 'address' | 'email'

export type Decision = 'approved' | 'pending' | 'rejected'

export type Outcome = {
  decision: Decision
  waiting_on: 'vendor' | 'reviewer' | null
  risk: number
  headline: string
  summary: string
  next_steps: string[]
  vendor_email: { to: string; subject: string; body: string } | null
  findings: Finding[]
  asks: Ask[]
  vendor_id: string | null
  explained_by: 'ai' | 'template'
}

export type Review = { action: 'approve' | 'reject' | 'request'; note: string; reviewer: string; at: string }

export type RunStatus = 'queued' | 'running' | 'done' | 'error'
export type Run = {
  id: string
  case_id: string
  round: number
  created_at: string
  source: 'inbox' | 'portal' | 'resubmission' | 'rerun'
  sample_id: string | null
  submission: Submission
  status: RunStatus
  stages: Stage[]
  reading: Reading | null
  reading_source: 'ai' | 'cached' | 'reused' | null
  reading_model?: string | null
  decision: Decision | null
  final_decision: Decision | null
  duration_ms: number | null
  error: string | null
  review: Review | null
  superseded_by: string | null
  previous_run: string | null
  changes: string[]
  outcome: Outcome | null
  settings_snapshot: Settings | null
}

export type Vendor = {
  id: string
  name: string
  trade_name?: string | null
  gstin: string
  pan: string
  business_type?: BusinessType
  state: string
  address: string
  status: 'active' | 'blocked'
  bank: { bank_name: string; account_number: string; ifsc: string; account_name?: string }
  contact: { name: string; phone: string; email: string }
  onboarded?: { by: string; at: string; run_id: string; case_id: string; rounds: number }
}

export type AuditEntry = { id: string; run_id: string | null; at: string; actor: string; action: string; detail: string }

export type RuleField = 'legal_name' | 'business_type' | 'state' | 'category' | 'msme' | 'email_domain' | 'sponsor_department' | 'risk' | 'registration_age_days'
export type RuleOp = 'is' | 'is_not' | 'contains' | 'not_contains' | 'gt' | 'lt'
export type CustomRule = { id: string; name: string; enabled: boolean; conditions: { field: RuleField; op: RuleOp; value: string }[]; action: 'review' | 'reject' | 'note'; message: string }

export type Settings = {
  nameMatchStrict: number          // 0.6–1: how close names must be before a mismatch is raised
  minConfidence: number            // below this AI confidence on a key field, a person confirms
  newRegistrationDays: number      // GST registrations younger than this are flagged
  riskReviewThreshold: number      // risk score at or above which a person reviews
  freeEmailAction: 'info' | 'review'
  requireMsmeCert: boolean
  requireSponsor: boolean
  sharedBankAction: 'reject' | 'review'
  liveIfsc: boolean
  customRules: CustomRule[]
  useCachedReadings: boolean
}

export type StreamEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'reading'; reading: Reading; source: 'ai' | 'cached' | 'reused' }
  | { type: 'notice'; message: string }
  | { type: 'done'; run: Run }
  | { type: 'error'; message: string }
