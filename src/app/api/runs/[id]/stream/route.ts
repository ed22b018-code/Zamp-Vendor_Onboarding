// Server-Sent Events: executes the pipeline (if not already started) and streams each stage as it happens.
import { runPipeline } from '@/lib/engine'
import { store } from '@/lib/store'
import type { StreamEvent } from '@/lib/types'
import { sleep } from '@/lib/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
const STALE_MS = 150_000

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fast = new URL(req.url).searchParams.get('fast') === '1'
  const st = store()
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let open = true
      const send = (e: StreamEvent) => { if (open) try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)) } catch { open = false } }
      try {
        const run = await st.getRun(id)
        if (!run) { send({ type: 'error', message: 'Run not found' }); return }
        if (run.status === 'done' || run.status === 'error') { send({ type: 'done', run }); return }
        // Recovery: a run left "running" (e.g. the tab was closed mid-run and the function was frozen) is restarted.
        if (run.status === 'running' && Date.now() - new Date(run.created_at).getTime() > STALE_MS) { run.status = 'queued'; await st.saveRun(run) }
        if (await st.claimRun(id)) {
          try { const done = await runPipeline(run, st, send, { fast }); send({ type: 'done', run: done }) }
          catch (e) { run.status = 'error'; run.error = (e as Error).message; await st.saveRun(run); send({ type: 'error', message: run.error }) }
        } else {
          // Someone else is executing it, follow along by polling.
          for (let i = 0; i < 120; i++) {
            const r = await st.getRun(id)
            if (!r) break
            for (const s of r.stages) send({ type: 'stage', stage: s })
            if (r.status === 'done' || r.status === 'error') { send({ type: 'done', run: r }); break }
            await sleep(500)
          }
        }
      } finally { open = false; try { controller.close() } catch { /* closed */ } }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } })
}
