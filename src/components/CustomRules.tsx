'use client'
import { useState } from 'react'
import { fieldDef, OP_LABEL, OPS_FOR, RULE_FIELDS, ruleSentence } from '@/lib/rules'
import type { CustomRule, RuleField, RuleOp } from '@/lib/types'
import { ISpark, IX } from './icons'
import { useToast } from './ui'

const EXAMPLES = ['Send any vendor on Gmail to a reviewer', 'Reject vendors registered less than 30 days ago', 'Review every proprietorship supplying services', 'Note every MSME vendor']
const blank = (): CustomRule => ({ id: 'cr' + Math.random().toString(36).slice(2, 7), name: '', enabled: true, conditions: [{ field: 'legal_name', op: 'contains', value: '' }], action: 'review', message: '' })

/** Finance's own IF/THEN rules. Drafted with dropdowns or from plain English; applied by code on every run. */
export function CustomRules({ rules, onChange }: { rules: CustomRule[]; onChange: (r: CustomRule[]) => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<CustomRule | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)

  async function fromEnglish() {
    setBusy(true); setAiNote(null)
    const r = await fetch('/api/rules/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) return toast(j.error || 'Could not draft the rule')
    setDraft({ ...j.rule, id: blank().id }); setAiNote('Drafted by Gemini from your sentence. Check it, then add it.')
  }
  function save() {
    if (!draft) return
    const conds = draft.conditions.filter(c => c.value.trim())
    if (!conds.length) return toast('Add at least one condition with a value')
    const r = { ...draft, conditions: conds, name: draft.name.trim() || ruleSentence({ ...draft, conditions: conds }).slice(0, 60) }
    onChange(rules.some(x => x.id === r.id) ? rules.map(x => (x.id === r.id ? r : x)) : [...rules, r])
    setDraft(null); setText(''); setAiNote(null)
  }
  const setCond = (i: number, patch: Partial<CustomRule['conditions'][number]>) => draft && setDraft({ ...draft, conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="grow"><b>Custom rules</b><div className="tiny muted">Your own IF / THEN policies, checked in the Decide stage. They can send to a reviewer, reject or add a note, never approve.</div></div></div>
      {rules.length === 0 && !draft && <div className="card-pad small muted">No custom rules yet. Describe one below, or build it with dropdowns.</div>}
      {rules.map(r => (
        <div key={r.id} className="rule" style={{ gridTemplateColumns: '1fr auto' }}>
          <div>
            <h3 className="row wrap" style={{ gap: 8 }}>{r.name}<span className={`pill ${r.action === 'reject' ? 'reject' : r.action === 'review' ? 'violet' : 'blue'}`}>{r.action === 'note' ? 'Note' : r.action === 'review' ? 'Reviewer' : 'Reject'}</span>{!r.enabled && <span className="pill">Off</span>}</h3>
            <p>{ruleSentence(r)}.{r.message && <> Message: “{r.message}”</>}</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className={`toggle ${r.enabled ? 'on' : ''}`} role="switch" aria-checked={r.enabled} aria-label="Rule on or off" onClick={() => onChange(rules.map(x => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))} />
            <button className="btn sm ghost" onClick={() => setDraft(structuredClone(r))}>Edit</button>
            <button className="btn sm ghost" aria-label="Delete rule" onClick={() => onChange(rules.filter(x => x.id !== r.id))}><IX /></button>
          </div>
        </div>
      ))}
      {!draft && (
        <div className="card-pad stack" style={{ gap: 10, borderTop: rules.length ? '1px solid var(--line)' : undefined }}>
          <label className="small" style={{ fontWeight: 600 }}>Describe a rule in plain English</label>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input grow" style={{ minWidth: 220 }} placeholder='e.g. "Send any vendor on Gmail to a reviewer"' value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim().length > 7) fromEnglish() }} />
            <button className="btn blue" disabled={busy || text.trim().length < 8} onClick={fromEnglish}><ISpark />{busy ? 'Drafting…' : 'Draft with AI'}</button>
            <button className="btn ghost" onClick={() => setDraft(blank())}>Build with dropdowns</button>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>{EXAMPLES.map(x => <button key={x} className="pill" style={{ cursor: 'pointer' }} onClick={() => setText(x)}>{x}</button>)}</div>
        </div>
      )}
      {draft && (
        <div className="card-pad stack" style={{ gap: 12, borderTop: '1px solid var(--line)', background: '#fcfcfd' }}>
          {aiNote && <div className="notice"><ISpark /><span>{aiNote}</span></div>}
          <div className="field"><label>Rule name</label><input className="input" placeholder="e.g. Webmail vendors" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field">
            <label>If all of these are true</label>
            {draft.conditions.map((c, i) => {
              const f = fieldDef(c.field)
              return (
                <div key={i} className="row wrap" style={{ gap: 8 }}>
                  <select className="input" style={{ width: 210 }} value={c.field} onChange={e => { const nf = fieldDef(e.target.value as RuleField); setCond(i, { field: nf.key, op: OPS_FOR[nf.kind][0], value: nf.kind === 'choice' ? nf.choices![0] : '' }) }}>
                    {RULE_FIELDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <select className="input" style={{ width: 140 }} value={c.op} onChange={e => setCond(i, { op: e.target.value as RuleOp })}>
                    {OPS_FOR[f.kind].map(o => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </select>
                  {f.kind === 'choice'
                    ? <select className="input grow" style={{ minWidth: 140 }} value={c.value} onChange={e => setCond(i, { value: e.target.value })}>{f.choices!.map(x => <option key={x}>{x}</option>)}</select>
                    : <input className="input grow" style={{ minWidth: 140 }} type={f.kind === 'number' ? 'number' : 'text'} placeholder={f.hint} value={c.value} onChange={e => setCond(i, { value: e.target.value })} />}
                  {draft.conditions.length > 1 && <button className="btn sm ghost" aria-label="Remove condition" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}><IX /></button>}
                </div>
              )
            })}
            {draft.conditions.length < 5 && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: 'risk', op: 'gt', value: '' }] })}>+ Add condition</button>}
          </div>
          <div className="field">
            <label>Then</label>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>{(['review', 'reject', 'note'] as const).map(a => <button key={a} className={draft.action === a ? 'on' : ''} onClick={() => setDraft({ ...draft, action: a })}>{a === 'review' ? 'Send to reviewer' : a === 'reject' ? 'Reject' : 'Add a note'}</button>)}</div>
          </div>
          <div className="field"><label>Message the reviewer sees</label><input className="input" placeholder="e.g. Call the vendor on the number given before approving." value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} /></div>
          <div className="small muted">Preview: {ruleSentence({ ...draft, conditions: draft.conditions.filter(c => c.value) .length ? draft.conditions.filter(c => c.value) : draft.conditions })}.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={save}>{rules.some(x => x.id === draft.id) ? 'Update rule' : 'Add rule'}</button>
            <button className="btn ghost" onClick={() => { setDraft(null); setAiNote(null) }}>Cancel</button>
            <span className="tiny muted">Then press Save rules.</span>
          </div>
        </div>
      )}
    </div>
  )
}
