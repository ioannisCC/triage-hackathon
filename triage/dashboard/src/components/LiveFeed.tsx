import { useState, useEffect } from 'react'
import type { Tier } from '../types'
import { TIER_META } from '../types'
import { trunc, relTime } from '../lib/utils'
import { TierDot } from './TierChip'

export interface FeedItem {
  id: string
  tier: Tier
  addr: string
  score: number
  price: string
  age: number
  label?: string
}

const LABEL_COLORS: Record<string, string> = {
  BOUNTY: '#a78bfa', WINNER: '#f59e0b', BID: '#4a91f7', HIRED: '#4a91f7',
}

function FeedRow({ entry, isNew }: { entry: FeedItem; isNew: boolean }) {
  const [vis, setVis] = useState(false)
  const m = TIER_META[entry.tier]

  useEffect(() => {
    const id = setTimeout(() => setVis(true), 10)
    return () => clearTimeout(id)
  }, [])

  const priceColor = entry.price === 'Free'
    ? 'var(--color-human)'
    : entry.price === 'Denied'
      ? 'var(--color-blocked)'
      : 'var(--color-mid)'

  return (
    <div
      className={`grid grid-feed items-center px-3 py-2 rounded-card-sm feed-row ${
        isNew ? 'bg-[rgba(54,208,104,0.045)]' : 'bg-transparent hover:bg-white/[0.03]'
      }`}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(6px)',
      }}
    >
      <span className="inline-flex items-center gap-[6px]">
        <TierDot tier={entry.tier} size={5} />
        <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: (entry.label ? (LABEL_COLORS[entry.label] || m.fg) : m.fg) + '99' }}>
          {entry.label || m.label}
        </span>
      </span>

      <span className="font-mono text-[10px] text-white/20 truncate pl-2">
        {trunc(entry.addr)}
      </span>

      <span className="font-mono text-[11px] text-white/40 text-right tabular-nums">
        {entry.score}
      </span>

      <span className="font-mono text-[11px] text-right tabular-nums" style={{ color: priceColor }}>
        {entry.price}
      </span>

      <span className="font-mono text-[10px] text-white/15 text-right tabular-nums">
        {relTime(entry.age)}
      </span>
    </div>
  )
}

export function LiveFeed({ feed, newIds, total }: {
  feed: FeedItem[]
  newIds: Set<string>
  total: number
}) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-3 shrink-0">
        <span className="text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40">
          Recent Traffic
        </span>
        <span className="font-mono text-[10px] text-white/25 tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>

      <div className="grid grid-feed px-3 pb-2 border-b border-white/[0.06] mb-1">
        {[['Tier', 'left'], ['Identity', 'left'], ['Score', 'right'], ['Price', 'right'], ['When', 'right']].map(([label, align]) => (
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
        {feed.length === 0 ? (
          <div className="text-mute text-sm text-center mt-10">Waiting for traffic...</div>
        ) : (
          feed.map((e, i) => (
            <FeedRow key={e.id} entry={e} isNew={i === 0 && newIds.has(e.id)} />
          ))
        )}
      </div>
    </>
  )
}
