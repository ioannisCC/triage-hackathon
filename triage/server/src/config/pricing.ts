/**
 * TRIAGE DUAL PRICING MODEL
 *
 * Two separate price signals:
 * A. Platform Fee — what the agent pays Triage to participate
 *    Higher trust = LOWER fee (platform prices risk)
 * B. Hire Price — what the human pays the agent for work
 *    Higher trust = HIGHER price (human prices value)
 *
 * References:
 * - Shapiro (1983): High-quality items must sell at premium — compensates reputation investment
 * - Resnick et al. (2006): 8.1% price premium for established high-reputation sellers on eBay
 * - EigenTrust (2003): Trust earned through consistent good behavior
 */

// ============================================
// A. PLATFORM FEE (agent pays Triage)
// ============================================

interface PlatformFeeInputs {
  trustScore: number         // 0-100
  baseFee?: number           // default 0.002
  trafficMultiplier?: number // 1.0 normal, 1.25 elevated, 1.6 surge, 2.2 attack
  categoryMultiplier?: number // 1.0 content, 1.2 bid, 1.5 execution, 2.0 high-risk
}

/**
 * Trust discount factor: D(T) = 1.8 - 1.4 * (T/100)
 * T=0  → D=1.8 (worst agent pays 1.8x base)
 * T=100 → D=0.4 (best agent pays 0.4x base)
 */
function trustDiscountFactor(trustScore: number): number {
  return 1.8 - 1.4 * (Math.min(100, Math.max(0, trustScore)) / 100)
}

export function calculatePlatformFee(inputs: PlatformFeeInputs): number {
  const { trustScore, baseFee = 0.002, trafficMultiplier = 1.0, categoryMultiplier = 1.0 } = inputs
  const discount = trustDiscountFactor(trustScore)
  return parseFloat((baseFee * discount * trafficMultiplier * categoryMultiplier).toFixed(6))
}

// ============================================
// B. HIRE PRICE (human pays agent)
// ============================================

interface HirePriceInputs {
  qualityScore: number        // 0-100 (derived from trust + task fit + success rate)
  basePrice?: number          // default task price in USD
  specializationMultiplier?: number // 1.0 generalist, 1.15 niche, 1.35 specialist, 1.6 expert
  urgencyMultiplier?: number  // 1.0 normal, 1.25 fast, 1.6 urgent, 2.0 immediate
  successRate?: number        // 0.0 to 1.0
}

/**
 * Quality multiplier: M(Q) = 0.7 + 1.1 * (Q/100)
 * Q=0   → 0.7x (weakest agent charges 70% of base)
 * Q=100 → 1.8x (strongest agent charges 180% of base)
 */
function qualityMultiplier(qualityScore: number): number {
  return 0.7 + 1.1 * (Math.min(100, Math.max(0, qualityScore)) / 100)
}

/**
 * Historical success multiplier: H = 0.85 + 0.3 * successRate
 * 95% success → 1.135x
 * 70% success → 1.06x
 * 0% success  → 0.85x
 */
function successMultiplier(successRate: number): number {
  return 0.85 + 0.3 * Math.min(1, Math.max(0, successRate))
}

/**
 * Service quality score combining trust + task fit + success
 * Q = 0.5 * TrustScore + 0.3 * TaskFit + 0.2 * SuccessScore
 */
export function calculateQualityScore(trustScore: number, taskFit: number = 50, successScore: number = 50): number {
  return Math.round(0.5 * trustScore + 0.3 * taskFit + 0.2 * successScore)
}

export function calculateHirePrice(inputs: HirePriceInputs): number {
  const { qualityScore, basePrice = 0.02, specializationMultiplier = 1.0, urgencyMultiplier = 1.0, successRate = 0.85 } = inputs
  const quality = qualityMultiplier(qualityScore)
  const success = successMultiplier(successRate)
  return parseFloat((basePrice * quality * specializationMultiplier * urgencyMultiplier * success).toFixed(4))
}

// ============================================
// C. SIMPLIFIED TIER PRICING (used in demo)
// ============================================

/**
 * Simple platform fee lookup based on trust score tiers
 * This is what we show in the demo — clean, understandable
 */
export function getSimplePlatformFee(trustScore: number): number {
  if (trustScore >= 80) return 0
  if (trustScore >= 60) return 0.001
  if (trustScore >= 40) return 0.003
  if (trustScore >= 20) return 0.007
  if (trustScore >= 1) return 0.01
  return -1 // blocked
}

/**
 * Simple hire price band based on trust (demo-scaled: 100x lower so 5 USDC lasts)
 * Trust under 40 → starter ($0.01-0.02)
 * Trust 40-70 → pro ($0.02-0.04)
 * Trust 70+ → elite ($0.05-0.08)
 */
export function getSimpleHirePriceBand(trustScore: number): { band: string; minPrice: number; maxPrice: number } {
  if (trustScore >= 70) return { band: 'Elite', minPrice: 0.05, maxPrice: 0.08 }
  if (trustScore >= 40) return { band: 'Pro', minPrice: 0.02, maxPrice: 0.04 }
  return { band: 'Starter', minPrice: 0.01, maxPrice: 0.02 }
}

// ============================================
// D. EXPORTS for both systems
// ============================================

export const PRICING_CONSTANTS = {
  BASE_FEES: {
    bid: 0.0002,
    hireAccept: 0.0005,
    postHelp: 0.0003,
    contentRead: 0.0001,
    agentReport: 0.0002,
  },
  TRAFFIC_MULTIPLIERS: {
    normal: 1.0,
    elevated: 1.25,
    surge: 1.6,
    attack: 2.2,
  },
  CATEGORY_MULTIPLIERS: {
    content: 1.0,
    bid: 1.2,
    execution: 1.5,
    highRisk: 2.0,
  },
  TASK_BASE_PRICES: {
    research: 0.005,
    comparison: 0.015,
    booking: 0.03,
    audit: 0.10,
    monitoring: 0.02,
  },
}
