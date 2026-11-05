import { docBytes } from '@/lib/engine'
import { store } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Serves a submitted document to the reviewer (inline). */
export async function GET(_: Request, { params }: { params: Promise<{ runId: string; docId: string }> }) {
  const { runId, docId } = await params
  const st = store()
  const run = await st.getRun(runId)
  const d = run?.submission.documents.find(x => x.id === docId)
  if (!run || !d) return new Response('Not found', { status: 404 })
  const b = await docBytes(st, run, d)
  if (!b) return new Response('File missing', { status: 404 })
  return new Response(new Uint8Array(b), { headers: { 'content-type': d.mime, 'content-disposition': `inline; filename="${d.file_name}"`, 'cache-control': 'private, max-age=3600' } })
}
