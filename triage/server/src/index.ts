import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { x402ResourceServer } from '@x402/hono'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { classifyRequest } from './middleware/triage'
import { recordRequest, getAllAgents, getAgent } from './trust/store'
import { getPrice, TIER_COLORS } from './config/tiers'
import { getSimpleHirePriceBand } from './config/pricing'
import { transferReward } from './payments/transfer'
import { emitEvent, startWebSocketServer, attachWebSocketToServer, TriageEvent } from './events/emitter'
import { seedDemoData } from './utils/seed'
import { signRequest } from '@worldcoin/idkit-server'
import { articles } from './data/content'
import {
  createBounty, getBounty, getOpenBounties, getAllBounties,
  addBid, pickWinner, directHire, getMarketplaceStats
} from './bounty/store'
import { startXmtpBot, notifyHuman, getBotAddress, getBotTestUrl } from './xmtp/bot'
import { getMonitoredWallets } from './agent/monitor'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE_SEPOLIA = 'eip155:84532'
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const payTo = process.env.PAY_TO_ADDRESS || '0x976aE51C1bc10Adfa65014cd42dc2c2cf62Fd232'

const facilitatorClient = new HTTPFacilitatorClient({
  url: 'https://x402.org/facilitator'
})

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(BASE_SEPOLIA, new ExactEvmScheme())

const app = new Hono()

// Enable CORS for dashboard + expose triage headers
app.use('/*', cors({
  origin: '*',
  exposeHeaders: ['X-Triage-Tier', 'X-Triage-Trust-Score', 'X-Triage-Identity', 'PAYMENT-REQUIRED'],
}))

// Health check
app.get('/api/health', (c) => {
  return c.json({ name: 'Triage', description: 'Trust classification for the agent economy', status: 'running' })
})

// Blog page — serve at /blog only (dashboard serves at / in production)
app.get('/blog', (c) => {
  const html = readFileSync(join(__dirname, 'pages/blog.html'), 'utf-8')
  return c.html(html)
})

// Content list — public, no triage
app.get('/api/content', (c) => {
  return c.json(articles.map(a => ({
    id: a.id, title: a.title, author: a.author,
    category: a.category, summary: a.summary,
    publishedAt: a.publishedAt, url: `/api/content/${a.id}`,
  })))
})

// API to get all agent profiles (for dashboard)
app.get('/api/agents', (c) => {
  const agents = getAllAgents().map(a => {
    const fee = getPrice(a.trustScore)
    const band = getSimpleHirePriceBand(a.trustScore)
    return {
      ...a,
      endpointsAccessed: Array.from(a.endpointsAccessed),
      addressesFromSameIp: Array.from(a.addressesFromSameIp),
      daysActive: Array.from(a.daysActive),
      platformFee: fee,
      hirePriceBand: band.band,
      hirePriceMin: band.minPrice,
    }
  })
  return c.json(agents)
})

// API to get a specific agent profile
app.get('/api/agents/:address', (c) => {
  const agent = getAgent(c.req.param('address'))
  if (!agent) return c.json({ error: 'Agent not found' }, 404)
  return c.json({
    ...agent,
    endpointsAccessed: Array.from(agent.endpointsAccessed),
    addressesFromSameIp: Array.from(agent.addressesFromSameIp),
    daysActive: Array.from(agent.daysActive),
  })
})

// ============================================
// World ID 4.0 endpoints
// ============================================
const WORLD_APP_ID = 'app_7d1c626d5f999f278a30144020444544'
const WORLD_ACTION = 'triage-verify'
const WORLD_RP_ID = process.env.WORLD_RP_ID || ''
const WORLD_SIGNING_KEY = process.env.WORLD_SIGNING_KEY || ''

// Generate rp_context for IDKit widget
app.post('/api/idkit/rp-context', (c) => {
  if (!WORLD_SIGNING_KEY) {
    return c.json({ error: 'WORLD_SIGNING_KEY not configured' }, 500)
  }
  const rpSig = signRequest(WORLD_ACTION, WORLD_SIGNING_KEY)
  return c.json({
    rp_id: WORLD_RP_ID,
    nonce: rpSig.nonce,
    created_at: rpSig.createdAt,
    expires_at: rpSig.expiresAt,
    signature: rpSig.sig,
  })
})

// Verify World ID proof
app.post('/api/verify-human', async (c) => {
  console.log(`[WORLD-ID] Verification request received`)
  const body = await c.req.json()

  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${WORLD_RP_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (response.ok) {
    const result = await response.json() as { nullifier_hash?: string }
    const humanId = result.nullifier_hash || 'world-id-verified'
    console.log(`[TRIAGE] World ID verified! Human confirmed: ${humanId.slice(0, 16)}`)

    recordRequest(humanId, 'HUMAN', true, humanId, '/verify', 'world-app')

    const event: TriageEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      tier: 'HUMAN',
      color: '#36d068',
      agentAddress: null,
      trustScore: 100,
      priceCharged: 0,
      humanId,
      requestPath: '/verify',
    }
    emitEvent(event)

    return c.json({ success: true, verified: true, humanId })
  } else {
    const error = await response.json()
    console.warn('[TRIAGE] World ID verification failed:', error)
    return c.json({ success: false, error }, 400)
  }
})

// ============ MARKETPLACE ENDPOINTS ============

app.get('/api/marketplace/stats', (c) => {
  return c.json(getMarketplaceStats())
})

// ============ CHAT ENDPOINT (Dashboard AI) ============

app.post('/api/chat', async (c) => {
  try {
    const { message, selectedAgent, history } = await c.req.json()
    if (!message) return c.json({ error: 'message required' }, 400)

    console.log(`[CHAT] Received: "${message.slice(0, 80)}"`)

    const { processMessage, findAgentByNameOrAddress } = await import('./ai/processor')
    let { reply, action } = await processMessage(message, {
      selectedAgent,
      conversationHistory: history,
      format: 'markdown',
    })

    // Execute hire if requested
    if (action.intent === 'hire_agent' && action.address) {
      const resolvedAgent = findAgentByNameOrAddress(action.address as string, message)

      if (resolvedAgent) {
        const hireBand = getSimpleHirePriceBand(resolvedAgent.trustScore)

        const bounty = createBounty({
          type: 'HUMAN_HIRES_AGENT',
          mode: 'DIRECT_HIRE',
          task: (action.task as string) || 'Hired via dashboard',
          reward: `$${hireBand.minPrice}`,
          category: 'monitoring',
          poster: { address: null, worldId: 'dashboard-user', tier: 'HUMAN' },
        })

        directHire(bounty.id, resolvedAgent.address)

        emitEvent({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          tier: 'HUMAN_AGENT',
          color: '#4a91f7',
          agentAddress: resolvedAgent.address,
          trustScore: resolvedAgent.trustScore,
          priceCharged: 0,
          humanId: 'dashboard-user',
          requestPath: `/marketplace/agent-hired/${bounty.id}`,
        })

        transferReward(resolvedAgent.address, hireBand.minPrice)

        const walletMatch = ((action.task as string) || '').match(/0x[a-fA-F0-9]{40}/)
        if (walletMatch) {
          setTimeout(() => {
            import('./agent/monitor').then(m => m.startMonitoring(walletMatch[0]!, ''))
          }, 10000)
        }

        const confirmation = `Agent hired: ${resolvedAgent.name || resolvedAgent.address.slice(0, 12)}\nTask: ${bounty.id}\nHire price: $${hireBand.minPrice}\nPayment processing...\nStatus: Active — agent is now working.`
        reply = reply ? reply + '\n\n' + confirmation : confirmation
        console.log(`[CHAT] Hired ${resolvedAgent.name} for task: ${action.task}`)
      }
    }

    console.log(`[CHAT] Returning: reply="${reply?.slice(0, 80)}" action=${action.intent} address=${action.address || 'none'}`)
    return c.json({ response: reply, action })
  } catch (err) {
    console.error('[CHAT] Error:', err)
    return c.json({ response: 'Error processing your request.', action: { intent: 'error' } }, 500)
  }
})

app.get('/api/xmtp/info', (c) => {
  return c.json({
    address: getBotAddress(),
    testUrl: getBotTestUrl(),
    status: getBotAddress() ? 'online' : 'offline',
  })
})

app.get('/api/monitor/status', (c) => {
  const wallets = getMonitoredWallets()
  return c.json({ monitoring: wallets, count: wallets.length })
})

app.get('/api/bounties', (c) => {
  const all = c.req.query('all') === 'true'
  return c.json(all ? getAllBounties() : getOpenBounties())
})

app.get('/api/bounties/:id', (c) => {
  const bounty = getBounty(c.req.param('id'))
  if (!bounty) return c.json({ error: 'Bounty not found' }, 404)
  return c.json(bounty)
})

app.post('/api/bounties', async (c) => {
  try {
    const body = await c.req.json()
    const { type, mode, task, reward, category, poster } = body
    console.log(`[MARKETPLACE] POST /api/bounties | type=${type || 'HUMAN_HIRES_AGENT'} mode=${mode || 'COMPETE'} task="${(task || '').slice(0, 60)}"`)
    if (!task) return c.json({ error: 'task is required' }, 400)

    const bounty = createBounty({
      type: type || 'HUMAN_HIRES_AGENT',
      mode: mode || 'COMPETE',
      poster: poster || { address: null, worldId: 'demo-human', tier: 'HUMAN' },
      task,
      reward: reward || '$0.05',
      category: category || 'general',
    })

    emitEvent({
      id: `bounty-created-${bounty.id}`,
      timestamp: Date.now(),
      tier: 'HUMAN',
      color: '#36d068',
      agentAddress: null,
      trustScore: 100,
      priceCharged: 0,
      humanId: bounty.poster.worldId,
      requestPath: `/marketplace/bounty-created/${bounty.id}`,
    })

    // Dashboard gets the event via WebSocket; skip noisy XMTP notification for bounty creation
    return c.json(bounty, 201)
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
})

app.post('/api/bounties/:id/pick', async (c) => {
  try {
    const { bidIndex } = await c.req.json()
    const id = c.req.param('id')
    console.log(`[MARKETPLACE] POST /api/bounties/${id}/pick | bidIndex=${bidIndex}`)
    const bounty = getBounty(id)

    if (!bounty) return c.json({ error: 'Bounty not found' }, 404)
    if (bounty.status !== 'OPEN') return c.json({ error: 'Bounty not open' }, 400)
    if (bounty.mode !== 'COMPETE') return c.json({ error: 'Not a compete bounty' }, 400)
    if (bidIndex === undefined || bidIndex === null) return c.json({ error: 'bidIndex required' }, 400)

    const winner = pickWinner(id, bidIndex)
    if (!winner) return c.json({ error: 'Invalid bid index' }, 400)

    emitEvent({
      id: `winner-${id}-${winner.id}`,
      timestamp: Date.now(),
      tier: winner.bidder.tier as 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED',
      color: winner.bidder.tier === 'HUMAN_AGENT' ? '#4a91f7' : '#f0a020',
      agentAddress: winner.bidder.address,
      trustScore: winner.bidder.trustScore,
      priceCharged: 0,
      humanId: null,
      requestPath: `/marketplace/winner-picked/${id}`,
    })

    notifyHuman(`🏆 Winner selected for ${id}!\n\nAgent: ${winner.bidder.address}\nTrust: ${winner.bidder.trustScore}\nReward: ${bounty.reward}`)
    return c.json({ message: `Winner selected for ${id}!`, winner, reward: bounty.reward, bounty: getBounty(id) })
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
})

app.post('/api/bounties/:id/hire', async (c) => {
  try {
    const { agentAddress } = await c.req.json()
    const id = c.req.param('id')
    console.log(`[MARKETPLACE] POST /api/bounties/${id}/hire | agent=${agentAddress || 'missing'}`)
    if (!agentAddress) return c.json({ error: 'agentAddress required' }, 400)

    const success = directHire(id, agentAddress)
    if (!success) {
      console.log(`[MARKETPLACE] Hire failed for ${id}: bounty not open or not direct-hire mode`)
      return c.json({ error: 'Could not hire — bounty not open or not direct-hire mode' }, 400)
    }

    console.log(`[MARKETPLACE] Hire successful: ${agentAddress.slice(0, 12)} hired for ${id}`)

    emitEvent({
      id: `hired-${id}-${agentAddress}`,
      timestamp: Date.now(),
      tier: 'HUMAN_AGENT',
      color: '#4a91f7',
      agentAddress,
      trustScore: 0,
      priceCharged: 0,
      humanId: null,
      requestPath: `/marketplace/agent-hired/${id}`,
    })

    // Transfer reward if enabled
    const agentProfile = getAgent(agentAddress)
    const agentName = agentProfile?.name || agentAddress.slice(0, 12)
    const agentTrust = agentProfile?.trustScore ?? 0
    const hireBand = getSimpleHirePriceBand(agentTrust)
    const rewardAmount = hireBand.minPrice
    console.log(`[MARKETPLACE] Hire reward: $${rewardAmount} (${hireBand.band} band) for ${agentName} trust=${agentTrust}`)

    transferReward(agentAddress, rewardAmount).then(txHash => {
      if (txHash) {
        console.log(`[PAYMENT] Hire reward paid: $${rewardAmount} to ${agentName} | tx: ${txHash}`)
        notifyHuman(`Agent hired: ${agentName}\nTask: ${id}\nHire price: $${rewardAmount}\nPayment tx: ${txHash}\nStatus: Active — agent is now working.`)
      } else {
        notifyHuman(`Agent hired: ${agentName}\nTask: ${id}\nHire price: $${rewardAmount} (display only)\nStatus: Active — agent is now working.`)
      }
    })
    return c.json({ message: `Agent ${agentAddress} hired for ${id}`, bounty: getBounty(id) })
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
})

// ============================================
// TRIAGE + DYNAMIC x402 MIDDLEWARE
// Order: classify → price → pay-or-bypass → serve
// ============================================
const triageMiddleware = async (c: any, next: any) => {
  // Step 1: Classify the request
  const classification = await classifyRequest(c)
  console.log(`[TRIAGE] Classification: tier=${classification.tier} agent=${classification.agentAddress?.slice(0, 12) || 'none'} humanId=${classification.humanId?.slice(0, 16) || 'none'} path=${c.req.path}`)

  // Step 2: Handle BLOCKED
  if (classification.tier === 'BLOCKED') {
    console.log(`[TRIAGE] BLOCKED request to ${c.req.path} — no identity`)
    const event: TriageEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      tier: 'BLOCKED',
      color: 'red',
      agentAddress: null,
      trustScore: 0,
      priceCharged: 0,
      humanId: null,
      requestPath: c.req.path
    }
    emitEvent(event)
    return c.json({ error: 'Access denied. No identity, no wallet, no trust.', tier: 'BLOCKED' }, 403)
  }

  // Step 3: Compute trust score and price
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const agent = recordRequest(
    classification.agentAddress || 'unknown',
    classification.tier,
    true,
    classification.humanId,
    c.req.path,
    clientIp
  )
  const trustScore = agent.trustScore
  const price = getPrice(trustScore)
  console.log(`[TRIAGE] Pricing: trust=${trustScore} platformFee=$${price.toFixed(4)} agent=${classification.agentAddress?.slice(0, 12) || 'unknown'} path=${c.req.path}`)

  // Step 4: Set Triage classification headers on every response
  const identityMethod = classification.tier === 'HUMAN' ? 'world-id' : classification.tier === 'HUMAN_AGENT' ? 'agentkit' : classification.agentAddress ? 'wallet' : 'none'
  c.header('X-Triage-Tier', classification.tier)
  c.header('X-Triage-Trust-Score', String(agent.trustScore))
  c.header('X-Triage-Identity', identityMethod)

  // Step 5: Emit event
  const event: TriageEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    tier: classification.tier,
    color: TIER_COLORS[classification.tier],
    agentAddress: classification.agentAddress,
    trustScore,
    priceCharged: price,
    humanId: classification.humanId,
    requestPath: c.req.path
  }
  emitEvent(event)

  // Notify human about paid content access
  if (c.req.path.startsWith('/api/content/') && classification.tier !== 'HUMAN') {
    notifyHuman(`💰 Content accessed!\n\nTier: ${classification.tier}\nAgent: ${classification.agentAddress || 'unknown'}\nPrice: $${price.toFixed(4)}\nPath: ${c.req.path}`)
  }

  // Step 5: Handle HUMAN — free access, bypass payment entirely
  if (classification.tier === 'HUMAN') {
    console.log(`[TRIAGE] HUMAN access granted (free) to ${c.req.path}`)
    return next()
  }

  // Step 6: Handle paid tiers — check for existing payment or return 402

  // Alternative: accept direct USDC transfer tx hash as payment proof
  const paymentTxHash = c.req.header('x-payment-tx')
  if (paymentTxHash && paymentTxHash.startsWith('0x')) {
    console.log(`[TRIAGE] Direct payment accepted via tx: ${paymentTxHash.slice(0, 16)}... | tier=${classification.tier} fee=$${price.toFixed(4)}`)
    const paidEvent: TriageEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      tier: classification.tier,
      color: TIER_COLORS[classification.tier] || 'gray',
      agentAddress: classification.agentAddress,
      trustScore,
      priceCharged: price,
      humanId: classification.humanId,
      requestPath: c.req.path,
    }
    emitEvent(paidEvent)
    return next()
  }

  const paymentSignature = c.req.header('PAYMENT-SIGNATURE') || c.req.header('x-payment')

  if (!paymentSignature) {
    console.log(`[TRIAGE] 402 Payment Required: $${price.toFixed(4)} for ${c.req.path} | tier=${classification.tier} trust=${trustScore}`)
    // No payment yet — return 402 with DYNAMIC price + Triage metadata
    const x402 = {
      x402Version: 2,
      accepts: [{
        scheme: 'exact',
        network: BASE_SEPOLIA,
        maxTimeoutSeconds: 300,
        asset: USDC_BASE_SEPOLIA,
        amount: String(Math.round(price * 1e6)),
        payTo,
        extra: {
          name: 'USDC',
          version: '2',
          resourceUrl: new URL(c.req.url).toString()
        }
      }],
      resource: {
        url: new URL(c.req.url).toString(),
        description: `Triage-protected endpoint`,
        mimeType: 'application/json'
      }
    }

    const encoded = Buffer.from(JSON.stringify(x402)).toString('base64')
    c.header('PAYMENT-REQUIRED', encoded)
    return c.json({
      error: 'Payment Required',
      triage: {
        tier: classification.tier,
        trustScore: agent.trustScore,
        price,
        identity: identityMethod,
      },
      x402,
    }, 402)
  }

  // Has payment signature — verify it with the facilitator
  console.log(`[TRIAGE] Payment signature received for ${c.req.path} — verifying with facilitator...`)
  try {
    const paymentPayload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString())
    const verifyRes = await fetch('https://x402.org/facilitator/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: paymentPayload,
        network: BASE_SEPOLIA,
        scheme: 'exact',
        payTo,
        asset: USDC_BASE_SEPOLIA,
        amount: String(Math.round(price * 1e6)),
      })
    })

    if (!verifyRes.ok) {
      console.warn(`[TRIAGE] Payment verification failed: ${verifyRes.status}`)
      return c.json({ error: 'Payment verification failed', tier: classification.tier }, 402)
    }

    const result = await verifyRes.json() as { valid?: boolean }
    if (!result.valid) {
      console.warn('[TRIAGE] Payment invalid per facilitator')
      return c.json({ error: 'Payment invalid', tier: classification.tier }, 402)
    }
    console.log(`[TRIAGE] Payment verified! Access granted to ${c.req.path} | tier=${classification.tier} fee=$${price.toFixed(4)}`)
  } catch (err) {
    console.warn('[TRIAGE] Payment verification error:', (err as Error).message)
    return c.json({ error: 'Payment verification error', tier: classification.tier }, 402)
  }

  await next()
}

app.use('/api/data', triageMiddleware)
app.use('/api/content/:id', triageMiddleware)
app.use('/api/bounties/:id/bid', triageMiddleware)
app.use('/api/agent/report', triageMiddleware)

// Agent report endpoint — agents submit reports through Triage
app.post('/api/agent/report', async (c) => {
  const body = await c.req.json()
  return c.json({ received: true, message: 'Report submitted through Triage', ...body })
})

// Protected route handler
app.get('/api/data', (c) => {
  return c.json({
    message: 'Access granted by Triage',
    data: {
      temperature: 22,
      humidity: 65,
      location: 'Athens, Greece',
      timestamp: Date.now()
    }
  })
})

// Single article — protected by triage middleware
app.get('/api/content/:id', (c) => {
  const article = articles.find(a => a.id === c.req.param('id'))
  if (!article) return c.json({ error: 'Article not found' }, 404)
  return c.json(article)
})

// Submit a bid — agents pay x402 through Triage to bid
app.post('/api/bounties/:id/bid', async (c) => {
  try {
    const bountyId = c.req.param('id')
    console.log(`[MARKETPLACE] POST /api/bounties/${bountyId}/bid`)
    const bounty = getBounty(bountyId)

    if (!bounty) return c.json({ error: 'Bounty not found' }, 404)
    if (bounty.status !== 'OPEN') return c.json({ error: 'Bounty closed' }, 400)
    if (bounty.mode !== 'COMPETE') return c.json({ error: 'Not a compete bounty — use /hire for direct hire' }, 400)

    const body = await c.req.json()
    const { pitch } = body
    if (!pitch) return c.json({ error: 'pitch is required — describe your capabilities' }, 400)

    const tier = (c.res.headers.get('X-Triage-Tier') || (c.req.header('x-agent-address') ? 'ANON_BOT' : 'HUMAN')) as string
    const trustScore = parseInt(c.res.headers.get('X-Triage-Trust-Score') || '0')
    const agentAddress = c.req.header('x-agent-address') || 'unknown'
    const priceCharged = getPrice(trustScore)

    const bid = addBid(bountyId, {
      bidder: { address: agentAddress, tier, trustScore },
      pitch,
      bidFee: priceCharged >= 0 ? priceCharged : 0,
    })

    if (!bid) return c.json({ error: 'Failed to add bid' }, 400)

    emitEvent({
      id: `bid-${bid.id}`,
      timestamp: Date.now(),
      tier: tier as 'HUMAN' | 'HUMAN_AGENT' | 'ANON_BOT' | 'BLOCKED',
      color: tier === 'HUMAN_AGENT' ? '#4a91f7' : tier === 'HUMAN' ? '#36d068' : '#f0a020',
      agentAddress,
      trustScore,
      priceCharged: bid.bidFee,
      humanId: null,
      requestPath: `/marketplace/bid/${bountyId}`,
    })

    notifyHuman(`📩 New bid on ${bountyId}!\n\nAgent: ${agentAddress}\nTier: ${tier}\nTrust: ${trustScore}\nBid fee: $${bid.bidFee.toFixed(4)}\nPitch: ${pitch.slice(0, 100)}`)
    return c.json({ message: 'Bid submitted successfully', bid, bounty: getBounty(bountyId) })
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
})

// ============ STATIC FILE SERVING (Production) ============

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  app.get('*', async (c) => {
    const reqPath = c.req.path === '/' ? '/index.html' : c.req.path
    try {
      const { readFile } = await import('fs/promises')
      const filePath = join(process.cwd(), '../dashboard/dist', reqPath)
      const file = await readFile(filePath)
      const ext = reqPath.split('.').pop() || 'html'
      const types: Record<string, string> = {
        html: 'text/html', js: 'application/javascript', mjs: 'application/javascript',
        css: 'text/css', svg: 'image/svg+xml', png: 'image/png',
        json: 'application/json', wasm: 'application/wasm', ico: 'image/x-icon',
      }
      return new Response(file, {
        headers: { 'Content-Type': types[ext] || 'application/octet-stream' },
      })
    } catch {
      // SPA fallback — serve index.html for client-side routing
      const { readFile } = await import('fs/promises')
      const index = await readFile(join(process.cwd(), '../dashboard/dist/index.html'))
      return new Response(index, { headers: { 'Content-Type': 'text/html' } })
    }
  })
}

// ============ START SERVERS ============

const port = Number(process.env.PORT) || 4021
const wsPort = Number(process.env.WS_PORT) || 4022

seedDemoData()

if (isProd) {
  // Production: single port, WebSocket on /ws path via HTTP upgrade
  const server = serve({ fetch: app.fetch, port })
  attachWebSocketToServer(server)
  console.log(`Triage server running on port ${port} (production, single-service)`)
} else {
  // Development: API on port, WebSocket on separate port
  startWebSocketServer(wsPort)
  serve({ fetch: app.fetch, port })
  console.log(`Triage server running on http://localhost:${port}`)
}

// Start XMTP bot (non-blocking)
startXmtpBot().catch(err => {
  console.error('[XMTP] Bot startup failed:', err)
})

process.on('SIGINT', () => {
  console.log('\n[TRIAGE] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[TRIAGE] Shutting down...')
  process.exit(0)
})
