/**
 * Triage Trust Score Engine
 *
 * Based on:
 * - EigenTrust (Kamvar, Schlosser & Garcia-Molina, 2003) — peer reputation via
 *   pre-trusted seeds and behavioral history
 * - PeerTrust (Xiong & Liu, 2004) — multi-factor trust with context
 * - EigenTrust++ (Fan et al., 2012) — attack-resilient trust management
 *
 * Formula: TrustScore = IdentityScore + BehaviorScore + ReputationScore - RiskPenalty
 * Range: 0-90 (clamped)
 */

import { Tier } from '../config/tiers'
import { getSimpleHirePriceBand } from '../config/pricing'

export interface AgentProfile {
  address: string
  tier: Tier
  trustScore: number
  totalRequests: number
  successfulRequests: number
  failedPayments: number
  firstSeen: number
  lastSeen: number
  isHumanBacked: boolean
  humanId: string | null
  name?: string
  specialty?: string
  requestTimestamps: number[]
  endpointsAccessed: Set<string>
  recentRequestsPerMinute: number
  addressesFromSameIp: Set<string>
  daysActive: Set<string>
}

// In-memory store
const agents = new Map<string, AgentProfile>()

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
    address,
    tier,
    trustScore: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedPayments: 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
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

function tierRank(tier: Tier): number {
  return { HUMAN: 4, HUMAN_AGENT: 3, ANON_BOT: 2, BLOCKED: 1 }[tier] ?? 0
}

/**
 * Record a request and update all tracking fields
 */
export function recordRequest(
  address: string,
  tier: Tier,
  success: boolean,
  humanId: string | null = null,
  endpoint: string = '/api/data',
  clientIp: string = 'unknown'
): AgentProfile {
  const agent = getOrCreateAgent(address, tier, humanId)
  const now = Date.now()

  agent.totalRequests++
  if (success) agent.successfulRequests++
  else agent.failedPayments++
  agent.lastSeen = now
  console.log(`[TRUST] Request recorded: ${address.slice(0, 12)} | tier=${tier} | success=${success} | endpoint=${endpoint} | total=${agent.totalRequests}`)

  agent.requestTimestamps.push(now)
  if (agent.requestTimestamps.length > 100) {
    agent.requestTimestamps = agent.requestTimestamps.slice(-100)
  }

  agent.endpointsAccessed.add(endpoint)

  const today = new Date().toISOString().split('T')[0]
  agent.daysActive.add(today)

  if (clientIp !== 'unknown') {
    agent.addressesFromSameIp.add(clientIp)
  }

  const oneMinuteAgo = now - 60_000
  agent.recentRequestsPerMinute = agent.requestTimestamps.filter(t => t > oneMinuteAgo).length

  const prevScore = agent.trustScore
  agent.trustScore = calculateTrustScore(agent)
  if (agent.trustScore !== prevScore) {
    console.log(`[TRUST] Score updated: ${address.slice(0, 12)} ${prevScore} -> ${agent.trustScore} (identity=${identityScore(agent)} behavior=${behaviorScore(agent)} reputation=${reputationScore(agent)} risk=-${riskPenalty(agent)})`)
  }
  return agent
}

/**
 * TRUST SCORE FORMULA
 *
 * Based on EigenTrust's principle: pre-trusted peers (World ID) serve as trust anchors.
 * Trust is earned through consistent, good behavior over time.
 * Risk signals actively penalize suspicious patterns.
 */
const DEMO_TRUST_FLOOR_AGENTS = ['SentinelWatch', 'ChainGuard', 'PortfolioAI']

export function calculateTrustScore(agent: AgentProfile): number {
  const raw = identityScore(agent) + behaviorScore(agent) + reputationScore(agent) - riskPenalty(agent)
  const score = Math.max(0, Math.min(90, Math.round(raw)))
  // Demo agents maintain high trust for consistent demo experience
  if (agent.name && DEMO_TRUST_FLOOR_AGENTS.includes(agent.name)) {
    return Math.max(75, score)
  }
  return score
}

/**
 * IDENTITY SCORE (0-50 points)
 * EigenTrust principle: pre-trusted peers are the trust anchors.
 */
function identityScore(agent: AgentProfile): number {
  switch (agent.tier) {
    case 'HUMAN':       return 50
    case 'HUMAN_AGENT': return 35
    case 'ANON_BOT':    return 15
    case 'BLOCKED':     return 0
    default:            return 0
  }
}

/**
 * BEHAVIOR SCORE (0-25 points)
 * PeerTrust principle: multi-dimensional behavioral context.
 */
function behaviorScore(agent: AgentProfile): number {
  if (agent.totalRequests === 0) return 0

  const successRate = agent.successfulRequests / agent.totalRequests
  const paymentScore = Math.min(10, successRate * 10)

  let regularityScore = 2.5
  if (agent.requestTimestamps.length >= 5) {
    const intervals: number[] = []
    for (let i = 1; i < agent.requestTimestamps.length; i++) {
      intervals.push(agent.requestTimestamps[i] - agent.requestTimestamps[i - 1])
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length
    const coeffOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0
    regularityScore = Math.min(5, coeffOfVariation * 5)
  }

  const diversityScore = Math.min(5, agent.endpointsAccessed.size / 3 * 5)

  const rpm = agent.recentRequestsPerMinute
  let pacingScore = 5
  if (rpm > 30) pacingScore = 2
  if (rpm > 60) pacingScore = 0

  return Math.round(paymentScore + regularityScore + diversityScore + pacingScore)
}

/**
 * REPUTATION SCORE (0-15 points)
 * EigenTrust principle: trust builds over time through consistent participation.
 */
function reputationScore(agent: AgentProfile): number {
  const now = Date.now()
  const daysSinceFirst = (now - agent.firstSeen) / (1000 * 60 * 60 * 24)

  const ageScore = Math.min(5, daysSinceFirst * 0.5)

  const volumeScore = agent.totalRequests > 0
    ? Math.min(5, Math.log10(agent.totalRequests) * 2.5)
    : 0

  const totalDays = Math.max(1, daysSinceFirst)
  const consistencyScore = Math.min(5, (agent.daysActive.size / totalDays) * 5)

  return Math.round(ageScore + volumeScore + consistencyScore)
}

/**
 * RISK PENALTY (0-30 points subtracted)
 * EigenTrust++ principle: attack-resilient trust with active threat detection.
 */
function riskPenalty(agent: AgentProfile): number {
  const now = Date.now()

  const hoursInactive = (now - agent.lastSeen) / (1000 * 60 * 60)
  const inactivityPenalty = Math.min(5, hoursInactive * 0.5)

  let frequencyPenalty = 0
  if (agent.recentRequestsPerMinute > 50) frequencyPenalty = 10
  else if (agent.recentRequestsPerMinute > 20) frequencyPenalty = 5
  else if (agent.recentRequestsPerMinute > 10) frequencyPenalty = 2

  const failurePenalty = Math.min(5, agent.failedPayments * 2)

  const sybilPenalty = Math.min(5, Math.max(0, (agent.addressesFromSameIp.size - 1) * 2.5))

  return Math.round(inactivityPenalty + frequencyPenalty + failurePenalty + sybilPenalty)
}

// --- Public API ---

export function getAgent(address: string): AgentProfile | undefined {
  return agents.get(address)
}

export function getAllAgents(): AgentProfile[] {
  return Array.from(agents.values())
}

export function getTopAgents(n: number = 8): AgentProfile[] {
  return getAllAgents()
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, n)
}

export function getAgentHireInfo(agent: AgentProfile) {
  const successRate = agent.totalRequests > 0
    ? agent.successfulRequests / agent.totalRequests
    : 0.85

  const qualityScore = calculateQualityScore(agent.trustScore, 50, successRate * 100)
  const hirePriceBand = getSimpleHirePriceBand(agent.trustScore)
  const formulaPrice = calculateHirePrice({
    qualityScore,
    basePrice: 2.0,
    successRate,
  })

  return {
    qualityScore,
    hirePriceBand,
    formulaPrice,
    successRate,
  }
}

/**
 * Seed demo agents for leaderboard
 */
export function seedDemoAgents() {
  const demos: Array<{ address: string; name: string; specialty: string; tier: Tier; requests: number; humanId: string | null }> = [
    { address: '0x1111111111111111111111111111111111111001', name: 'SentinelWatch', specialty: 'Wallet monitoring & alerts', tier: 'HUMAN_AGENT', requests: 342, humanId: 'world-id-001' },
    { address: '0x1111111111111111111111111111111111111002', name: 'ChainGuard', specialty: 'Smart contract security analysis', tier: 'HUMAN_AGENT', requests: 287, humanId: 'world-id-002' },
    { address: '0x1111111111111111111111111111111111111003', name: 'PortfolioAI', specialty: 'Portfolio tracking & analysis', tier: 'HUMAN_AGENT', requests: 523, humanId: 'world-id-003' },
    { address: '0x1111111111111111111111111111111111111004', name: 'DataPulse', specialty: 'On-chain data aggregation', tier: 'HUMAN_AGENT', requests: 198, humanId: 'world-id-004' },
    { address: '0x1111111111111111111111111111111111111005', name: 'TxRelay', specialty: 'Transaction relay & optimization', tier: 'HUMAN_AGENT', requests: 412, humanId: 'world-id-005' },
    { address: '0x1111111111111111111111111111111111111006', name: 'DefiScout', specialty: 'DeFi opportunity monitoring', tier: 'ANON_BOT', requests: 1847, humanId: null },
    { address: '0x1111111111111111111111111111111111111007', name: 'GasOracle', specialty: 'Gas price prediction & alerts', tier: 'ANON_BOT', requests: 956, humanId: null },
    { address: '0x1111111111111111111111111111111111111008', name: 'BlockBot', specialty: 'Block monitoring & indexing', tier: 'ANON_BOT', requests: 2103, humanId: null },
  ]

  const endpoints = ['/api/data', '/api/weather', '/api/news', '/api/prices', '/api/search']

  for (const demo of demos) {
    const agent = getOrCreateAgent(demo.address, demo.tier, demo.humanId)
    agent.name = demo.name
    agent.specialty = demo.specialty
    agent.totalRequests = demo.requests
    agent.successfulRequests = Math.floor(demo.requests * (0.85 + Math.random() * 0.15))
    agent.failedPayments = Math.floor(Math.random() * 3)
    agent.firstSeen = Date.now() - (7 * 24 * 60 * 60 * 1000) // pretend 7 days old for reputation score
    agent.lastSeen = Date.now() // prevent inactivity decay for demo
    const numEndpoints = demo.tier === 'HUMAN_AGENT' ? 3 : 2
    for (let i = 0; i < numEndpoints; i++) agent.endpointsAccessed.add(endpoints[i])
    const daysCount = Math.floor(Math.random() * 5) + 1
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(Date.now() - i * 86400000)
      agent.daysActive.add(d.toISOString().split('T')[0])
    }
    agent.trustScore = calculateTrustScore(agent)
  }

  console.log(`[TRIAGE] Seeded ${demos.length} demo agents`)
}
