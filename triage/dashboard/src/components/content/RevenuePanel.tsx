import { useMemo } from 'react'
import type { TriageEvent } from '../../types'
import { TIER_META } from '../../types'
import { TierDot } from '../TierChip'
import { trunc, relTime } from '../../lib/utils'

export function RevenuePanel({ events }: { events: TriageEvent[] }) {
  const contentEvents = useMemo(() =>
    events.filter(e => e.requestPath.startsWith('/api/content/')),
  [events])

  const stats = useMemo(() => {
    let revenue = 0, humans = 0, agents = 0, bots = 0
    for (const e of contentEvents) {
      if (e.priceCharged > 0) revenue += e.priceCharged
      if (e.tier === 'HUMAN') humans++
      else if (e.tier === 'HUMAN_AGENT') agents++
      else if (e.tier === 'ANON_BOT') bots++
    }
    return { revenue, humans, agents, bots }
  }, [contentEvents])

  return (
    <div className="space-y-4">
      {/* Revenue card */}
      <div className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-1px_0_0_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <div className="relative z-10 px-5 py-4">
          <h3 className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40 mb-3">Creator Revenue</h3>
          <div className="font-mono text-2xl font-bold text-white/80 tabular-nums mb-1">
            ${stats.revenue.toFixed(3)}
          </div>
          <div className="text-[10px] text-white/25 uppercase tracking-widest font-medium mb-3">USDC earned from content</div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-white/30">{stats.humans} humans</span><span className="text-green-400/60 font-mono">Free</span></div>
            <div className="flex justify-between"><span className="text-white/30">{stats.agents} agents</span><span className="font-mono" style={{ color: '#4a91f799' }}>${(stats.revenue * 0.3).toFixed(3)}</span></div>
            <div className="flex justify-between"><span className="text-white/30">{stats.bots} bots</span><span className="font-mono" style={{ color: '#f0a02099' }}>${(stats.revenue * 0.7).toFixed(3)}</span></div>
          </div>
        </div>
      </div>

      {/* Recent Readers */}
      <div className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-1px_0_0_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <div className="relative z-10 px-5 py-4">
          <h3 className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40 mb-3">Recent Readers</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-hide">
            {contentEvents.slice(0, 15).map(e => {
              const m = TIER_META[e.tier]
              return (
                <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors text-[11px]">
                  <TierDot tier={e.tier} size={5} />
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: m.fg + '99' }}>{m.label}</span>
                  <span className="font-mono text-[10px] text-white/20 truncate flex-1">{e.agentAddress ? trunc(e.agentAddress) : 'Human'}</span>
                  <span className="font-mono text-white/25">{e.priceCharged === 0 ? 'Free' : `$${e.priceCharged.toFixed(3)}`}</span>
                  <span className="font-mono text-[10px] text-white/15 tabular-nums">{relTime(e.timestamp)}</span>
                </div>
              )
            })}
            {contentEvents.length === 0 && <p className="text-white/25 text-[11px] text-center py-4">No readers yet</p>}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-1px_0_0_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <div className="relative z-10 px-5 py-4">
          <h3 className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40 mb-3">How It Works</h3>
          <p className="text-[12px] text-white/40 leading-relaxed mb-3">
            Your content is protected by Triage. Verified humans read free. AI agents pay based on trust score. Bots pay full price.
          </p>
          <pre className="bg-white/[0.03] rounded-xl p-3 font-mono text-[10px] text-white/35 leading-relaxed whitespace-pre overflow-x-auto">
            <code>{`import { triage } from '@triage/middleware'\napp.use('/api/content/*', triage({ payTo: '0xYou' }))\n// Humans free. Agents pay. Bots pay more.`}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}
