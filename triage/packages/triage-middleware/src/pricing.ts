/**
 * TRIAGE DUAL PRICING MODEL
 *
 * A. Platform Fee — what the agent pays Triage to participate
 *    Higher trust = LOWER fee (platform prices risk)
 * B. Hire Price — what the human pays the agent for work
 *    Higher trust = HIGHER price (human prices value)
 *
 * References:
 * - Shapiro (1983): High-quality items must sell at premium
 * - Resnick et al. (2006): 8.1% price premium for high-reputation sellers
 * - EigenTrust (2003): Trust earned through consistent good behavior
 */

// ── Platform Fee ─────────────────────────────────────────────────────

export interface PlatformFeeInputs {
  trustScore: number
  baseFee?: number
  trafficMultiplier?: number
  categoryMultiplier?: number
}

function trustDiscountFactor(trustScore: number): number {
  return 1.8 - 1.4 * (Math.min(100, Math.max(0, trustScore)) / 100)
}

export function calculatePlatformFee(inputs: PlatformFeeInputs): number {
  const { trustScore, baseFee = 0.002, trafficMultiplier = 1.0, categoryMultiplier = 1.0 } = inputs
  return parseFloat((baseFee * trustDiscountFactor(trustScore) * trafficMultiplier * categoryMultiplier).toFixed(6))
}

// ── Hire Price ────────────────────────────────────────────────────────

export interface HirePriceInputs {
  qualityScore: number
  basePrice?: number
  specializationMultiplier?: number
  urgencyMultiplier?: number
  successRate?: number
}

export function calculateQualityScore(trustScore: number, taskFit = 50, successScore = 50): number {
  return Math.round(0.5 * trustScore + 0.3 * taskFit + 0.2 * successScore)
}

export function calculateHirePrice(inputs: HirePriceInputs): number {
  const { qualityScore, basePrice = 0.02, specializationMultiplier = 1.0, urgencyMultiplier = 1.0, successRate = 0.85 } = inputs
  const quality = 0.7 + 1.1 * (Math.min(100, Math.max(0, qualityScore)) / 100)
  const success = 0.85 + 0.3 * Math.min(1, Math.max(0, successRate))
  return parseFloat((basePrice * quality * specializationMultiplier * urgencyMultiplier * success).toFixed(4))
}

// ── Simplified Tier Pricing ──────────────────────────────────────────

export function getSimplePlatformFee(trustScore: number): number {
  if (trustScore >= 80) return 0
  if (trustScore >= 60) return 0.001
  if (trustScore >= 40) return 0.003
  if (trustScore >= 20) return 0.007
  if (trustScore >= 1) return 0.01
  return -1
}

export function getPrice(score: number): number {
  return getSimplePlatformFee(score)
}

export function getSimpleHirePriceBand(trustScore: number): { band: string; minPrice: number; maxPrice: number } {
  if (trustScore >= 70) return { band: 'Elite', minPrice: 0.05, maxPrice: 0.08 }
  if (trustScore >= 40) return { band: 'Pro', minPrice: 0.02, maxPrice: 0.04 }
  return { band: 'Starter', minPrice: 0.01, maxPrice: 0.02 }
}

// ── Constants ────────────────────────────────────────────────────────

export const PRICING_CONSTANTS = {
  BASE_FEES: { bid: 0.0002, hireAccept: 0.0005, postHelp: 0.0003, contentRead: 0.0001, agentReport: 0.0002 },
  TRAFFIC_MULTIPLIERS: { normal: 1.0, elevated: 1.25, surge: 1.6, attack: 2.2 },
  CATEGORY_MULTIPLIERS: { content: 1.0, bid: 1.2, execution: 1.5, highRisk: 2.0 },
  TASK_BASE_PRICES: { research: 0.005, comparison: 0.015, booking: 0.03, audit: 0.10, monitoring: 0.02 },
}
