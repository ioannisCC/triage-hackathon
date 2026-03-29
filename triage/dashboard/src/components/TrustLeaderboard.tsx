import { useEffect, useState } from 'react'
import type { AgentProfile, Tier } from '../types'
import { TIER_META } from '../types'
import { trunc } from '../lib/utils'
import { TierDot } from './TierChip'
import { API_URL } from '../config'

function ScoreBar({ score }: { score: number }) {
  const col = score > 70 ? '#36d068' : score > 40 ? '#4a91f7' : '#f0a020'

  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="font-mono text-[13px] font-bold tabular-nums min-w-[26px] text-right" style={{ color: col + '99' }}>
        {Math.round(score)}
      </span>
      <div className="w-10 h-0.5 bg-white/[0.06] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-[width] duration-600 ease"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: col, opacity: 0.45 }}
        />
      </div>
    </div>
  )
}

export function TrustLeaderboard() {
  const [agents, setAgents] = useState<AgentProfile[]>([])

  useEffect(() => {
    const load = () => {
      fetch(`${API_URL}/api/agents`)
        .then(r => r.json())
        .then((d: AgentProfile[]) =>
          setAgents(d.sort((a, b) => b.trustScore - a.trustScore).slice(0, 8))
        )
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [])

  return (
    <>
      <div className="flex items-baseline justify-between mb-3 shrink-0">
        <span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">
          Trust Leaderboard
        </span>
        <span className="font-mono text-[10px] text-white/20">top 8 · live</span>
      </div>

      <div className="grid grid-leaderboard px-3 pb-2 border-b border-white/[0.06] mb-1">
        {[['#', 'left'], ['Address', 'left'], ['Tier', 'left'], ['Score', 'right'], ['Reqs', 'right']].map(([label, align]) => (
          <span
            key={label}
            className={`text-[10px] text-white/30 uppercase tracking-widest font-medium ${
              align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {agents.map((a, i) => {
          const m = TIER_META[a.tier]
          return (
            <div
              key={a.address}
              className="grid grid-leaderboard items-center px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.03]"
            >
              <span className={`font-mono text-[11px] tabular-nums ${i < 3 ? 'text-white/50 font-bold' : 'text-white/20'}`}>
                {i + 1}
              </span>
              <span className="text-[12px] text-white/80 font-medium truncate pl-1" title={a.address}>
                {a.name || trunc(a.address)}
              </span>
              <span className="inline-flex items-center gap-[5px]">
                <TierDot tier={a.tier} size={6} />
                <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: m.fg + '99' }}>
                  {m.label}
                </span>
              </span>
              <div className="flex justify-end">
                <ScoreBar score={a.trustScore} />
              </div>
              <span className="font-mono text-[11px] text-white/25 text-right tabular-nums">
                {a.totalRequests.toLocaleString()}
              </span>
            </div>
          )
        })}
        {agents.length === 0 && (
          <div className="text-mute text-sm text-center mt-10">No agents yet</div>
        )}
      </div>
    </>
  )
}
