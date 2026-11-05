// Persistence. Supabase (Postgres) when configured, otherwise in memory for local development.
// Only the server talks to the database: every table is locked by row-level security to requests that carry
// a server-only secret header (VETTED_DB_KEY). The browser never sees a database credential.
import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from '@/data/master'
import type { AuditEntry, DocReading, Run, Settings, Vendor } from './types'
import { uid } from './util'

export interface Store {
  kind: 'supabase' | 'memory'
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  listRuns(): Promise<Run[]>
  getRun(id: string): Promise<Run | null>
  saveRun(r: Run): Promise<void>
  claimRun(id: string): Promise<boolean>
  saveFile(id: string, runId: string, b64: string): Promise<void>
  getFile(id: string): Promise<string | null>
  addAudit(e: Omit<AuditEntry, 'id' | 'at'>): Promise<void>
  listAudit(runId?: string): Promise<AuditEntry[]>
  getReading(sha: string): Promise<{ data: DocReading; model: string | null } | null>
  saveReading(sha: string, data: DocReading, model: string | null): Promise<void>
  listVendors(): Promise<Vendor[]>
  addVendor(v: Vendor): Promise<void>
  reset(opts?: { forgetReadings?: boolean }): Promise<void>
}

type Mem = { settings: Settings; runs: Map<string, Run>; files: Map<string, string>; audit: AuditEntry[]; vendors: Vendor[] }
const g = globalThis as unknown as { __vetted?: Mem; __vreadings?: Map<string, { data: DocReading; model: string | null }> }
const readings = () => (g.__vreadings ||= new Map())
function mem(): Mem { return (g.__vetted ||= { settings: { ...DEFAULT_SETTINGS }, runs: new Map(), files: new Map(), audit: [], vendors: [] }) }
const memoryStore: Store = {
  kind: 'memory',
  async getSettings() { return { ...DEFAULT_SETTINGS, ...mem().settings } },
  async saveSettings(s) { mem().settings = s },
  async listRuns() { return [...mem().runs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => structuredClone(r)) },
  async getRun(id) { const r = mem().runs.get(id); return r ? structuredClone(r) : null },
  async saveRun(r) { mem().runs.set(r.id, structuredClone(r)) },
  async claimRun(id) { const r = mem().runs.get(id); if (!r || r.status !== 'queued') return false; r.status = 'running'; return true },
  async saveFile(id, _runId, b64) { mem().files.set(id, b64) },
  async getFile(id) { return mem().files.get(id) ?? null },
  async addAudit(e) { mem().audit.unshift({ ...e, id: uid('a_'), at: new Date().toISOString() }) },
  async listAudit(runId) { return mem().audit.filter(a => !runId || a.run_id === runId) },
  async getReading(sha) { const r = readings().get(sha); return r ? structuredClone(r) : null },
  async saveReading(sha, data, model) { readings().set(sha, structuredClone({ data, model })) },
  async listVendors() { return structuredClone(mem().vendors) },
  async addVendor(v) { mem().vendors = [...mem().vendors.filter(x => x.id !== v.id), structuredClone(v)] },
  async reset(opts) { g.__vetted = undefined; if (opts?.forgetReadings) g.__vreadings = undefined; mem() },
}

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!client) client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { headers: { 'x-vetted-key': process.env.VETTED_DB_KEY! } } })
  return client
}
const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error('Database: ' + r.error.message); return r.data }

const supabaseStore: Store = {
  kind: 'supabase',
  async getSettings() { const d = must(await sb().from('settings').select('data').eq('id', 1).maybeSingle()) as { data: Settings } | null; return { ...DEFAULT_SETTINGS, ...(d?.data || {}) } },
  async saveSettings(s) { must(await sb().from('settings').upsert({ id: 1, data: s })) },
  async listRuns() { const d = must(await sb().from('runs').select('data').order('created_at', { ascending: false }).limit(500)) as { data: Run }[]; return d.map(x => x.data) },
  async getRun(id) { const d = must(await sb().from('runs').select('data').eq('id', id).maybeSingle()) as { data: Run } | null; return d?.data ?? null },
  async saveRun(r) { must(await sb().from('runs').upsert({ id: r.id, created_at: r.created_at, status: r.status, case_id: r.case_id, data: r })) },
  async claimRun(id) {
    const cur = await this.getRun(id)
    if (!cur || cur.status !== 'queued') return false
    const d = must(await sb().from('runs').update({ status: 'running', data: { ...cur, status: 'running' } }).eq('id', id).eq('status', 'queued').select('id')) as { id: string }[]
    return d.length === 1
  },
  async saveFile(id, runId, b64) { must(await sb().from('files').upsert({ id, run_id: runId, b64 })) },
  async getFile(id) { const d = must(await sb().from('files').select('b64').eq('id', id).maybeSingle()) as { b64: string } | null; return d?.b64 ?? null },
  async addAudit(e) { must(await sb().from('audit_log').insert({ id: uid('a_'), run_id: e.run_id, data: { ...e, at: new Date().toISOString() } })) },
  async listAudit(runId) {
    let q = sb().from('audit_log').select('id, at, data').order('at', { ascending: false }).limit(300)
    if (runId) q = q.eq('run_id', runId)
    const d = must(await q) as { id: string; at: string; data: AuditEntry }[]
    return d.map(x => ({ ...x.data, id: x.id, at: x.at }))
  },
  async getReading(sha) { return must(await sb().from('readings').select('data, model').eq('sha', sha).maybeSingle()) as { data: DocReading; model: string | null } | null },
  async saveReading(sha, data, model) { must(await sb().from('readings').upsert({ sha, data, model })) },
  async listVendors() { const d = must(await sb().from('vendors').select('data').order('created_at')) as { data: Vendor }[]; return d.map(x => x.data) },
  async addVendor(v) { must(await sb().from('vendors').upsert({ id: v.id, data: v })) },
  async reset(opts) {
    if (opts?.forgetReadings) must(await sb().from('readings').delete().neq('sha', ''))
    for (const t of ['vendors', 'files', 'runs', 'audit_log']) must(await sb().from(t).delete().neq('id', ''))
    must(await sb().from('settings').upsert({ id: 1, data: DEFAULT_SETTINGS }))
  },
}

export const dbConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.VETTED_DB_KEY)
export const store = (): Store => (dbConfigured() ? supabaseStore : memoryStore)
