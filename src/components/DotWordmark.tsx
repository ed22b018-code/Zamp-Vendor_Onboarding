'use client'
import { useEffect, useRef } from 'react'

/* Dotted wordmark (same component as the portfolio): dots assemble on load,
   scatter away from the pointer and spring back. An idle wave of colour sweeps
   through every few seconds. `align` and `density` let it double as the decision stamp. */

type Props = {
  lines: string[]; narrowLines?: string[]; palette?: string[]; ink?: string; label: string; align?: 'left' | 'center'; density?: number
  /** Footer style (like zamp.ai): the VERITY mark drawn in dots before the word, fat touching dots, hollow rings when disturbed, no idle wave. */
  logo?: boolean; dotRatio?: number; hollow?: boolean; wave?: boolean; className?: string
}

type Dot = { x: number; y: number; hx: number; hy: number; vx: number; vy: number; heat: number; c: string; delay: number; o: boolean }

export function DotWordmark({ lines, narrowLines, palette = ['#0071e3', '#ff9f0a', '#bf5af2', '#30d158'], ink = '#1d1d1f', label, align = 'left', density = 1, logo = false, dotRatio = 0.32, hollow = false, wave: waveOn = true, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const instant = matchMedia('(max-width: 640px), (pointer: coarse)').matches
    let dots: Dot[] = []
    let W = 0, H = 0, raf = 0, alive = true, gap = 8, r = 2.5
    const t0 = performance.now()
    let ptr = { x: -999, y: -999 }

    function setup() {
      W = canvas!.clientWidth; H = canvas!.clientHeight
      if (!W || !H) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = W * dpr; canvas!.height = H * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const m = document.createElement('canvas'); m.width = W; m.height = H
      const mc = m.getContext('2d'); if (!mc) return
      const words = W < 640 && narrowLines ? narrowLines : lines
      const font = (s: number) => `800 ${s}px -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", Arial, sans-serif`
      mc.font = font(100)
      // The mark: VERITY's 3x3 dot "V", sized to the lowercase letters and set before the word.
      const markAt100 = logo ? 62 : 0, spaceAt100 = logo ? 14 : 0
      const widestAt100 = Math.max(...words.map(w => mc.measureText(w).width)) + markAt100 + spaceAt100
      const size = Math.min(H / words.length * (logo ? 1.05 : 0.86), (W * 0.98 / widestAt100) * 100)
      mc.font = font(size)
      mc.textAlign = logo ? 'left' : align; mc.textBaseline = logo ? 'alphabetic' : 'middle'
      const lineH = size * 1.02
      const top = H / 2 - (lineH * (words.length - 1)) / 2
      if (logo) {
        const xh = mc.measureText('x').actualBoundingBoxAscent || size * 0.52
        const base = H / 2 + xh / 2
        const m = xh * 1.12, cell = m / 3, cy0 = base - m
        for (const [cx, cy] of [[0, 0], [2, 0], [0, 1], [2, 1], [1, 2]]) { mc.beginPath(); mc.arc(cell * (cx + 0.5), cy0 + cell * (cy + 0.5), cell * 0.5, 0, Math.PI * 2); mc.fill() }
        mc.fillText(words[0], m + (spaceAt100 / 100) * size, base)
      } else words.forEach((w, i) => mc.fillText(w, align === 'center' ? W / 2 : 0, top + i * lineH))
      const px = mc.getImageData(0, 0, W, H).data
      gap = Math.max(3, Math.round((W < 520 ? 5 : W < 900 ? 6 : 7) * density))
      r = gap * dotRatio
      const old = dots; dots = []
      for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) {
        if (px[(Math.round(y) * W + Math.round(x)) * 4 + 3] > 120) {
          // Phones and touch screens get the finished wordmark instantly; desktops see a quick assemble.
          const settled = still.matches || old.length > 0 || instant
          dots.push({
            x: settled ? x : x + (Math.random() - 0.5) * W * 0.35,
            y: settled ? y : y + (Math.random() - 0.5) * H * 1.1,
            hx: x, hy: y, vx: 0, vy: 0,
            heat: settled ? 0 : 1,
            c: palette[(Math.floor(x / gap) * 7 + Math.floor(y / gap) * 3) % palette.length],
            delay: settled ? 0 : Math.random() * 10,
            o: hollow && Math.random() < 0.35,
          })
        }
      }
      canvas!.classList.add('ready')
      draw(performance.now())
    }

    function draw(now: number) {
      ctx!.clearRect(0, 0, W, H)
      const t = (now - t0) / 1000
      const wave = ((t % 7) / 7) * (W + H * 2) - H
      const rad = W < 520 ? 48 : 90
      for (const d of dots) {
        if (!still.matches) {
          if (d.delay > 0) d.delay -= 1
          else {
            const dx = d.x - ptr.x, dy = d.y - ptr.y, dist = Math.hypot(dx, dy)
            if (dist < rad) { const f = (1 - dist / rad) * 1.6; d.vx += dx / (dist || 1) * f; d.vy += dy / (dist || 1) * f; d.heat = 1 }
            d.vx = (d.vx + (d.hx - d.x) * 0.045) * 0.8
            d.vy = (d.vy + (d.hy - d.y) * 0.045) * 0.8
            d.x += d.vx; d.y += d.vy; d.heat *= 0.972
          }
          const band = Math.abs(d.hx + d.hy * 0.6 - wave)
          if (waveOn && t > 2.5 && band < 16) d.heat = Math.max(d.heat, 0.5 * (1 - band / 16))
        }
        const hot = d.heat > 0.08
        ctx!.beginPath(); ctx!.arc(d.x, d.y, r * (hot && !d.o ? 1 + d.heat * 0.35 : 1), 0, 6.2832)
        if (hot && d.o) { ctx!.strokeStyle = d.c; ctx!.lineWidth = Math.max(1, r * 0.35); ctx!.stroke() }
        else { ctx!.fillStyle = hot ? d.c : ink; ctx!.fill() }
      }
    }

    function loop(now: number) { if (!alive) return; draw(now); raf = requestAnimationFrame(loop) }
    // Only animate while the wordmark is on screen and the tab is visible.
    let onScreen = true
    function start() { cancelAnimationFrame(raf); if (still.matches || document.hidden || !onScreen) { draw(performance.now()); return } raf = requestAnimationFrame(loop) }
    const io = new IntersectionObserver(entries => { onScreen = entries[0]?.isIntersecting ?? true; start() })
    io.observe(canvas)
    function leave() { ptr = { x: -999, y: -999 } }
    function move(e: PointerEvent) {
      const b = canvas!.getBoundingClientRect(); ptr = { x: e.clientX - b.left, y: e.clientY - b.top }
      if (e.pointerType === 'touch') window.setTimeout(leave, 220)
    }
    const ro = new ResizeObserver(() => { setup(); start() })
    ro.observe(canvas)
    canvas.addEventListener('pointermove', move, { passive: true })
    canvas.addEventListener('pointerdown', move, { passive: true })
    canvas.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', start)
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerdown', move); canvas.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', start)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.join('|'), (narrowLines || []).join('|'), palette.join('|'), ink, align, density, logo, dotRatio, hollow, waveOn])

  return <canvas ref={ref} className={`dot-wordmark ${className}`} role="img" aria-label={label} />
}
