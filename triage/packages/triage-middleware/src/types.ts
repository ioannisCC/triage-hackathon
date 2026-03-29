export type Tier = 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED'

export const TIER_COLORS: Record<Tier, string> = {
  HUMAN: '#36d068',
  HUMAN_AGENT: '#4a91f7',
  ANON_BOT: '#f0a020',
  BLOCKED: '#ee5555',
}

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

export interface TriageEvent {
  id: string
  timestamp: number
  tier: Tier
  color: string
  agentAddress: string | null
  trustScore: number
  priceCharged: number
  humanId: string | null
  requestPath: string
}

export interface ClassificationResult {
  tier: Tier
  color: string
  agentAddress: string | null
  humanId: string | null
  trustScore: number
}

export interface TriageConfig {
  payTo: string
  network?: string
  worldId?: {
    rpId: string
    signingKey: string
  }
  dashboard?: boolean
  wsPort?: number
}

export interface TrustBreakdown {
  identity: number
  behavior: number
  reputation: number
  riskPenalty: number
  total: number
}
