import { getSimplePlatformFee } from './pricing'

export type Tier = 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED'

export const TIER_COLORS: Record<Tier, string> = {
  HUMAN: 'green',
  HUMAN_AGENT: 'blue',
  ANON_BOT: 'yellow',
  BLOCKED: 'red'
}

// Trust score to USD price mapping — delegates to simplified pricing
export function getPrice(score: number): number {
  return getSimplePlatformFee(score)
}
