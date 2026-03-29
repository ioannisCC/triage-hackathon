# triage-middleware

Trust infrastructure for the agent economy.  
One middleware. Four trust tiers. Dynamic pricing. Real-time dashboard.

Every API request is classified by identity, scored by behavior, and priced by trust — automatically.

## Install
```bash
npm install triage-middleware
```

## 3-Line Integration
```ts
import { Hono } from 'hono'
import { triage } from 'triage-middleware'

const app = new Hono()
app.use('/api/*', triage({ payTo: '0xYourWallet' }))
// Done. Every request is now classified, scored, and priced.
```

## What Happens to Every Request
Request arrives
→ Identity check (World ID? AgentKit? Wallet? Nothing?)
→ Tier assigned (HUMAN / HUMAN_AGENT / ANON_BOT / BLOCKED)
→ Trust score calculated (0-90, four-factor formula)
→ Price determined (trust score → dynamic x402 price)
→ Response headers set (X-Triage-Tier, X-Triage-Trust-Score)
→ WebSocket event emitted (dashboard updates in real-time)
→ Request continues (or 402/403 if payment needed/blocked)

## The Four Trust Tiers

| Tier | Identity | Access | How Detected |
|------|----------|--------|--------------|
| **HUMAN** | World ID verified | Free | Cryptographic proof of unique personhood |
| **HUMAN_AGENT** | AgentKit registered | $0.001/req | On-chain agent registration linked to World ID |
| **ANON_BOT** | Wallet address only | $0.003-$0.01/req | x402 payment signature or wallet header |
| **BLOCKED** | Nothing | Denied (403) | No identity, no wallet, no trust |

Verified humans always pass free. Trusted agents pay less. Unknown bots pay full price. Blocked traffic is rejected.

## Trust Score Formula

Every agent builds a reputation score (0-90) based on four factors, inspired by Stanford's EigenTrust algorithm:
TrustScore = Identity(0-50) + Behavior(0-25) + Reputation(0-15) - Risk(0-30)

**Identity (0-50 points)** — Who are you?
- World ID proof: 50 pts (cryptographic, unfakeable)
- AgentKit registration: 35 pts (on-chain, human-linked)
- Payment-verified wallet: 15 pts (has funds, willing to pay)
- Self-reported address: 5 pts (weak, unverified)
- Nothing: 0 pts

**Behavior (0-25 points)** — How do you act?
- Payment success rate (0-10): consistent payers score higher
- Request regularity (0-5): steady patterns beat erratic bursts
- Endpoint diversity (0-5): broad usage beats single-endpoint hammering
- Request pacing (0-5): <30 RPM = 5pts, 30-60 = 2pts, >60 = 0pts

**Reputation (0-15 points)** — How long have you been here?
- Account age (0-5): older = more trusted
- Volume (0-5): logarithmic scale, rewards sustained activity
- Consistency (0-5): daily active ratio over total days

**Risk Penalty (0-30 points subtracted)**
- Inactivity decay: dormant agents lose trust
- Frequency spikes: sudden traffic surges trigger surge pricing
- Failed payments: payment failures erode trust fast
- Sybil detection: same IP + multiple addresses = penalty

## Dynamic Pricing

Trust score maps directly to x402 price per request:

| Score | Category | Price |
|-------|----------|-------|
| 80-100 | Highly Trusted | Free |
| 60-79 | Trusted | $0.001 |
| 40-59 | Building Trust | $0.003 |
| 20-39 | Low Trust | $0.007 |
| 1-19 | Minimal Trust | $0.01 |
| 0 | No Trust | Blocked |

Higher trust = lower cost. The incentive is built into the economics — agents that behave well pay less over time.

## Configuration
```ts
import { triage } from 'triage-middleware'

app.use('/api/*', triage({
  // Required: wallet address where x402 payments are sent
  payTo: '0xYourWalletAddress',

  // Optional: blockchain network (default: Base Sepolia)
  network: 'eip155:84532',

  // Optional: enables HUMAN tier with World ID verification
  worldId: {
    rpId: 'rp_your_app_id',        // from developer.world.org
    signingKey: '0xYourSigningKey', // from World developer portal
  },

  // Optional: serve built-in monitoring dashboard
  dashboard: true,

  // Optional: standalone WebSocket port (dev only)
  wsPort: 4022,
}))
```

Without `worldId`, the HUMAN tier is disabled — all traffic is classified as HUMAN_AGENT, ANON_BOT, or BLOCKED. Add your World ID credentials to enable free access for verified humans.

## Response Headers

Every response includes classification metadata:
X-Triage-Tier: HUMAN_AGENT
X-Triage-Trust-Score: 75
X-Triage-Identity: agentkit

Your API can read these headers to customize responses per tier.

## x402 Payment Flow

When a non-human request arrives without payment:

1. Triage returns `402 Payment Required` with an x402 payment spec
2. The spec includes: USDC amount, wallet address, chain, facilitator URL
3. The agent pays USDC on Base Sepolia
4. The agent retries with the payment signature
5. Triage verifies payment via the x402 facilitator
6. Request proceeds, trust score updates

All payments are real USDC on Base Sepolia, verified on-chain.

## Built-in Dashboard

The package includes a pre-built real-time monitoring dashboard:
```ts
import { triage, triageDashboard, attachWebSocketToServer } from 'triage-middleware'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
app.use('/api/*', triage({ payTo: '0xYourWallet' }))
triageDashboard(app)

const server = serve({ fetch: app.fetch, port: 3000 })
attachWebSocketToServer(server)

// With World ID verification routes auto-mounted:
triageDashboard(app, {
  rpId: 'rp_your_app_id',
  signingKey: '0xYourSigningKey',
})
// Auto-creates /triage/verify-context and /triage/verify-human

// Dashboard at http://localhost:3000/triage
// Real-time events via WebSocket at /ws
```

The dashboard shows:
- Live request flow visualization (particle canvas)
- Traffic distribution by tier (donut chart)
- Trust leaderboard (top agents ranked by score)
- Recent traffic feed (every classification event)
- Revenue counter (USDC earned from agent payments)

No configuration needed. One function call. Dashboard appears.

## Exports
```ts
// Middleware
import { triage } from 'triage-middleware'

// Dashboard
import { triageDashboard, attachWebSocketToServer } from 'triage-middleware'

// Types
import type { Tier, AgentProfile, TriageEvent, TriageConfig } from 'triage-middleware'

// Trust scoring (use directly for custom logic)
import { calculateTrustScore, getTrustBreakdown } from 'triage-middleware'

// Pricing
import { getPrice, calculatePlatformFee, getSimpleHirePriceBand } from 'triage-middleware'

// Agent store
import { getAllAgents, getAgent, recordRequest } from 'triage-middleware'
```

## Example: The Roast Oracle

A demo site protected by triage-middleware:
```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { triage, triageDashboard, attachWebSocketToServer } from 'triage-middleware'

const app = new Hono()

app.use('/api/*', triage({
  payTo: '0x976aE51C1bc10Adfa65014cd42dc2c2cf62Fd232',
  worldId: {
    rpId: 'rp_your_id',
    signingKey: '0xYourKey',
  },
}))

triageDashboard(app)

app.get('/api/joke', (c) => {
  const tier = c.req.header('X-Triage-Tier')
  return c.json({ 
    joke: "Why do AI agents use Triage? Trust issues.",
    tier,
    price: tier === 'HUMAN' ? 'free' : 'paid'
  })
})

const server = serve({ fetch: app.fetch, port: 3000 })
attachWebSocketToServer(server)
```

Humans access free. Bots pay. Blocked traffic never reaches your endpoint.

## Network

Currently supports **Base Sepolia** (testnet). Mainnet support planned.

## Academic References

The trust scoring formula is based on peer-reviewed research:
- EigenTrust (Kamvar, Schlosser & Garcia-Molina, 2003) — reputation through consistent behavior
- PeerTrust (Xiong & Liu, 2004) — multi-dimensional behavioral context
- EigenTrust++ (Fan et al., 2012) — attack-resilient trust management

## Built for

AgentKit Hackathon by World, Coinbase & XMTP

[npm](https://npmjs.com/package/triage-middleware) · [GitHub](https://github.com/ioannisCC/triage-hackathon) · [Live Demo](https://triage-hackathon-production.up.railway.app)