import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import type { TriageConfig, TriageEvent } from './types'
import { classifyRequest } from './classify'
import { recordRequest, getAllAgents, getAgent, addVerifiedHuman } from './store'
import { getPrice, getSimplePlatformFee, getSimpleHirePriceBand } from './pricing'
import { emitEvent, startWebSocketServer, attachWebSocketToServer } from './emitter'
import { TIER_COLORS } from './types'

export type { Tier, AgentProfile, TriageEvent, TriageConfig, ClassificationResult, TrustBreakdown } from './types'
export { calculateTrustScore, getTrustBreakdown, identityScore, behaviorScore, reputationScore, riskPenalty } from './scoring'
export { calculatePlatformFee, calculateHirePrice, calculateQualityScore, getSimplePlatformFee, getSimpleHirePriceBand, getPrice, PRICING_CONSTANTS } from './pricing'
export { recordRequest, getAgent, getAllAgents, getTopAgents, getOrCreateAgent, addVerifiedHuman, isVerifiedHuman } from './store'
export { emitEvent, startWebSocketServer, attachWebSocketToServer } from './emitter'
export { classifyRequest } from './classify'

const BASE_SEPOLIA = 'eip155:84532'
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

/**
 * Triage middleware for Hono applications.
 *
 * Classifies every request into one of 4 trust tiers, calculates a dynamic
 * price based on the agent's trust score, and returns a 402 payment challenge
 * via the x402 protocol if payment is required.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { triage } from 'triage-middleware'
 *
 * const app = new Hono()
 * app.use('/api/*', triage({ payTo: '0xYourWallet' }))
 * ```
 */
export function triage(config: TriageConfig) {
  const { payTo, network = BASE_SEPOLIA } = config

  return async (c: Context, next: Next) => {
    // Step 1: Classify the request
    const classification = await classifyRequest(c)

    // Step 2: Handle BLOCKED
    if (classification.tier === 'BLOCKED') {
      const event: TriageEvent = {
        id: crypto.randomUUID(), timestamp: Date.now(),
        tier: 'BLOCKED', color: TIER_COLORS['BLOCKED'],
        agentAddress: null, trustScore: 0, priceCharged: 0,
        humanId: null, requestPath: c.req.path,
      }
      emitEvent(event)
      return c.json({ error: 'Access denied. No identity, no wallet, no trust.', tier: 'BLOCKED' }, 403)
    }

    // Step 3: Record request + calculate trust score + price
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    const agent = recordRequest(
      classification.agentAddress || 'unknown',
      classification.tier, true,
      classification.humanId, c.req.path, clientIp,
    )
    const trustScore = agent.trustScore
    const price = getPrice(trustScore)

    // Step 4: Set classification headers
    const identityMethod = classification.tier === 'HUMAN' ? 'world-id'
      : classification.tier === 'HUMAN_AGENT' ? 'agentkit'
      : classification.agentAddress ? 'wallet' : 'none'

    c.header('X-Triage-Tier', classification.tier)
    c.header('X-Triage-Trust-Score', String(trustScore))
    c.header('X-Triage-Identity', identityMethod)

    // Step 5: Emit event
    const event: TriageEvent = {
      id: crypto.randomUUID(), timestamp: Date.now(),
      tier: classification.tier, color: TIER_COLORS[classification.tier],
      agentAddress: classification.agentAddress,
      trustScore, priceCharged: price,
      humanId: classification.humanId, requestPath: c.req.path,
    }
    emitEvent(event)

    // Step 6: HUMAN gets free access
    if (classification.tier === 'HUMAN') return next()

    // Step 7: Accept direct payment tx hash
    const paymentTxHash = c.req.header('x-payment-tx')
    if (paymentTxHash && paymentTxHash.startsWith('0x')) return next()

    // Step 8: Check for x402 payment signature
    const paymentSignature = c.req.header('PAYMENT-SIGNATURE') || c.req.header('x-payment')

    if (!paymentSignature) {
      // Return 402 with x402 payment spec
      const x402 = {
        x402Version: 2,
        accepts: [{
          scheme: 'exact', network,
          maxTimeoutSeconds: 300,
          asset: USDC_BASE_SEPOLIA,
          amount: String(Math.round(price * 1e6)),
          payTo,
          extra: { name: 'USDC', version: '2', resourceUrl: new URL(c.req.url).toString() },
        }],
        resource: {
          url: new URL(c.req.url).toString(),
          description: 'Triage-protected endpoint',
          mimeType: 'application/json',
        },
      }

      const encoded = Buffer.from(JSON.stringify(x402)).toString('base64')
      c.header('PAYMENT-REQUIRED', encoded)
      return c.json({
        error: 'Payment Required',
        triage: { tier: classification.tier, trustScore, price, identity: identityMethod },
        x402,
      }, 402)
    }

    // Step 9: Verify x402 payment signature
    try {
      const paymentPayload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString())
      const verifyRes = await fetch('https://x402.org/facilitator/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: paymentPayload, network, scheme: 'exact',
          payTo, asset: USDC_BASE_SEPOLIA,
          amount: String(Math.round(price * 1e6)),
        }),
      })

      if (!verifyRes.ok) return c.json({ error: 'Payment verification failed', tier: classification.tier }, 402)
      const result = await verifyRes.json() as { valid?: boolean }
      if (!result.valid) return c.json({ error: 'Payment invalid', tier: classification.tier }, 402)
    } catch {
      return c.json({ error: 'Payment verification error', tier: classification.tier }, 402)
    }

    await next()
  }
}

/**
 * Mount the Triage dashboard on a Hono app.
 *
 * Serves the pre-built dashboard UI at /triage/* and adds
 * an API endpoint at /triage/api/agents for real-time agent data.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { triage, triageDashboard } from 'triage-middleware'
 *
 * const app = new Hono()
 * app.use('/api/*', triage({ payTo: '0xYou' }))
 * triageDashboard(app)
 * ```
 */
export function triageDashboard(app: Hono, worldIdConfig?: { rpId: string; signingKey: string }) {
  const dashboardDir = join(fileURLToPath(import.meta.url), '../../dashboard-dist')

  // World ID verification routes
  if (worldIdConfig) {
    app.post('/triage/verify-context', async (c) => {
      try {
        const { signRequest } = await import('@worldcoin/idkit-server')
        const rpSig = signRequest('triage-verify', worldIdConfig.signingKey)
        return c.json({
          rp_id: worldIdConfig.rpId,
          nonce: rpSig.nonce,
          created_at: rpSig.createdAt,
          expires_at: rpSig.expiresAt,
          signature: rpSig.sig,
        })
      } catch (err) {
        return c.json({ error: 'World ID not configured' }, 500)
      }
    })

    app.post('/triage/verify-human', async (c) => {
      try {
        const body = await c.req.json()
        const response = await fetch(
          `https://developer.world.org/api/v4/verify/${worldIdConfig.rpId}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        )
        if (response.ok) {
          const result = await response.json() as { nullifier_hash?: string }
          const humanId = result.nullifier_hash || 'world-id-verified'
          addVerifiedHuman(humanId)
          return c.json({ success: true, verified: true, humanId })
        } else {
          const error = await response.json()
          return c.json({ success: false, error }, 400)
        }
      } catch {
        return c.json({ success: false, error: 'Verification failed' }, 500)
      }
    })
  }

  const MIME: Record<string, string> = {
    html: 'text/html', js: 'application/javascript', mjs: 'application/javascript',
    css: 'text/css', svg: 'image/svg+xml', png: 'image/png',
    json: 'application/json', wasm: 'application/wasm', ico: 'image/x-icon',
  }

  // Agent profiles API
  app.get('/triage/api/agents', (c) => {
    const agents = getAllAgents().map(a => ({
      ...a,
      endpointsAccessed: Array.from(a.endpointsAccessed),
      addressesFromSameIp: Array.from(a.addressesFromSameIp),
      daysActive: Array.from(a.daysActive),
      platformFee: getPrice(a.trustScore),
      hirePriceBand: getSimpleHirePriceBand(a.trustScore).band,
      hirePriceMin: getSimpleHirePriceBand(a.trustScore).minPrice,
    }))
    return c.json(agents)
  })

  // Serve dashboard static files
  app.get('/triage/*', async (c) => {
    const reqPath = c.req.path.replace('/triage', '') || '/index.html'
    const filePath = reqPath === '/' ? '/index.html' : reqPath
    try {
      const file = await readFile(join(dashboardDir, filePath))
      const ext = filePath.split('.').pop() || 'html'
      return new Response(file, {
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
      })
    } catch {
      const index = await readFile(join(dashboardDir, 'index.html'))
      return new Response(index, { headers: { 'Content-Type': 'text/html' } })
    }
  })
}
