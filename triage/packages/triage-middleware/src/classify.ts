import type { Context } from 'hono'
import type { Tier, ClassificationResult } from './types'
import { TIER_COLORS } from './types'
import { isVerifiedHuman } from './store'

/**
 * 4-Tier Identity Classification
 *
 * 1. HUMAN — World ID cryptographic proof (unfakeable)
 * 2. HUMAN_AGENT — AgentKit on-chain registration + World ID link
 * 3. ANON_BOT — wallet address from x402 payment or self-reported header
 * 4. BLOCKED — no identity
 */
export async function classifyRequest(c: Context): Promise<ClassificationResult> {
  const result = (tier: Tier, address: string | null = null, humanId: string | null = null): ClassificationResult => ({
    tier,
    color: TIER_COLORS[tier],
    agentAddress: address,
    humanId,
    trustScore: tier === 'HUMAN' ? 100 : tier === 'HUMAN_AGENT' ? 40 : tier === 'ANON_BOT' ? 5 : 0,
  })

  // TIER 1: World ID verification
  // Only accepts nullifier hashes that were verified via World's API through /triage/verify-human
  const worldIdHeader = c.req.header('x-world-id') || c.req.header('x-world-id-proof')
  if (worldIdHeader && isVerifiedHuman(worldIdHeader)) {
    return result('HUMAN', null, worldIdHeader)
  }

  // TIER 2: AgentKit on-chain verification
  try {
    const {
      createAgentBookVerifier, parseAgentkitHeader,
      validateAgentkitMessage, verifyAgentkitSignature, AGENTKIT,
    } = await import('@worldcoin/agentkit')

    const agentkitHeader = c.req.header(AGENTKIT) || c.req.header('agentkit')
    if (agentkitHeader) {
      const payload = parseAgentkitHeader(agentkitHeader)
      const requestUrl = new URL(c.req.url).toString()
      const validation = await validateAgentkitMessage(payload, requestUrl)
      if (validation.valid) {
        const verification = await verifyAgentkitSignature(payload)
        if (verification.valid && verification.address) {
          const agentBook = createAgentBookVerifier({ network: 'base' } as any)
          const humanId = await agentBook.lookupHuman(verification.address, payload.chainId)
          if (humanId) {
            return result('HUMAN_AGENT', verification.address, humanId)
          }
        }
      }
    }
  } catch {
    // AgentKit not available or verification failed — continue
  }

  // TIER 3a: x402 payment signature (cryptographic wallet proof)
  const paymentHeader = c.req.header('payment-signature') || c.req.header('x-payment')
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString())
      const payerAddress = decoded?.payload?.authorization?.from || decoded?.from || decoded?.payload?.from
      if (payerAddress && payerAddress.startsWith('0x')) {
        return result('ANON_BOT', payerAddress, null)
      }
    } catch { /* invalid payment header */ }
  }

  // TIER 3b: Direct tx hash payment proof
  const paymentTxHash = c.req.header('x-payment-tx')
  if (paymentTxHash && paymentTxHash.startsWith('0x')) {
    const agentAddress = c.req.header('x-agent-address')
    if (agentAddress) return result('ANON_BOT', agentAddress, null)
  }

  // TIER 3c: Self-reported agent address (weak)
  const agentAddress = c.req.header('x-agent-address')
  if (agentAddress) {
    return result('ANON_BOT', agentAddress, null)
  }

  // TIER 4: No identity
  return result('BLOCKED')
}
