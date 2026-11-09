// Finance's own IF / THEN onboarding policies. Shared by the Rules page, the AI drafter and the engine.
import type { CustomRule, RuleField, RuleOp } from './types'
import { DEPARTMENTS } from '@/data/master'

export const RULE_FIELDS: { key: RuleField; label: string; kind: 'text' | 'number' | 'choice'; choices?: string[]; hint: string }[] = [
  { key: 'legal_name', label: 'Vendor name', kind: 'text', hint: 'e.g. Traders' },
  { key: 'country', label: 'Country', kind: 'choice', choices: ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Singapore'], hint: '' },
  { key: 'business_type', label: 'Business type', kind: 'choice', choices: ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship'], hint: '' },
  { key: 'state', label: 'State', kind: 'text', hint: 'e.g. Tamil Nadu' },
  { key: 'category', label: 'Supplies', kind: 'choice', choices: ['Goods', 'Services'], hint: '' },
  { key: 'msme', label: 'Declared MSME', kind: 'choice', choices: ['yes', 'no'], hint: '' },
  { key: 'email_domain', label: 'Email domain', kind: 'text', hint: 'e.g. gmail.com' },
  { key: 'sponsor_department', label: 'Sponsor department', kind: 'choice', choices: [...DEPARTMENTS, 'none'], hint: '' },
  { key: 'risk', label: 'Risk score (0 to 100)', kind: 'number', hint: 'e.g. 40' },
  { key: 'registration_age_days', label: 'Days since GST registration', kind: 'number', hint: 'e.g. 180' },
]
export const OPS_FOR: Record<'text' | 'number' | 'choice', RuleOp[]> = { text: ['is', 'is_not', 'contains', 'not_contains'], number: ['gt', 'lt', 'is'], choice: ['is', 'is_not'] }
export const OP_LABEL: Record<RuleOp, string> = { is: 'is', is_not: 'is not', contains: 'contains', not_contains: "doesn't contain", gt: 'is above', lt: 'is below' }
export const fieldDef = (k: RuleField) => RULE_FIELDS.find(f => f.key === k)!
const ACTION: Record<CustomRule['action'], string> = { review: 'send it to a reviewer', reject: 'reject it', note: 'add a note' }

export function ruleSentence(r: Pick<CustomRule, 'conditions' | 'action'>) {
  const parts = r.conditions.map(c => { const f = fieldDef(c.field); const v = f.kind === 'number' ? Number(c.value).toLocaleString('en-IN') : `"${c.value}"`; return `${f.label.replace(/ \(.*\)/, '').replace(/^[A-Z][a-z]/, m => m.toLowerCase())} ${OP_LABEL[c.op]} ${v}` })
  return `If ${parts.join(' and ') || '…'}, then ${ACTION[r.action]}`
}

export function sanitizeRules(input: unknown): CustomRule[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 20).map((r, i): CustomRule | null => {
    const x = r as Partial<CustomRule>
    const conditions = (Array.isArray(x.conditions) ? x.conditions : []).slice(0, 5).map(c => {
      const f = RULE_FIELDS.find(k => k.key === c?.field); if (!f) return null
      const op = OPS_FOR[f.kind].includes(c.op as RuleOp) ? (c.op as RuleOp) : OPS_FOR[f.kind][0]
      let value = String(c.value ?? '').trim().slice(0, 80)
      if (f.kind === 'number') value = String(Number(value.replace(/[,\s]/g, '')) || 0)
      if (!value) return null
      return { field: f.key, op, value }
    }).filter(Boolean) as CustomRule['conditions']
    if (!conditions.length) return null
    return { id: String(x.id || `cr${i}`).slice(0, 20), name: String(x.name || '').trim().slice(0, 60) || ruleSentence({ conditions, action: 'review' }).slice(0, 60), enabled: x.enabled !== false, conditions, action: x.action === 'reject' ? 'reject' : x.action === 'note' ? 'note' : 'review', message: String(x.message || '').trim().slice(0, 200) }
  }).filter(Boolean) as CustomRule[]
}
