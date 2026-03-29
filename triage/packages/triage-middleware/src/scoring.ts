/**
 * Triage Trust Score Engine
 *
 * Based on:
 * - EigenTrust (Kamvar, Schlosser & Garcia-Molina, 2003)
 * - PeerTrust (Xiong & Liu, 2004)
 * - EigenTrust++ (Fan et al., 2012)
 *
 * Formula: TrustScore = IdentityScore + BehaviorScore + ReputationScore - RiskPenalty
 * Range: 0-90 (clamped)
 */

import type { AgentProfile, TrustBreakdown } from './types'

/**
 * IDENTITY SCORE (0-50 points)
 * Pre-trusted peers (World ID) are the trust anchors.
 */
export function identityScore(agent: AgentProfile): number {
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
 * Multi-dimensional behavioral context: payment success, regularity, diversity, pacing.
 */
export function behaviorScore(agent: AgentProfile): number {
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
 * Trust builds over time through consistent participation.
 */
export function reputationScore(agent: AgentProfile): number {
  const now = Date.now()
  const daysSinceFirst = (now - agent.firstSeen) / (1000 * 60 * 60 * 24)
  const ageScore = Math.min(5, daysSinceFirst * 0.5)
  const volumeScore = agent.totalRequests > 0 ? Math.min(5, Math.log10(agent.totalRequests) * 2.5) : 0
  const totalDays = Math.max(1, daysSinceFirst)
  const consistencyScore = Math.min(5, (agent.daysActive.size / totalDays) * 5)
  return Math.round(ageScore + volumeScore + consistencyScore)
}

/**
 * RISK PENALTY (0-30 points subtracted)
 * Attack-resilient trust with active threat detection.
 */
export function riskPenalty(agent: AgentProfile): number {
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

/** Calculate the full trust score with breakdown */
export function calculateTrustScore(agent: AgentProfile): number {
  const raw = identityScore(agent) + behaviorScore(agent) + reputationScore(agent) - riskPenalty(agent)
  return Math.max(0, Math.min(90, Math.round(raw)))
}

/** Get a full breakdown of the trust score components */
export function getTrustBreakdown(agent: AgentProfile): TrustBreakdown {
  const id = identityScore(agent)
  const beh = behaviorScore(agent)
  const rep = reputationScore(agent)
  const risk = riskPenalty(agent)
  return {
    identity: id,
    behavior: beh,
    reputation: rep,
    riskPenalty: risk,
    total: Math.max(0, Math.min(90, Math.round(id + beh + rep - risk))),
  }
}
