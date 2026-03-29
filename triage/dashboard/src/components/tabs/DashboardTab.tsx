import { useRef, useEffect, useMemo } from 'react'
import type { Tier, TriageEvent } from '../../types'
import { StatCard } from '../StatCard'
import { RequestFlow } from '../RequestFlow'
import { Donut } from '../Donut'
import { LiveFeed } from '../LiveFeed'
import type { FeedItem } from '../LiveFeed'
import { TrustLeaderboard } from '../TrustLeaderboard'
import { Card } from '../Card'

export function DashboardTab({ events }: { events: TriageEvent[] }) {
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

    return {
      id: e.id, tier: e.tier, label,
      addr: e.agentAddress || (e.tier === 'HUMAN' ? 'World ID Verified' : 'Unknown'),
      score: Math.round(e.trustScore),
      price: e.tier === 'BLOCKED' ? 'Denied' : e.priceCharged === 0 ? 'Free' : `$${e.priceCharged.toFixed(4)}`,
      age: e.timestamp,
    }
  }), [events])

  const seenIds = useRef(new Set<string>())
  const newIds = useRef(new Set<string>())
  useEffect(() => {
    if (events.length > 0) {
      const id = events[0].id
      if (!seenIds.current.has(id)) {
        seenIds.current.add(id)
        newIds.current.add(id)
        const t = setTimeout(() => newIds.current.delete(id), 500)
        return () => clearTimeout(t)
      }
    }
  }, [events])

  const humanPct = stats.total > 0 ? ((stats.counts.HUMAN / stats.total) * 100).toFixed(1) : '0.0'
  const agentPct = stats.total > 0 ? ((stats.counts.HUMAN_AGENT / stats.total) * 100).toFixed(1) : '0.0'

  const donut = [
    { label: 'Human', value: stats.counts.HUMAN, color: '#36d068' },
    { label: 'Agent', value: stats.counts.HUMAN_AGENT, color: '#4a91f7' },
    { label: 'Bot', value: stats.counts.ANON_BOT, color: '#f0a020' },
    { label: 'Blocked', value: stats.counts.BLOCKED, color: '#ee5555' },
  ]

  return (
    <div className="triage-main">
      <div className="stat-row animate-fade-up" style={{ animationDelay: '0.05s' }}>
        <StatCard label="Total Requests" value={stats.total} />
        <StatCard label="Verified Humans" value={stats.counts.HUMAN} accent="#36d068"
          sub={<><span className="text-human/90">{humanPct}%</span> <span className="text-mute">of traffic</span></>} />
        <StatCard label="Backed Agents" value={stats.counts.HUMAN_AGENT} accent="#4a91f7"
          sub={<><span className="text-agent/90">{agentPct}%</span> <span className="text-mute">of traffic</span></>} />
        <StatCard label="Revenue" value={stats.revenue} prefix="$" decimals={2} accent="#f0a020"
          sub={<span className="text-mute">agents + bots</span>} />
      </div>
      <div className="mid-row animate-fade-up" style={{ animationDelay: '0.12s' }}>
        <RequestFlow events={events} />
        <Donut data={donut} />
      </div>
      <div className="bot-row animate-fade-up" style={{ animationDelay: '0.2s' }}>
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <LiveFeed feed={feed} newIds={newIds.current} total={stats.total} />
        </Card>
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <TrustLeaderboard />
        </Card>
      </div>
    </div>
  )
}
