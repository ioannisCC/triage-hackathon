import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'

// ─── Config ──────────────────────────────────────────────────────────

const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const API_URL = isDev ? 'http://localhost:4021' : ''
const WS_URL = isDev ? 'ws://localhost:4022' : `wss://${window.location.host}/ws`

// ─── Types ───────────────────────────────────────────────────────────

type Tier = 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED'

interface TriageEvent {
  id: string; timestamp: number; tier: Tier; color: string
  agentAddress: string | null; trustScore: number; priceCharged: number
  humanId: string | null; requestPath: string
}

interface AgentProfile {
  address: string; tier: Tier; trustScore: number; totalRequests: number
  successfulRequests: number; firstSeen: number; lastSeen: number
  isHumanBacked: boolean; name?: string; specialty?: string
}

const TIER_META: Record<Tier, { label: string; fg: string }> = {
  HUMAN:       { label: 'Human',   fg: '#36d068' },
  HUMAN_AGENT: { label: 'Agent',   fg: '#4a91f7' },
  ANON_BOT:    { label: 'Bot',     fg: '#f0a020' },
  BLOCKED:     { label: 'Blocked', fg: '#ee5555' },
}
const TIER_COLORS: Record<Tier, string> = { HUMAN: '#36d068', HUMAN_AGENT: '#4a91f7', ANON_BOT: '#f0a020', BLOCKED: '#ee5555' }

// ─── Utilities ───────────────────────────────────────────────────────

function relTime(ts: number) { const s = Math.floor((Date.now() - ts) / 1000); return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago` }
function trunc(a = '') { if (a.startsWith('0x') && a.length > 18) return a.slice(0, 10) + '\u2026' + a.slice(-4); return a.length > 16 ? a.slice(0, 14) + '\u2026' : a }
function easeOut3(t: number) { return 1 - Math.pow(1 - Math.min(t, 1), 3) }

function useSplitFlap(target: number, isFloat = false): [number, number[]] {
  const [display, setDisplay] = useState(target)
  const [flipping, setFlipping] = useState<number[]>([])
  const prevRef = useRef(target)
  const raf = useRef(0)
  useEffect(() => {
    const from = prevRef.current; const to = target
    if (from === to) return; prevRef.current = to
    const fromStr = isFloat ? from.toFixed(2) : String(Math.round(from))
    const toStr = isFloat ? to.toFixed(2) : String(Math.round(to))
    const maxLen = Math.max(fromStr.length, toStr.length)
    const changed: number[] = []
    for (let i = 0; i < maxLen; i++) { if ((fromStr[fromStr.length - 1 - i] || '0') !== (toStr[toStr.length - 1 - i] || '0')) changed.push(i) }
    if (changed.length) setFlipping(changed)
    const dur = 280; const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const tick = (now: number) => { const p = (now - t0) / dur; setDisplay(from + (to - from) * easeOut3(p)); if (p < 1) raf.current = requestAnimationFrame(tick); else { setDisplay(to); setFlipping([]) } }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, isFloat])
  return [display, flipping]
}

function useWebSocket(url: string) {
  const [events, setEvents] = useState<TriageEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(url); wsRef.current = ws
    ws.onopen = () => setIsConnected(true)
    ws.onmessage = (msg) => { try { const e = JSON.parse(msg.data as string) as TriageEvent; setEvents(prev => [e, ...prev].slice(0, 100)) } catch {} }
    ws.onclose = () => { setIsConnected(false); reconnectTimer.current = setTimeout(connect, 2000) }
    ws.onerror = () => ws.close()
  }, [url])
  useEffect(() => { connect(); return () => { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close() } }, [connect])
  return { events, isConnected }
}

// ─── Components ──────────────────────────────────────────────────────

function TierDot({ tier, size = 5 }: { tier: Tier; size?: number }) {
  const m = TIER_META[tier]; if (!m) return null
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, backgroundColor: m.fg }} />
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      <div className={`relative z-10 h-full ${className.includes('flex') ? 'flex flex-col' : ''} px-5 py-4`}>{children}</div>
    </div>
  )
}

function SplitFlapNumber({ value, prefix = '', suffix = '', decimals = 0, color }: { value: number; prefix?: string; suffix?: string; decimals?: number; color?: string }) {
  const [disp, flipping] = useSplitFlap(value, decimals > 0)
  const formatted = decimals > 0 ? `${prefix}${disp.toFixed(decimals)}${suffix}` : `${prefix}${Math.round(disp).toLocaleString()}${suffix}`
  const chars = formatted.split('')
  return (
    <span className="font-mono text-[27px] font-bold leading-none inline-flex items-baseline tracking-[-0.03em]" style={{ color: color || 'rgba(255,255,255,0.9)' }}>
      {chars.map((ch, i) => {
        const isDigit = ch >= '0' && ch <= '9'
        const posFromRight = isDigit ? (() => { let cnt = 0; for (let j = chars.length - 1; j > i; j--) if (chars[j] >= '0' && chars[j] <= '9') cnt++; return cnt })() : -1
        return <span key={i} className={`inline-block relative ${isDigit && flipping.includes(posFromRight) ? 'animate-digit-flip' : ''}`}>{ch}</span>
      })}
    </span>
  )
}

function StatCard({ label, value, prefix = '', suffix = '', decimals = 0, sub, accent }: { label: string; value: number; prefix?: string; suffix?: string; decimals?: number; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card min-w-0">
      <div className="relative z-10 pt-4 px-5 pb-4">
        <div className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-[9px]">{label}</div>
        <div className="mb-2"><SplitFlapNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} color={accent} /></div>
        {sub && <div className="text-[11px] text-white/30 leading-[1.45]">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Request Flow Canvas ─────────────────────────────────────────────

const TIERS: Tier[] = ['HUMAN', 'HUMAN_AGENT', 'ANON_BOT', 'BLOCKED']
const LANE_SLOT: Record<Tier, number> = { HUMAN: 0, HUMAN_AGENT: 1, ANON_BOT: 2, BLOCKED: 3 }
const SIZES: Record<Tier, number> = { HUMAN: 3.5, HUMAN_AGENT: 3.0, ANON_BOT: 2.5, BLOCKED: 2.0 }

function RequestFlow({ events }: { events: TriageEvent[] }) {
  const cvs = useRef<HTMLCanvasElement>(null)
  const parts = useRef<Array<{ tier: Tier; x: number; y: number; speed: number; alpha: number; size: number; assigned: boolean; targetY: number | null; trail: Array<{ x: number; y: number }> }>>([])
  const ripples = useRef<Array<{ x: number; y: number; r: number; alpha: number; tier: Tier }>>([])
  const raf = useRef(0); const lastLen = useRef(0)
  const rngRef = useRef((() => { let s = (Date.now() >>> 0); return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } })())

  const spawn = useCallback((tier?: Tier) => {
    const r = rngRef.current; const t = tier || TIERS[Math.floor(r() * TIERS.length)]
    parts.current.push({ tier: t, x: -0.01, y: 0.5 + (r() - 0.5) * 0.26, speed: (0.00085 + r() * 0.0006) * 0.8, alpha: 0.72 + r() * 0.28, size: SIZES[t] + r() * 1.0, assigned: false, targetY: null, trail: [] })
  }, [])

  useEffect(() => { const n = events.length - lastLen.current; if (n > 0) for (let i = 0; i < Math.min(n, 5); i++) spawn(events[i].tier); lastLen.current = events.length }, [events, spawn])

  useEffect(() => {
    const canvas = cvs.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return
    let W = 0, H = 0
    const resize = () => { const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect(); W = rect.width; H = rect.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
    resize(); const ro = new ResizeObserver(resize); ro.observe(canvas)
    const GATE = 0.44; const laneY = (tier: Tier) => (0.15 + LANE_SLOT[tier] * 0.215) * H

    const draw = () => {
      ctx.clearRect(0, 0, W, H); const gx = W * GATE
      for (const tier of TIERS) { const y = laneY(tier); const col = TIER_COLORS[tier]; const lg = ctx.createLinearGradient(gx + 8, y, W - 6, y); lg.addColorStop(0, col + '10'); lg.addColorStop(0.5, col + '06'); lg.addColorStop(1, col + '00'); ctx.strokeStyle = lg; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(gx + 8, y); ctx.lineTo(W - 6, y); ctx.stroke(); ctx.font = '600 9px system-ui, sans-serif'; ctx.fillStyle = col + '50'; ctx.textAlign = 'left'; ctx.fillText(TIER_META[tier].label.toUpperCase(), W * 0.885, y + 3.5) }
      const gateGrad = ctx.createLinearGradient(gx, 20, gx, H - 10); gateGrad.addColorStop(0, 'rgba(255,255,255,0)'); gateGrad.addColorStop(0.3, 'rgba(255,255,255,0.06)'); gateGrad.addColorStop(0.7, 'rgba(255,255,255,0.06)'); gateGrad.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = gateGrad; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, H - 10); ctx.stroke(); ctx.font = '500 7px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.textAlign = 'center'; ctx.fillText('CLASSIFY', gx, 14)

      parts.current = parts.current.filter(p => p.x < 1.05)
      for (const p of parts.current) {
        p.x += p.speed; const px = p.x * W
        if (!p.assigned && px >= gx) { p.assigned = true; p.targetY = laneY(p.tier) / H; ripples.current.push({ x: gx, y: p.y * H, r: 2.5, alpha: 0.65, tier: p.tier }) }
        if (p.assigned && p.targetY !== null) { p.y += (p.targetY - p.y) * 0.025; p.speed *= 0.9997 }
        p.trail.push({ x: px, y: p.y * H }); if (p.trail.length > 12) p.trail.shift()
        const col = TIER_COLORS[p.tier]
        if (p.trail.length > 2) { const t0 = p.trail[0]; const tg = ctx.createLinearGradient(t0.x, t0.y, px, p.y * H); tg.addColorStop(0, col + '00'); tg.addColorStop(1, col + '30'); ctx.strokeStyle = tg; ctx.lineWidth = p.size * 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = p.alpha; ctx.beginPath(); ctx.moveTo(t0.x, t0.y); for (const pt of p.trail) ctx.lineTo(pt.x, pt.y); ctx.lineTo(px, p.y * H); ctx.stroke(); ctx.globalAlpha = 1 }
        ctx.save(); ctx.globalAlpha = p.alpha; const grad = ctx.createRadialGradient(px, p.y * H, 0, px, p.y * H, p.size * 2.5); grad.addColorStop(0, col + '90'); grad.addColorStop(0.3, col + '50'); grad.addColorStop(0.7, col + '20'); grad.addColorStop(1, col + '00'); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(px, p.y * H, p.size * 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = col + 'cc'; ctx.beginPath(); ctx.arc(px, p.y * H, p.size * 0.6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(px - p.size * 0.3, p.y * H - p.size * 0.3, p.size * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
      ripples.current = ripples.current.filter(r => r.alpha > 0.015)
      for (const rip of ripples.current) { const col = TIER_COLORS[rip.tier]; const rg = ctx.createRadialGradient(rip.x, rip.y, 0, rip.x, rip.y, rip.r); rg.addColorStop(0, col + '00'); rg.addColorStop(0.5, col + Math.round(rip.alpha * 40).toString(16).padStart(2, '0')); rg.addColorStop(1, col + '00'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2); ctx.fill(); rip.r += 2.5; rip.alpha *= 0.82 }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf.current); ro.disconnect() }
  }, [spawn])

  return (
    <div className="card relative overflow-hidden h-[210px]">
      <div className="absolute top-3 left-4 z-10"><span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">Request Flow</span></div>
      <div className="absolute inset-0 top-9"><canvas ref={cvs} className="block w-full h-full" /></div>
    </div>
  )
}

// ─── Donut Chart ─────────────────────────────────────────────────────

function Donut({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 50, CX = 62, CY = 62, SW = 10, CIRC = 2 * Math.PI * R
  let cursor = 0
  const slices = data.map(d => { const dash = total > 0 ? Math.max(0, (d.value / total) * CIRC - 3) : 0; const s = { ...d, dash, off: cursor }; cursor += total > 0 ? (d.value / total) * CIRC : 0; return s })
  const blockRate = total > 0 ? ((data.find(d => d.label === 'Blocked')?.value ?? 0) / total * 100).toFixed(1) : '0.0'

  return (
    <Card>
      <span className="block text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40 mb-[14px]">Traffic Mix</span>
      <div className="flex items-center gap-[18px]">
        <svg width={124} height={124} className="shrink-0">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={SW} />
          {slices.map((s, i) => s.dash > 0.5 && <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.color} strokeWidth={SW} strokeDasharray={`${s.dash} ${CIRC}`} strokeDashoffset={CIRC / 4 - s.off} strokeLinecap="butt" opacity="0.87" style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)' }} />)}
          {slices.map((s, i) => s.dash > 0.5 && <circle key={`g${i}`} cx={CX} cy={CY} r={R} fill="none" stroke={s.color} strokeWidth={SW * 0.5} strokeDasharray={`${s.dash} ${CIRC}`} strokeDashoffset={CIRC / 4 - s.off} strokeLinecap="butt" opacity="0.17" style={{ filter: 'blur(3px)' }} />)}
          <text x={CX} y={CY - 3} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="18" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="-0.02em">{total.toLocaleString()}</text>
          <text x={CX} y={CY + 13} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--font-sans)" letterSpacing="0.12em">TOTAL</text>
        </svg>
        <div className="flex flex-col flex-1 gap-[7px]">
          {data.map((d, i) => <div key={i} className="flex items-center gap-[7px]"><span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: d.color }} /><span className="text-[11px] text-white/50 flex-1">{d.label}</span><span className="font-mono text-[11px] text-white/70 font-semibold">{d.value.toLocaleString()}</span><span className="font-mono text-[10px] text-white/25 min-w-[26px] text-right">{total > 0 ? ((d.value / total) * 100).toFixed(0) : '0'}%</span></div>)}
          <div className="mt-[5px] pt-2 border-t border-white/[0.06] flex justify-between"><span className="text-[10px] text-white/30 tracking-widest uppercase font-medium">Block rate</span><span className="font-mono text-[11px] text-blocked font-semibold">{blockRate}%</span></div>
        </div>
      </div>
    </Card>
  )
}

// ─── Live Feed ───────────────────────────────────────────────────────

interface FeedItem { id: string; tier: Tier; addr: string; score: number; price: string; age: number; label?: string }
const LABEL_COLORS: Record<string, string> = { BOUNTY: '#a78bfa', WINNER: '#f59e0b', BID: '#4a91f7', HIRED: '#4a91f7' }

function FeedRow({ entry, isNew }: { entry: FeedItem; isNew: boolean }) {
  const [vis, setVis] = useState(false); const m = TIER_META[entry.tier]
  useEffect(() => { const id = setTimeout(() => setVis(true), 10); return () => clearTimeout(id) }, [])
  const priceColor = entry.price === 'Free' ? 'var(--color-human)' : entry.price === 'Denied' ? 'var(--color-blocked)' : 'var(--color-mid)'
  return (
    <div className={`grid grid-feed items-center px-3 py-2 rounded-[7px] feed-row ${isNew ? 'bg-[rgba(54,208,104,0.045)]' : 'bg-transparent hover:bg-white/[0.03]'}`} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(6px)' }}>
      <span className="inline-flex items-center gap-[6px]"><TierDot tier={entry.tier} size={5} /><span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: ((entry.label ? (LABEL_COLORS[entry.label] || m.fg) : m.fg)) + '99' }}>{entry.label || m.label}</span></span>
      <span className="font-mono text-[10px] text-white/20 truncate pl-2">{trunc(entry.addr)}</span>
      <span className="font-mono text-[11px] text-white/40 text-right tabular-nums">{entry.score}</span>
      <span className="font-mono text-[11px] text-right tabular-nums" style={{ color: priceColor }}>{entry.price}</span>
      <span className="font-mono text-[10px] text-white/15 text-right tabular-nums">{relTime(entry.age)}</span>
    </div>
  )
}

function LiveFeed({ feed, newIds, total }: { feed: FeedItem[]; newIds: Set<string>; total: number }) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-3 shrink-0"><span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">Recent Traffic</span><span className="font-mono text-[10px] text-white/25 tabular-nums">{total.toLocaleString()}</span></div>
      <div className="grid grid-feed px-3 pb-2 border-b border-white/[0.06] mb-1">{[['Tier', 'left'], ['Identity', 'left'], ['Score', 'right'], ['Price', 'right'], ['When', 'right']].map(([label, align]) => <span key={label} className={`text-[10px] text-white/30 uppercase tracking-widest font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{label}</span>)}</div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">{feed.length === 0 ? <div className="text-mute text-sm text-center mt-10">Waiting for traffic...</div> : feed.map((e, i) => <FeedRow key={e.id} entry={e} isNew={i === 0 && newIds.has(e.id)} />)}</div>
    </>
  )
}

// ─── Trust Leaderboard ───────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const col = score > 70 ? '#36d068' : score > 40 ? '#4a91f7' : '#f0a020'
  return <div className="flex items-center gap-2 justify-end"><span className="font-mono text-[13px] font-bold tabular-nums min-w-[26px] text-right" style={{ color: col + '99' }}>{Math.round(score)}</span><div className="w-10 h-0.5 bg-white/[0.06] rounded-sm overflow-hidden"><div className="h-full rounded-sm transition-[width] duration-600 ease" style={{ width: `${Math.min(100, score)}%`, backgroundColor: col, opacity: 0.45 }} /></div></div>
}

function TrustLeaderboard() {
  const [agents, setAgents] = useState<AgentProfile[]>([])
  useEffect(() => { const load = () => { fetch(`${API_URL}/triage/api/agents`).then(r => r.json()).then((d: AgentProfile[]) => setAgents(d.sort((a, b) => b.trustScore - a.trustScore).slice(0, 8))).catch(() => {}) }; load(); const iv = setInterval(load, 5000); return () => clearInterval(iv) }, [])
  return (
    <>
      <div className="flex items-baseline justify-between mb-3 shrink-0"><span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">Trust Leaderboard</span><span className="font-mono text-[10px] text-white/20">top 8 · live</span></div>
      <div className="grid grid-leaderboard px-3 pb-2 border-b border-white/[0.06] mb-1">{[['#', 'left'], ['Address', 'left'], ['Tier', 'left'], ['Score', 'right'], ['Reqs', 'right']].map(([label, align]) => <span key={label} className={`text-[10px] text-white/30 uppercase tracking-widest font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{label}</span>)}</div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {agents.map((a, i) => { const m = TIER_META[a.tier]; return (
          <div key={a.address} className="grid grid-leaderboard items-center px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.03]">
            <span className={`font-mono text-[11px] tabular-nums ${i < 3 ? 'text-white/50 font-bold' : 'text-white/20'}`}>{i + 1}</span>
            <span className="text-[12px] text-white/80 font-medium truncate pl-1" title={a.address}>{a.name || trunc(a.address)}</span>
            <span className="inline-flex items-center gap-[5px]"><TierDot tier={a.tier} size={6} /><span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: m.fg + '99' }}>{m.label}</span></span>
            <div className="flex justify-end"><ScoreBar score={a.trustScore} /></div>
            <span className="font-mono text-[11px] text-white/25 text-right tabular-nums">{a.totalRequests.toLocaleString()}</span>
          </div>
        ) })}
        {agents.length === 0 && <div className="text-mute text-sm text-center mt-10">No agents yet</div>}
      </div>
    </>
  )
}

// ─── App ─────────────────────────────────────────────────────────────

export default function App() {
  const { events, isConnected } = useWebSocket(WS_URL)

  const stats = useMemo(() => {
    const counts: Record<Tier, number> = { HUMAN: 0, HUMAN_AGENT: 0, ANON_BOT: 0, BLOCKED: 0 }
    let revenue = 0
    for (const e of events) { counts[e.tier]++; if (e.priceCharged > 0) revenue += e.priceCharged }
    return { total: events.length, counts, revenue }
  }, [events])

  const feed: FeedItem[] = useMemo(() => events.map(e => {
    let label: string | undefined
    if (e.requestPath.startsWith('/marketplace/bounty-created')) label = 'BOUNTY'
    else if (e.requestPath.startsWith('/marketplace/bid')) label = 'BID'
    else if (e.requestPath.startsWith('/marketplace/winner')) label = 'WINNER'
    else if (e.requestPath.startsWith('/marketplace/agent-hired')) label = 'HIRED'
    return { id: e.id, tier: e.tier, label, addr: e.agentAddress || (e.tier === 'HUMAN' ? 'World ID Verified' : 'Unknown'), score: Math.round(e.trustScore), price: e.tier === 'BLOCKED' ? 'Denied' : e.priceCharged === 0 ? 'Free' : `$${e.priceCharged.toFixed(4)}`, age: e.timestamp }
  }), [events])

  const seenIds = useRef(new Set<string>()); const newIds = useRef(new Set<string>())
  useEffect(() => { if (events.length > 0) { const id = events[0].id; if (!seenIds.current.has(id)) { seenIds.current.add(id); newIds.current.add(id); const t = setTimeout(() => newIds.current.delete(id), 500); return () => clearTimeout(t) } } }, [events])

  const humanPct = stats.total > 0 ? ((stats.counts.HUMAN / stats.total) * 100).toFixed(1) : '0.0'
  const agentPct = stats.total > 0 ? ((stats.counts.HUMAN_AGENT / stats.total) * 100).toFixed(1) : '0.0'
  const donut = [
    { label: 'Human', value: stats.counts.HUMAN, color: '#36d068' },
    { label: 'Agent', value: stats.counts.HUMAN_AGENT, color: '#4a91f7' },
    { label: 'Bot', value: stats.counts.ANON_BOT, color: '#f0a020' },
    { label: 'Blocked', value: stats.counts.BLOCKED, color: '#ee5555' },
  ]

  return (
    <div className="w-full h-screen flex flex-col font-sans text-fg overflow-hidden" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 35%, #111827 0%, #090d15 50%, #060a10 100%)' }}>
      {/* Header */}
      <header className="h-[52px] shrink-0 relative z-10">
        <div className="max-w-[1320px] mx-auto w-full h-full flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="1" y="1" width="22" height="22" rx="6" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="2.5" fill="#36d068" opacity="0.7" /><circle cx="15.5" cy="8.5" r="2.5" fill="#4a91f7" opacity="0.7" /><circle cx="8.5" cy="15.5" r="2.5" fill="#f0a020" opacity="0.7" /><circle cx="15.5" cy="15.5" r="2.5" fill="#ee5555" opacity="0.4" /></svg>
            <span className="text-sm font-bold tracking-wide text-white">TRIAGE</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-white/25">v1.0.0</span>
            <div className="flex items-center gap-1.5">
              <div className="relative w-[6px] h-[6px]">{isConnected && <div className="absolute inset-[-3px] rounded-full bg-green-400/20 animate-ping" />}<div className={`absolute inset-0 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400/60'}`} /></div>
              <span className={`text-[10px] font-medium tracking-wide ${isConnected ? 'text-white/60' : 'text-red-400/60'}`}>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <div className="triage-main">
        <div className="stat-row animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <StatCard label="Total Requests" value={stats.total} />
          <StatCard label="Verified Humans" value={stats.counts.HUMAN} accent="#36d068" sub={<><span style={{ color: '#36d068e6' }}>{humanPct}%</span> <span className="text-white/30">of traffic</span></>} />
          <StatCard label="Backed Agents" value={stats.counts.HUMAN_AGENT} accent="#4a91f7" sub={<><span style={{ color: '#4a91f7e6' }}>{agentPct}%</span> <span className="text-white/30">of traffic</span></>} />
          <StatCard label="Revenue" value={stats.revenue} prefix="$" decimals={2} accent="#f0a020" sub={<span className="text-white/30">agents + bots</span>} />
        </div>
        <div className="mid-row animate-fade-up" style={{ animationDelay: '0.12s' }}><RequestFlow events={events} /><Donut data={donut} /></div>
        <div className="bot-row animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <Card className="flex flex-col min-h-0 overflow-hidden"><LiveFeed feed={feed} newIds={newIds.current} total={stats.total} /></Card>
          <Card className="flex flex-col min-h-0 overflow-hidden"><TrustLeaderboard /></Card>
        </div>
      </div>
    </div>
  )
}
