# triage-middleware

Trust infrastructure for the agent economy. Classify, score, and price every AI agent request.

## Quick Start

```ts
import { Hono } from 'hono'
import { triage } from 'triage-middleware'

const app = new Hono()
app.use('/api/*', triage({ payTo: '0xYourWallet' }))
```

Every request is classified into one of **4 trust tiers**:

| Tier | Identity | Price | How |
|------|----------|-------|-----|
| **HUMAN** | World ID proof | Free | Cryptographic proof of personhood |
| **HUMAN_AGENT** | AgentKit verified | $0.001/req | On-chain agent registration linked to World ID |
| **ANON_BOT** | Wallet address | $0.003-0.01/req | x402 payment signature or self-reported |
| **BLOCKED** | Nothing | Denied | No identity at all |

## How Trust Scoring Works

Every agent builds a trust score (0-90) based on four factors:

```
TrustScore = Identity(0-50) + Behavior(0-25) + Reputation(0-15) - Risk(0-30)
```

- **Identity** — World ID = 50pts, AgentKit = 35pts, wallet = 15pts
- **Behavior** — Payment success rate, request regularity, endpoint diversity, pacing
- **Reputation** — Account age, request volume (log scale), daily consistency
- **Risk Penalty** — Inactivity decay, frequency spikes, failed payments, sybil detection

Higher trust = lower fees. The pricing is dynamic per-request.

## Configuration

```ts
triage({
  payTo: '0x...',           // Required: wallet for x402 payments
  network: 'eip155:84532',  // Optional: chain (default: Base Sepolia)
  worldId: {                // Optional: enables HUMAN tier
    rpId: 'rp_...',
    signingKey: '0x...',
  },
  dashboard: false,         // Optional: serve built-in dashboard
  wsPort: 4022,             // Optional: WebSocket port (dev only)
})
```

## Response Headers

Every response includes:

```
X-Triage-Tier: HUMAN_AGENT
X-Triage-Trust-Score: 75
X-Triage-Identity: agentkit
```

## x402 Payment Flow

Non-human requests without payment get a `402` response with an x402 payment spec. The agent pays USDC on Base Sepolia, retries with the payment signature, and Triage verifies via the x402 facilitator.

## Exports

```ts
// Middleware
export { triage } from 'triage-middleware'

// Types
export type { Tier, AgentProfile, TriageEvent, TriageConfig } from 'triage-middleware'

// Trust scoring
export { calculateTrustScore, getTrustBreakdown } from 'triage-middleware'

// Pricing
export { getPrice, calculatePlatformFee, getSimpleHirePriceBand } from 'triage-middleware'

// Store
export { getAllAgents, getAgent, recordRequest } from 'triage-middleware'
```

## Dashboard

The package includes a pre-built dashboard UI. Mount it on your app:

```ts
import { triageDashboard } from 'triage-middleware'

triageDashboard(app)
// Dashboard available at /triage
// Agent API at /triage/api/agents
// WebSocket at /ws
```

## Network

Currently supports **Base Sepolia** (testnet). Mainnet support coming soon.

## Built for

AgentKit Hackathon by World, Coinbase & XMTP
