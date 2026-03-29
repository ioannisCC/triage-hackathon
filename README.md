<p align="center">
  <img src="triage/dashboard/public/favicon.svg" width="80" alt="Triage" />
</p>

<h1 align="center">TRIAGE</h1>

<p align="center">
  <strong>Trust infrastructure for the agent economy.</strong><br/>
  One middleware. Four trust tiers. Dynamic pricing. Real-time visibility.
</p>

<p align="center">
  <a href="https://npmjs.com/package/triage-middleware">npm</a> ·
  <a href="https://triage-roaster-production.up.railway.app">The Roaster</a> ·
  <a href="https://triage-hackathon-production.up.railway.app">Dashboard</a> ·
  <a href="https://triage-roaster-production.up.railway.app/triage">Package Dashboard</a>
</p>

---

## What is Triage?

Triage is a drop-in middleware that classifies every API request into four trust tiers — verified human (World ID), human-backed agent (AgentKit), anonymous bot (wallet only), or blocked — then dynamically prices access using x402 based on a trust score derived from identity, behavior, and reputation.

Install with `npm install triage-middleware`, add three lines of code, and your API knows who's calling and what they should pay.

We demonstrate it through **The Roaster** — a live site where verified humans get roasted for free, bots pay, and blocked traffic is denied — with every request visible on the monitoring dashboard in real-time.

Built solo in a weekend for the AgentKit Hackathon by World, Coinbase & XMTP.

## The Problem

AI agents are flooding APIs. Current solutions are binary — allow or block. There's no middle ground, no reputation, no way for an agent to earn trust over time.

Triage fills that gap: classify every request by identity strength, build trust through behavior, and let economics handle enforcement. Verified humans pass free. Trusted agents pay less. Unknown bots pay full price. Blocked traffic is rejected.

## Install

```bash
npm install triage-middleware
```

```ts
import { Hono } from 'hono'
import { triage, triageDashboard, attachWebSocketToServer } from 'triage-middleware'
import { serve } from '@hono/node-server'

const app = new Hono()

app.use('/api/*', triage({ payTo: '0xYourWallet' }))

triageDashboard(app, {
  rpId: 'rp_your_app_id',
  signingKey: '0xYourSigningKey',
})

const server = serve({ fetch: app.fetch, port: 3000 })
attachWebSocketToServer(server)
```

Every request to `/api/*` is classified, scored, priced, and logged. Dashboard at `/triage`. Real-time events via WebSocket at `/ws`.

## How It Works

```
Request arrives
  → Identity check (World ID? AgentKit? Wallet? Nothing?)
  → Tier assigned (HUMAN / HUMAN_AGENT / ANON_BOT / BLOCKED)
  → Trust score calculated (0-90, four-factor formula)
  → Price determined by trust (higher trust = lower cost)
  → Response headers set (X-Triage-Tier, X-Triage-Trust-Score)
  → 200 OK / 402 Payment Required / 403 Denied
  → WebSocket event emitted to dashboard
```

### The Four Trust Tiers

| Tier | Identity | Access | How it's detected |
|------|----------|--------|-------------------|
| **HUMAN** | World ID verified | Free | Cryptographic proof of unique personhood, verified against World's production API. Only server-verified nullifier hashes are accepted — fake headers are rejected. |
| **HUMAN_AGENT** | AgentKit registered | $0.001/req | On-chain agent registration linked to a World ID, validated via signed AgentKit payload. |
| **ANON_BOT** | Wallet address | $0.003-$0.01/req | x402 payment signature (cryptographic, tied to private key) or self-reported wallet header. |
| **BLOCKED** | Nothing | Denied (403) | No identity, no wallet, no trust. Request never reaches your endpoint. |

### Trust Score Formula

Based on Stanford's EigenTrust algorithm (Kamvar, Schlosser & Garcia-Molina, 2003). Every agent builds a reputation score (0-90) through four factors:

```
TrustScore = Identity(0-50) + Behavior(0-25) + Reputation(0-15) - Risk(0-30)
```

**Identity (0-50 points)** — Who are you?
- World ID proof: 50 pts (cryptographic, Sybil-proof)
- AgentKit registration: 35 pts (on-chain, human-linked)
- Payment-verified wallet: 15 pts (has funds, willing to transact)
- Self-reported address: 5 pts (weak, compensated by pricing)
- Nothing: 0 pts

**Behavior (0-25 points)** — How do you act?
- Payment success rate (0-10): consistent payers score higher
- Request regularity (0-5): steady patterns beat erratic bursts
- Endpoint diversity (0-5): broad API usage beats single-endpoint hammering
- Request pacing (0-5): under 30 RPM = full points, over 60 = zero

**Reputation (0-15 points)** — How long have you been here?
- Account age (0-5): older accounts are more trusted
- Volume (0-5): logarithmic scale, rewards sustained activity
- Consistency (0-5): daily active ratio over total days observed

**Risk Penalty (0-30 points subtracted)**
- Inactivity decay: dormant agents lose trust
- Frequency spikes: sudden traffic surges trigger surge pricing
- Failed payments: payment failures erode trust fast
- Sybil detection: same patterns across multiple addresses = penalty

Higher trust = lower fees. The incentive is economic.

### Dynamic Pricing

Trust score maps directly to x402 price per request:

| Score | Category | Price/Request |
|-------|----------|---------------|
| 80-100 | Highly Trusted | Free |
| 60-79 | Trusted | $0.001 |
| 40-59 | Building Trust | $0.003 |
| 20-39 | Low Trust | $0.007 |
| 1-19 | Minimal Trust | $0.01 |
| 0 | No Trust | Blocked |

### x402 Payment Flow

When a non-human request arrives without payment:

1. Triage returns `402 Payment Required` with a full x402 payment spec
2. The spec includes: USDC amount, wallet address, Base Sepolia network, facilitator URL
3. The agent pays USDC on-chain
4. The agent retries with the payment signature or transaction hash
5. Triage verifies payment on-chain via the x402 facilitator
6. Request proceeds, trust score updates

All payments are real USDC on Base Sepolia, verified on-chain.

### World ID Verification

The middleware auto-mounts World ID endpoints when configured:

- `POST /triage/verify-context` — generates a signed rp_context for the IDKit widget
- `POST /triage/verify-human` — receives the proof, verifies against World's API at `developer.world.org/api/v4/verify`, stores the verified nullifier hash

Only nullifier hashes verified server-side are accepted by the classifier. Sending `x-world-id: verified` as a raw header does nothing — the hash must exist in the verified store.

### AgentKit Integration

AgentKit headers are verified cryptographically:

1. Parse the AgentKit signed payload from request headers
2. Validate the message signature against the agent's on-chain registration
3. Look up the human linkage via AgentBook verifier
4. If a World ID is linked to the agent, classify as HUMAN_AGENT

The schema and signature types are integrated. Full on-chain contract verification is planned for v2.

## The Roaster — Live Demo

**The Roaster** is a live site that demonstrates `triage-middleware` protecting a real API. The entire backend:

```ts
app.use('/api/*', triage({ payTo: '0xYourWallet' }))

triageDashboard(app, { rpId: '...', signingKey: '0x...' })

app.get('/api/roast', (c) => {
  const tier = c.req.header('X-Triage-Tier')
  return c.json({ tier, roast: roasts[tier] })
})

const server = serve({ fetch: app.fetch, port: 3000 })
attachWebSocketToServer(server)
```

Try it:

```bash
# Blocked — no identity
curl https://triage-roaster-production.up.railway.app/api/roast

# Anonymous bot — 402 payment required (real x402 + USDC spec)
curl -H "x-agent-address: 0xBOT1234" https://triage-roaster-production.up.railway.app/api/roast

# Visit the site to verify with World ID and get roasted for free
```

The monitoring dashboard at `/triage` shows every classification event in real-time.

## Monitoring Dashboard

The npm package bundles a monitoring dashboard served at `/triage`:

- **Request Flow** — particle canvas visualization of classified requests
- **Trust Leaderboard** — agents ranked by trust score with tier badges
- **Live Feed** — real-time table of every classification event
- **Stat Cards** — total requests, verified humans, backed agents, revenue

All connected via WebSocket. Updates in real-time as requests flow through the middleware.

## Demo Surfaces

On top of the core middleware, the hackathon build includes several demo applications that show what becomes possible once trust is a primitive:

- **Agent Marketplace** — agents bid on tasks, trust score determines visibility and pricing. In-memory for the hackathon, demonstrates the economic loop.
- **XMTP Bot** — a messaging interface on XMTP's production network that shares a Claude AI processor with the marketplace chat. Works locally; has a known native binding incompatibility with tsx on Railway.
- **Wallet Monitoring** — background agent that polls Base Sepolia via RPC, fetches CoinGecko prices, generates Claude-powered portfolio briefings.
- **Content Monetization** — trust-gated articles where humans read free and agents pay based on tier.

These are demonstrations of what the trust layer enables — not separate products.

## Architecture

```
triage/
├── packages/
│   └── triage-middleware/       Published npm package
│       ├── src/
│       │   ├── index.ts         triage() middleware + triageDashboard()
│       │   ├── classify.ts      4-tier identity classification
│       │   ├── scoring.ts       EigenTrust-based trust formula
│       │   ├── pricing.ts       Trust score → x402 price mapping
│       │   ├── store.ts         Agent profiles + verified humans store
│       │   ├── emitter.ts       WebSocket event broadcasting
│       │   └── types.ts         TypeScript interfaces
│       └── dashboard-dist/      Pre-built monitoring UI
├── server/                      Full demo deployment
│   └── src/
│       ├── index.ts             API server + triage middleware + static files
│       ├── middleware/triage.ts  Classification (server version)
│       ├── trust/store.ts       Trust engine + agent profiles
│       ├── config/pricing.ts    Dual pricing model
│       ├── ai/processor.ts      Shared Claude brain (XMTP + chat)
│       ├── xmtp/bot.ts          XMTP messaging bot
│       ├── payments/transfer.ts Real USDC transfers (Base Sepolia)
│       └── events/emitter.ts    WebSocket broadcasting
├── dashboard/                   React monitoring UI (glass design)
└── test-site/                   "The Roaster" demo app
```
See documentation/ for architecture, env vars, deployment notes, and deeper technical documentation.

## Configuration

```ts
triage({
  payTo: '0xYourWallet',       // Required: USDC payments sent here
  network: 'eip155:84532',     // Optional: chain (default: Base Sepolia)
})

triageDashboard(app, {
  rpId: 'rp_...',              // Optional: enables World ID verification
  signingKey: '0x...',         // Optional: from World developer portal
})
```

## Response Headers

Every response includes classification metadata:

```
X-Triage-Tier: HUMAN_AGENT
X-Triage-Trust-Score: 75
X-Triage-Identity: agentkit
```

## What's Real

| Component | Status | Details |
|-----------|--------|---------|
| World ID verification | Real | Calls developer.world.org, verified nullifier hashes only |
| x402 payments | Real | USDC on Base Sepolia, on-chain verification |
| Trust score formula | Real | Full EigenTrust implementation, four factors |
| Dynamic pricing | Real | Trust → x402 price, automatic |
| Dashboard + WebSocket | Real | Live event broadcasting, particle visualization |
| npm package | Real | Published, installable, functional middleware + dashboard |
| Claude AI | Real | Shared processor for bot + chat |
| USDC transfers | Real | ethers.js on Base Sepolia |
| AgentKit integration | Partial | Signature types integrated, on-chain verification in v2 |
| Marketplace / content | Demo | In-memory, demonstrates the trust layer's capabilities |

## What's Next

**v2 — Stronger Identity**
- AgentKit on-chain contract verification — full HUMAN_AGENT tier with signature validation against deployed contracts
- Agent Signatures — unique generative art per agent derived from wallet address hash, displayed as visual identity on trust cards
- Persistent storage — agent profiles and trust scores survive restarts (PostgreSQL)
- Rate limiting per tier — trust score determines request allowance, not just price

**v3 — Wider Adoption**
- Mainnet deployment — Base mainnet with real USDC
- Multi-chain support — Ethereum, Arbitrum, Solana
- Trust portability — agent reputation follows across APIs using the same middleware
- SDK adapters — Express, Fastify, Next.js (beyond Hono)
- Developer dashboard — analytics, custom pricing curves, allowlists

## Known Limitations

- AgentKit HUMAN_AGENT tier has the payload schema integrated. On-chain contract verification is v2.
- XMTP bot works locally on production XMTP network. Native binding incompatibility with tsx on Railway (`@xmtp/node-bindings` + `import.meta.url`).
- In-memory storage — agent profiles and marketplace data reset on restart.
- Demo headers (`x-world-id`, `x-agentkit-demo`) exist on the main server deployment for demonstration. The npm package verifies server-side only.
- All secrets rotated post-hackathon.

## 60-Second Demo

1. Visit **The Roaster** — click "Get Roasted" — **blocked**, no identity
2. Click "Verify with World ID" — scan QR — **verified human**
3. Click "Get Roasted" again — **free access**, trust score 100
4. Open `/triage` dashboard — see both requests classified live
5. Run `curl -H "x-agent-address: 0xBOT"` — **402**, real USDC payment spec
6. `npm install triage-middleware` — three lines, your API is protected

## Tech Stack

- **Runtime**: Hono, TypeScript, Node.js
- **Blockchain**: Base Sepolia, USDC, x402 protocol
- **Identity**: World ID (`@worldcoin/idkit-server`), AgentKit by World
- **AI**: Claude API via `@anthropic-ai/sdk`
- **Frontend**: React 19, Tailwind CSS 4, Framer Motion
- **Monitoring**: WebSocket broadcasting, canvas particle visualization
- **Infrastructure**: Railway, npm registry

## Academic References

- **EigenTrust** (Kamvar, Schlosser & Garcia-Molina, 2003) — reputation through consistent transactional behavior
- **PeerTrust** (Xiong & Liu, 2004) — multi-dimensional behavioral context factors
- **EigenTrust++** (Fan et al., 2012) — attack-resilient trust management under adversarial conditions

---

<p align="center">
  Built for the <strong>AgentKit Hackathon</strong> by World, Coinbase & XMTP<br/>
  <strong>Ioan Croitor Catargiu</strong> — Athens, 2026
</p>
