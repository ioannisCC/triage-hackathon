import type { ReactNode } from 'react'
import { useSplitFlap } from '../lib/utils'

function SplitFlapNumber({ value, prefix = '', suffix = '', decimals = 0, color }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; color?: string
}) {
  const [disp, flipping] = useSplitFlap(value, decimals > 0)
  const formatted = decimals > 0
    ? `${prefix}${disp.toFixed(decimals)}${suffix}`
    : `${prefix}${Math.round(disp).toLocaleString()}${suffix}`

  const chars = formatted.split('')

  return (
    <span
      className="font-mono text-[27px] font-bold leading-none inline-flex items-baseline tracking-[-0.03em]"
      style={{ color: color || 'rgba(255,255,255,0.9)' }}
    >
      {chars.map((ch, i) => {
        const isDigit = ch >= '0' && ch <= '9'
        const posFromRight = isDigit ? (() => {
          let cnt = 0
          for (let j = chars.length - 1; j > i; j--) if (chars[j] >= '0' && chars[j] <= '9') cnt++
          return cnt
        })() : -1
        const isFlipping = isDigit && flipping.includes(posFromRight)
        return (
          <span
            key={i}
            className={`inline-block relative ${isFlipping ? 'animate-digit-flip' : ''}`}
          >
            {ch}
          </span>
        )
      })}
    </span>
  )
}

export function StatCard({ label, value, prefix = '', suffix = '', decimals = 0, sub, accent }: {
  label: string; value: number; prefix?: string; suffix?: string
  decimals?: number; sub?: ReactNode; accent?: string
}) {
  return (
    <div className="card min-w-0">
      <div className="relative z-10 pt-4 px-5 pb-4">
        <div className="text-[10px] uppercase tracking-widest text-white/30 font-medium mb-[9px]">
          {label}
        </div>
        <div className="mb-2">
          <SplitFlapNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} color={accent} />
        </div>
        {sub && (
          <div className="text-[11px] text-white/30 leading-[1.45]">{sub}</div>
        )}
      </div>
    </div>
  )
}
