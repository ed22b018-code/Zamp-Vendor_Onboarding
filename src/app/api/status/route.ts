import { NextResponse } from 'next/server'
import { aiConfigured, aiModel, aiModels, aiPing, aiProbe } from '@/lib/gemini'
import { dbConfigured } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.get('check') === '1'
  return NextResponse.json({
    ai: aiConfigured() ? 'live' : 'cached',
    model: aiModel(),
    db: dbConfigured() ? 'supabase' : 'memory',
    ...(check && aiConfigured() ? { ping: await aiPing() } : {}),
    ...(new URL(req.url).searchParams.get('probe') && aiConfigured() ? { probe: await aiProbe(new URL(req.url).searchParams.get('probe')!.split(',').slice(0, 8)) } : {}),
    ...(new URL(req.url).searchParams.get('models') === '1' && aiConfigured() ? { available: await aiModels() } : {}),
  })
}
