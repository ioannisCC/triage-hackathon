import type { Tier, AgentProfile } from './types'
import { calculateTrustScore } from './scoring'

const agents = new Map<string, AgentProfile>()

function tierRank(tier: Tier): number {
  return { HUMAN: 4, HUMAN_AGENT: 3, ANON_BOT: 2, BLOCKED: 1 }[tier] ?? 0
}

export function getOrCreateAgent(address: string, tier: Tier, humanId: string | null = null): AgentProfile {
  if (agents.has(address)) {
    const agent = agents.get(address)!
    if (tierRank(tier) > tierRank(agent.tier)) {
      agent.tier = tier
      agent.isHumanBacked = tier === 'HUMAN' || tier === 'HUMAN_AGENT'
      if (humanId) agent.humanId = humanId
    }
    return agent
  }

  const profile: AgentProfile = {
    address, tier, trustScore: 0,
    totalRequests: 0, successfulRequests: 0, failedPayments: 0,
    firstSeen: Date.now(), lastSeen: Date.now(),
    isHumanBacked: tier === 'HUMAN' || tier === 'HUMAN_AGENT',
    humanId,
    requestTimestamps: [],
    endpointsAccessed: new Set(),
    recentRequestsPerMinute: 0,
    addressesFromSameIp: new Set(),
    daysActive: new Set(),
  }
  agents.set(address, profile)
  return profile
}

export function recordRequest(
  address: string, tier: Tier, success: boolean,
  humanId: string | null = null, endpoint = '/api/data', clientIp = 'unknown'
): AgentProfile {
  const agent = getOrCreateAgent(address, tier, humanId)
  const now = Date.now()

  agent.totalRequests++
  if (success) agent.successfulRequests++
  else agent.failedPayments++
  agent.lastSeen = now

  agent.requestTimestamps.push(now)
  if (agent.requestTimestamps.length > 100) agent.requestTimestamps = agent.requestTimestamps.slice(-100)

  agent.endpointsAccessed.add(endpoint)
  agent.daysActive.add(new Date().toISOString().split('T')[0])

  if (clientIp !== 'unknown') agent.addressesFromSameIp.add(clientIp)

  const oneMinuteAgo = now - 60_000
  agent.recentRequestsPerMinute = agent.requestTimestamps.filter(t => t > oneMinuteAgo).length

  agent.trustScore = calculateTrustScore(agent)
  return agent
}

export function getAgent(address: string): AgentProfile | undefined {
  return agents.get(address)
}

export function getAllAgents(): AgentProfile[] {
  return Array.from(agents.values())
}

export function getTopAgents(n = 8): AgentProfile[] {
  return getAllAgents().sort((a, b) => b.trustScore - a.trustScore).slice(0, n)
}
