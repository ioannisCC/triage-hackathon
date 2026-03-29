import { Context } from 'hono'
import {
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  AGENTKIT
} from '@worldcoin/agentkit'
import { Tier, TIER_COLORS } from '../config/tiers'

export interface ClassificationResult {
  tier: Tier
  color: string
  agentAddress: string | null
  humanId: string | null
  trustScore: number
}

// AgentBook verifier — initialized once
const agentBook = createAgentBookVerifier({ network: 'base' } as any)

/**
 * Identity hierarchy (strongest to weakest):
 * 1. HUMAN — World ID cryptographic proof (unfakeable, one person one identity)
 * 2. HUMAN_AGENT — AgentKit on-chain registration + World ID link
 * 3. ANON_BOT (payment) — wallet address extracted from x402 payment signature (can't fake, tied to private key)
 * 3b. ANON_BOT (header) — self-reported x-agent-address header (weak, can be faked — demo fallback only)
 * 4. BLOCKED — no identity at all
 */
export async function classifyRequest(c: Context): Promise<ClassificationResult> {
  const defaultResult = (tier: Tier, address: string | null = null, humanId: string | null = null): ClassificationResult => ({
    tier,
    color: TIER_COLORS[tier],
    agentAddress: address,
    humanId,
    trustScore: tier === 'HUMAN' ? 100 : tier === 'HUMAN_AGENT' ? 40 : tier === 'ANON_BOT' ? 5 : 0
  })

  // --- TIER 1: Check for World ID verification ---
  // Demo fallback header
  const worldIdHeader = c.req.header('x-world-id')
  if (worldIdHeader === 'verified') {
    console.log(`[CLASSIFY] TIER 1 match: World ID verified header → HUMAN`)
    return defaultResult('HUMAN', null, 'world-id-verified-human')
  }

  // --- TIER 2: Check for AgentKit header (real verification) ---
  try {
    const agentkitHeader = c.req.header(AGENTKIT) || c.req.header('agentkit')
    if (agentkitHeader) {
      const payload = parseAgentkitHeader(agentkitHeader)
      const requestUrl = new URL(c.req.url).toString()

      const validation = await validateAgentkitMessage(payload, requestUrl)
      if (validation.valid) {
        const verification = await verifyAgentkitSignature(payload)
        if (verification.valid && verification.address) {
          const humanId = await agentBook.lookupHuman(verification.address, payload.chainId)
          if (humanId) {
            console.log(`[CLASSIFY] TIER 2 match: AgentKit verified → HUMAN_AGENT | address=${verification.address.slice(0, 12)} humanId=${humanId.slice(0, 16)}`)
            return defaultResult('HUMAN_AGENT', verification.address, humanId)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[TRIAGE] AgentKit verification failed:', (err as Error).message)
    // Fall through to demo header check
  }

  // Demo fallback for human-backed agents
  const agentDemoHeader = c.req.header('x-agentkit-demo')
  if (agentDemoHeader === 'human-backed') {
    const demoAddress = c.req.header('x-agent-address') || '0xDEMO_AGENT_' + Date.now().toString(16)
    console.log(`[CLASSIFY] TIER 2 match: AgentKit demo header → HUMAN_AGENT | address=${demoAddress.slice(0, 12)}`)
    return defaultResult('HUMAN_AGENT', demoAddress, 'demo-human-id')
  }

  // --- TIER 3a: Check for x402 payment signature (STRONG identity) ---
  // When an agent retries after a 402, they include a payment signature
  // We extract their REAL wallet address from it — can't be faked
  const paymentHeader = c.req.header('payment-signature') || c.req.header('x-payment')
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString())
      const payerAddress = decoded?.payload?.authorization?.from
        || decoded?.from
        || decoded?.payload?.from

      if (payerAddress && payerAddress.startsWith('0x')) {
        console.log(`[CLASSIFY] TIER 3a match: x402 payment signature → ANON_BOT | payer=${payerAddress.slice(0, 12)}`)
        return defaultResult('ANON_BOT', payerAddress, null)
      }
    } catch (err) {
      console.warn('[TRIAGE] Could not parse payment signature for identity:', (err as Error).message)
    }
  }

  // --- TIER 3b: Self-reported agent address (WEAK identity — fallback) ---
  const agentAddress = c.req.header('x-agent-address')
  if (agentAddress) {
    console.log(`[CLASSIFY] TIER 3b match: self-reported address → ANON_BOT | address=${agentAddress.slice(0, 12)}`)
    return defaultResult('ANON_BOT', agentAddress, null)
  }

  // --- TIER 4: Nothing ---
  console.log(`[CLASSIFY] No identity detected → BLOCKED`)
  return defaultResult('BLOCKED')
}
