export type Tier = 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED'

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

export interface AgentProfile {
  address: string
  tier: Tier
  trustScore: number
  totalRequests: number
  successfulRequests: number
  firstSeen: number
  lastSeen: number
  isHumanBacked: boolean
  name?: string
  specialty?: string
  platformFee?: number
  hirePriceBand?: string
  hirePriceMin?: number
}

export const TIER_META: Record<Tier, { label: string; fg: string; bg: string; border: string }> = {
  HUMAN:       { label: 'Human',   fg: '#36d068', bg: 'rgba(54,208,104,0.12)',  border: 'rgba(54,208,104,0.22)' },
  HUMAN_AGENT: { label: 'Agent',   fg: '#4a91f7', bg: 'rgba(74,145,247,0.12)',  border: 'rgba(74,145,247,0.22)' },
  ANON_BOT:    { label: 'Bot',     fg: '#f0a020', bg: 'rgba(240,160,32,0.11)',  border: 'rgba(240,160,32,0.20)' },
  BLOCKED:     { label: 'Blocked', fg: '#ee5555', bg: 'rgba(238,85,85,0.11)',   border: 'rgba(238,85,85,0.20)' },
}

export const TIER_COLORS: Record<Tier, string> = {
  HUMAN: '#36d068',
  HUMAN_AGENT: '#4a91f7',
  ANON_BOT: '#f0a020',
  BLOCKED: '#ee5555',
}

export type BountyMode = 'COMPETE' | 'DIRECT_HIRE'
export type BountyStatus = 'OPEN' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED'

export interface Bid {
  id: string
  bountyId: string
  bidder: { address: string; tier: string; trustScore: number }
  pitch: string
  bidFee: number
  submittedAt: number
}

export interface Bounty {
  id: string
  type: string
  mode: BountyMode
  poster: { address: string | null; worldId: string | null; tier: string }
  task: string
  reward: string
  category: string
  status: BountyStatus
  bids: Bid[]
  winner: string | null
  hiredAgent: string | null
  createdAt: number
  expiresAt: number
}

export interface MarketplaceStats {
  totalBounties: number
  openBounties: number
  activeBounties: number
  completedBounties: number
  totalBids: number
  totalBidFees: number
}

export interface Article {
  id: string
  title: string
  author: string
  category: string
  summary: string
  content?: string
  publishedAt: string
}
