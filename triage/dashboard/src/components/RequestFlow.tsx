import { useEffect, useRef, useCallback } from 'react'
import type { TriageEvent, Tier } from '../types'
import { TIER_META, TIER_COLORS } from '../types'

const TIERS: Tier[] = ['HUMAN', 'HUMAN_AGENT', 'ANON_BOT', 'BLOCKED']
const LANE_SLOT: Record<Tier, number> = { HUMAN: 0, HUMAN_AGENT: 1, ANON_BOT: 2, BLOCKED: 3 }
const SIZES: Record<Tier, number> = { HUMAN: 3.5, HUMAN_AGENT: 3.0, ANON_BOT: 2.5, BLOCKED: 2.0 }

interface TrailPt { x: number; y: number }
interface Particle {
  tier: Tier; x: number; y: number; speed: number
  alpha: number; size: number; assigned: boolean; targetY: number | null
  trail: TrailPt[]
}
interface Ripple {
  x: number; y: number; r: number; alpha: number; tier: Tier
}

function prng(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

export function RequestFlow({ events }: { events: TriageEvent[] }) {
  const cvs = useRef<HTMLCanvasElement>(null)
  const parts = useRef<Particle[]>([])
  const ripples = useRef<Ripple[]>([])
  const raf = useRef(0)
  const rng = useRef(prng(Date.now()))
  const lastLen = useRef(0)

  const spawn = useCallback((tier?: Tier) => {
    const r = rng.current
    const t = tier || TIERS[Math.floor(r() * TIERS.length)]
    parts.current.push({
      tier: t, x: -0.01, y: 0.5 + (r() - 0.5) * 0.26,
      speed: (0.00085 + r() * 0.0006) * 0.8,
      alpha: 0.72 + r() * 0.28,
      size: SIZES[t] + r() * 1.0,
      assigned: false, targetY: null,
      trail: [],
    })
  }, [])

  useEffect(() => {
    const n = events.length - lastLen.current
    if (n > 0) {
      for (let i = 0; i < Math.min(n, 5); i++) spawn(events[i].tier)
    }
    lastLen.current = events.length
  }, [events, spawn])

  useEffect(() => {
    const canvas = cvs.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let W = 0, H = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      W = rect.width; H = rect.height
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)

    const GATE = 0.44
    const laneY = (tier: Tier) => (0.15 + LANE_SLOT[tier] * 0.215) * H

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      const gx = W * GATE

      // Lane lines — subtle gradient fades
      for (const tier of TIERS) {
        const y = laneY(tier)
        const col = TIER_COLORS[tier]
        const lg = ctx.createLinearGradient(gx + 8, y, W - 6, y)
        lg.addColorStop(0, col + '10')
        lg.addColorStop(0.5, col + '06')
        lg.addColorStop(1, col + '00')
        ctx.strokeStyle = lg
        ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(gx + 8, y); ctx.lineTo(W - 6, y); ctx.stroke()

        // Lane label
        ctx.font = '600 9px system-ui, sans-serif'
        ctx.fillStyle = col + '50'
        ctx.textAlign = 'left'
        ctx.fillText(TIER_META[tier].label.toUpperCase(), W * 0.885, y + 3.5)
      }

      // Gate — glass edge
      const gateGrad = ctx.createLinearGradient(gx, 20, gx, H - 10)
      gateGrad.addColorStop(0, 'rgba(255,255,255,0)')
      gateGrad.addColorStop(0.3, 'rgba(255,255,255,0.06)')
      gateGrad.addColorStop(0.7, 'rgba(255,255,255,0.06)')
      gateGrad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = gateGrad
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, H - 10); ctx.stroke()

      // Gate label
      ctx.font = '500 7px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.textAlign = 'center'
      ctx.fillText('CLASSIFY', gx, 14)

      // Update + draw particles
      parts.current = parts.current.filter(p => p.x < 1.05)
      for (const p of parts.current) {
        p.x += p.speed
        const px = p.x * W
        const py = p.y * H

        if (!p.assigned && px >= gx) {
          p.assigned = true
          p.targetY = laneY(p.tier) / H
          ripples.current.push({ x: gx, y: py, r: 2.5, alpha: 0.65, tier: p.tier })
        }
        if (p.assigned && p.targetY !== null) {
          p.y += (p.targetY - p.y) * 0.025
          p.speed *= 0.9997 // gentle deceleration post-gate
        }

        // Trail
        p.trail.push({ x: px, y: p.y * H })
        if (p.trail.length > 12) p.trail.shift()

        const col = TIER_COLORS[p.tier]

        // Draw trail — soft gradient stroke
        if (p.trail.length > 2) {
          const t0 = p.trail[0]
          const trailGrad = ctx.createLinearGradient(t0.x, t0.y, px, p.y * H)
          trailGrad.addColorStop(0, col + '00')
          trailGrad.addColorStop(1, col + '30')
          ctx.strokeStyle = trailGrad
          ctx.lineWidth = p.size * 1.2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.globalAlpha = p.alpha
          ctx.beginPath()
          ctx.moveTo(t0.x, t0.y)
          for (const pt of p.trail) ctx.lineTo(pt.x, pt.y)
          ctx.lineTo(px, p.y * H)
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        // Glass orb — outer glow
        ctx.save()
        ctx.globalAlpha = p.alpha
        const grad = ctx.createRadialGradient(px, p.y * H, 0, px, p.y * H, p.size * 2.5)
        grad.addColorStop(0, col + '90')
        grad.addColorStop(0.3, col + '50')
        grad.addColorStop(0.7, col + '20')
        grad.addColorStop(1, col + '00')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(px, p.y * H, p.size * 2.5, 0, Math.PI * 2); ctx.fill()

        // Inner bright core
        ctx.fillStyle = col + 'cc'
        ctx.beginPath(); ctx.arc(px, p.y * H, p.size * 0.6, 0, Math.PI * 2); ctx.fill()

        // Glass highlight — small white dot offset up-left
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.beginPath(); ctx.arc(px - p.size * 0.3, p.y * H - p.size * 0.3, p.size * 0.2, 0, Math.PI * 2); ctx.fill()

        ctx.restore()
      }

      // Ripples — glass glow
      ripples.current = ripples.current.filter(r => r.alpha > 0.015)
      for (const rip of ripples.current) {
        const col = TIER_COLORS[rip.tier]
        const ripGrad = ctx.createRadialGradient(rip.x, rip.y, 0, rip.x, rip.y, rip.r)
        ripGrad.addColorStop(0, col + '00')
        const a = Math.round(rip.alpha * 40).toString(16).padStart(2, '0')
        ripGrad.addColorStop(0.5, col + a)
        ripGrad.addColorStop(1, col + '00')
        ctx.fillStyle = ripGrad
        ctx.beginPath(); ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2); ctx.fill()

        rip.r += 2.5; rip.alpha *= 0.82
      }

      raf.current = requestAnimationFrame(draw)
    }

    raf.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf.current); ro.disconnect() }
  }, [spawn])

  return (
    <div className="card relative overflow-hidden h-[210px]">
      <div className="absolute top-3 left-4 z-10">
        <span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">
          Request Flow
        </span>
      </div>
      <div className="absolute inset-0 top-9">
        <canvas ref={cvs} className="block w-full h-full" />
      </div>
    </div>
  )
}
