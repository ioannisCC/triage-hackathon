import { Card } from './Card'

interface DonutSlice { label: string; value: number; color: string }
const R = 50
const CX = 62
const CY = 62
const SW = 10
const CIRC = 2 * Math.PI * R

export function Donut({ data }: { data: DonutSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  let cursor = 0
  const slices = data.map(d => {
    const dash = total > 0 ? Math.max(0, (d.value / total) * CIRC - 3) : 0
    const s = { ...d, dash, off: cursor }
    cursor += total > 0 ? (d.value / total) * CIRC : 0
    return s
  })

  const blockRate = total > 0
    ? ((data.find(d => d.label === 'Blocked')?.value ?? 0) / total * 100).toFixed(1)
    : '0.0'

  return (
    <Card>
      <span className="block text-sm font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/40 mb-[14px]">
        Traffic Mix
      </span>

      <div className="flex items-center gap-[18px]">
        {/* SVG donut */}
        <svg width={124} height={124} className="shrink-0">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={SW} />
          {slices.map((s, i) => s.dash > 0.5 && (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none"
              stroke={s.color} strokeWidth={SW}
              strokeDasharray={`${s.dash} ${CIRC}`}
              strokeDashoffset={CIRC / 4 - s.off}
              strokeLinecap="butt" opacity="0.87"
              style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)' }}
            />
          ))}
          {slices.map((s, i) => s.dash > 0.5 && (
            <circle key={`g${i}`} cx={CX} cy={CY} r={R} fill="none"
              stroke={s.color} strokeWidth={SW * 0.5}
              strokeDasharray={`${s.dash} ${CIRC}`}
              strokeDashoffset={CIRC / 4 - s.off}
              strokeLinecap="butt" opacity="0.17"
              style={{ filter: 'blur(3px)' }}
            />
          ))}
          <text x={CX} y={CY - 3} textAnchor="middle" fill="rgba(255,255,255,0.85)"
            fontSize="18" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="-0.02em">
            {total.toLocaleString()}
          </text>
          <text x={CX} y={CY + 13} textAnchor="middle" fill="rgba(255,255,255,0.3)"
            fontSize="8" fontFamily="var(--font-sans)" letterSpacing="0.12em">
            TOTAL
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-col flex-1 gap-[7px]">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-[7px]">
              <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[11px] text-white/50 flex-1">{d.label}</span>
              <span className="font-mono text-[11px] text-white/70 font-semibold">{d.value.toLocaleString()}</span>
              <span className="font-mono text-[10px] text-white/25 min-w-[26px] text-right">
                {total > 0 ? ((d.value / total) * 100).toFixed(0) : '0'}%
              </span>
            </div>
          ))}

          <div className="mt-[5px] pt-2 border-t border-white/[0.06] flex justify-between">
            <span className="text-[10px] text-white/30 tracking-widest uppercase font-medium">Block rate</span>
            <span className="font-mono text-[11px] text-blocked font-semibold">{blockRate}%</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
