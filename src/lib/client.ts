'use client'
import type { StreamEvent } from './types'

/** Opens the run's event stream (which also executes the run if it hasn't started) and calls onEvent per event. */
export async function streamRun(id: string, onEvent: (e: StreamEvent) => void, opts: { fast?: boolean; signal?: AbortSignal } = {}) {
  const res = await fetch(`/api/runs/${id}/stream${opts.fast ? '?fast=1' : ''}`, { cache: 'no-store', signal: opts.signal })
  if (!res.body) throw new Error('No stream')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
      const line = chunk.split('\n').find(l => l.startsWith('data: '))
      if (line) { try { onEvent(JSON.parse(line.slice(6))) } catch { /* ignore partial */ } }
    }
  }
}

