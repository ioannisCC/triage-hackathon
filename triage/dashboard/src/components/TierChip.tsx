import type { Tier } from '../types'
import { TIER_META } from '../types'

export function TierDot({ tier, size = 5 }: { tier: Tier; size?: number }) {
  const m = TIER_META[tier]
  if (!m) return null
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: m.fg }}
    />
  )
}

export function TierChip({ tier, size = 'sm' }: { tier: Tier; size?: 'sm' | 'xs' }) {
  const m = TIER_META[tier]
  if (!m) return null
  const xs = size === 'xs'

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap font-sans font-semibold rounded-[5px] ${
        xs ? 'gap-[3px] px-[5px] py-px text-[9px] tracking-[0.03em]'
           : 'gap-1 px-2 py-[2px] text-[10px] tracking-[0.03em]'
      }`}
      style={{ color: m.fg, backgroundColor: m.bg, border: `1px solid ${m.border}` }}
    >
      <TierDot tier={tier} size={xs ? 4 : 5} />
      {m.label}
    </span>
  )
}
