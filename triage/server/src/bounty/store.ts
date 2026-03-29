export type BountyType = 'HUMAN_HIRES_AGENT' | 'AGENT_NEEDS_HUMAN'
export type BountyMode = 'COMPETE' | 'DIRECT_HIRE'
export type BountyStatus = 'OPEN' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED'

export interface BountyPoster {
  address: string | null
  worldId: string | null
  tier: string
}

export interface Bid {
  id: string
  bountyId: string
  bidder: {
    address: string
    tier: string
    trustScore: number
  }
  pitch: string
  bidFee: number
  submittedAt: number
}

export interface Bounty {
  id: string
  type: BountyType
  mode: BountyMode
  poster: BountyPoster
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

const bountyStore = new Map<string, Bounty>()
let bountyCounter = 0

export function createBounty(params: {
  type: BountyType
  mode?: BountyMode
  poster: BountyPoster
  task: string
  reward: string
  category?: string
}): Bounty {
  bountyCounter++
  const id = `B${String(bountyCounter).padStart(3, '0')}`
  console.log(`[BOUNTY] Creating bounty ${id}: type=${params.type} mode=${params.mode || 'COMPETE'} category=${params.category || 'general'}`)
  console.log(`[BOUNTY] Task: "${params.task.slice(0, 80)}" | Reward: ${params.reward} | Poster: ${params.poster.address?.slice(0, 12) || 'anonymous'}`)
  const bounty: Bounty = {
    id,
    type: params.type,
    mode: params.mode || 'COMPETE',
    poster: params.poster,
    task: params.task,
    reward: params.reward,
    category: params.category || 'general',
    status: 'OPEN',
    bids: [],
    winner: null,
    hiredAgent: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  }
  bountyStore.set(id, bounty)
  console.log(`[BOUNTY] Bounty ${id} created successfully | Expires: ${new Date(bounty.expiresAt).toISOString()}`)
  return bounty
}

export function getBounty(id: string): Bounty | undefined {
  return bountyStore.get(id)
}

export function getOpenBounties(): Bounty[] {
  const now = Date.now()
  return Array.from(bountyStore.values())
    .filter(b => b.status === 'OPEN' && b.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getAllBounties(): Bounty[] {
  return Array.from(bountyStore.values())
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function addBid(bountyId: string, bid: Omit<Bid, 'id' | 'bountyId' | 'submittedAt'>): Bid | null {
  const bounty = bountyStore.get(bountyId)
  if (!bounty || bounty.status !== 'OPEN' || bounty.mode !== 'COMPETE') {
    console.log(`[BOUNTY] Bid rejected for ${bountyId}: ${!bounty ? 'not found' : bounty.status !== 'OPEN' ? 'not open' : 'not compete mode'}`)
    return null
  }

  const fullBid: Bid = {
    ...bid,
    id: `BID${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    bountyId,
    submittedAt: Date.now(),
  }

  bounty.bids.push(fullBid)
  bounty.bids.sort((a, b) => b.bidder.trustScore - a.bidder.trustScore)
  console.log(`[BOUNTY] Bid ${fullBid.id} added to ${bountyId} | Agent: ${bid.bidder.address.slice(0, 12)} | Trust: ${bid.bidder.trustScore} | Fee: $${bid.bidFee.toFixed(4)} | Total bids: ${bounty.bids.length}`)
  return fullBid
}

export function pickWinner(bountyId: string, bidIndex: number): Bid | null {
  const bounty = bountyStore.get(bountyId)
  if (!bounty || bounty.status !== 'OPEN') {
    console.log(`[BOUNTY] pickWinner failed for ${bountyId}: ${!bounty ? 'not found' : 'not open'}`)
    return null
  }
  if (bidIndex < 0 || bidIndex >= bounty.bids.length) {
    console.log(`[BOUNTY] pickWinner failed for ${bountyId}: invalid bid index ${bidIndex} (${bounty.bids.length} bids)`)
    return null
  }

  const winningBid = bounty.bids[bidIndex]
  bounty.winner = winningBid.bidder.address
  bounty.status = 'COMPLETED'
  console.log(`[BOUNTY] Winner picked for ${bountyId}: ${winningBid.bidder.address.slice(0, 12)} | Trust: ${winningBid.bidder.trustScore} | Reward: ${bounty.reward}`)
  return winningBid
}

export function directHire(bountyId: string, agentAddress: string): boolean {
  const bounty = bountyStore.get(bountyId)
  if (!bounty || bounty.status !== 'OPEN' || bounty.mode !== 'DIRECT_HIRE') {
    console.log(`[BOUNTY] directHire failed for ${bountyId}: ${!bounty ? 'not found' : bounty.status !== 'OPEN' ? 'not open' : 'not direct-hire mode'}`)
    return false
  }

  bounty.hiredAgent = agentAddress
  bounty.status = 'ACTIVE'
  console.log(`[BOUNTY] Agent hired for ${bountyId}: ${agentAddress.slice(0, 12)} | Task: "${bounty.task.slice(0, 60)}" | Status: ACTIVE`)
  return true
}

export function getMarketplaceStats() {
  const all = Array.from(bountyStore.values())
  return {
    totalBounties: all.length,
    openBounties: all.filter(b => b.status === 'OPEN').length,
    activeBounties: all.filter(b => b.status === 'ACTIVE').length,
    completedBounties: all.filter(b => b.status === 'COMPLETED').length,
    totalBids: all.reduce((sum, b) => sum + b.bids.length, 0),
    totalBidFees: all.reduce((sum, b) => sum + b.bids.reduce((s, bid) => s + bid.bidFee, 0), 0),
  }
}
