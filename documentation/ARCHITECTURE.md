# Architecture

## System Overview

Triage is structured as four packages in one monorepo:

```
triage-hackathon/
├── triage/
│   ├── packages/triage-middleware/   → npm package (the product)
│   ├── server/                       → full demo deployment
│   ├── dashboard/                    → React monitoring UI
│   └── test-site/                    → "The Roaster" demo app
├── docs/                             → this documentation
├── Dockerfile                        → main server Railway deploy
└── README.md
```

## Package Relationships

```
triage-middleware (npm)         ← the product
    ├── classify.ts            ← identity classification
    ├── scoring.ts             ← trust formula
    ├── pricing.ts             ← trust → price
    ├── store.ts               ← agent profiles + verified humans
    ├── emitter.ts             ← WebSocket events
    ├── types.ts               ← TypeScript interfaces
    ├── index.ts               ← middleware + dashboard mount
    └── dashboard-dist/        ← pre-built monitoring UI

server/                        ← uses server's own triage.ts (same logic)
    ├── index.ts               ← Hono API, all routes
    ├── middleware/triage.ts    ← classification (server version)
    ├── trust/store.ts         ← trust engine (server version)
    ├── config/pricing.ts      ← pricing (server version)
    ├── ai/processor.ts        ← shared Claude brain
    ├── xmtp/bot.ts            ← XMTP messaging
    ├── agent/monitor.ts       ← wallet monitoring
    ├── bounty/store.ts        ← marketplace
    ├── payments/transfer.ts   ← USDC transfers
    └── events/emitter.ts      ← WebSocket

test-site/                     ← imports triage-middleware from npm
    ├── server.ts              ← Hono + triage() + triageDashboard()
    └── src/App.tsx             ← React frontend
```

## Request Flow

```
Client Request
  │
  ▼
CORS middleware (origin: *)
  │
  ▼
Triage Classification Middleware
  ├── Check x-world-id header → lookup in verifiedHumans Set
  ├── Check AgentKit header → verify signature + AgentBook lookup
  ├── Check payment-signature → extract wallet from x402 payload
  ├── Check x-payment-tx → accept on-chain tx hash
  ├── Check x-agent-address → weak self-report (ANON_BOT)
  └── Nothing → BLOCKED
  │
  ▼
Trust Score Calculation
  ├── identityScore(tier)      → 0-50
  ├── behaviorScore(agent)     → 0-25
  ├── reputationScore(agent)   → 0-15
  └── riskPenalty(agent)       → 0-30
  │
  ▼
Price Determination
  ├── getPrice(trustScore) → $0.00 to $0.01
  └── Return 402 with x402 spec if unpaid
  │
  ▼
Response Headers Set
  ├── X-Triage-Tier: HUMAN_AGENT
  ├── X-Triage-Trust-Score: 75
  └── X-Triage-Identity: agentkit
  │
  ▼
WebSocket Event Emitted → Dashboard
  │
  ▼
Route Handler (your API code)
```

## Data Flow

All data is in-memory (Maps and Sets). No database.

```
Agent Profiles:  Map<address, AgentProfile>
Verified Humans: Set<nullifierHash>
Bounties:        Map<bountyId, Bounty>
Monitored Wallets: Map<address, MonitoredWallet>
WebSocket Clients: Set<WebSocket>
Conversation Histories: Map<senderAddress, Message[]>
```

## WebSocket Architecture

Two modes:

**Development**: Standalone WebSocket server on port 4022 (or configured wsPort)
```
startWebSocketServer(4022)
```

**Production**: HTTP upgrade on `/ws` path, same port as API
```
const server = serve({ fetch: app.fetch, port })
attachWebSocketToServer(server)
```

Events are broadcast to all connected clients as JSON:
```json
{
  "id": "uuid",
  "timestamp": 1711700000000,
  "tier": "HUMAN_AGENT",
  "color": "#4a91f7",
  "agentAddress": "0x1111...1001",
  "trustScore": 75,
  "priceCharged": 0.001,
  "humanId": null,
  "requestPath": "/api/data"
}
```

## AI Architecture

Shared Claude processor (`ai/processor.ts`) serves both XMTP bot and dashboard chat:

```
processMessage(message, context?)
  ├── Build system prompt with live agent data
  ├── Call Claude (claude-sonnet-4-6, max 500 tokens)
  ├── Parse <action> tag from response
  ├── Strip action tags from visible reply
  └── Return { reply, action }
```

Context supports:
- `conversationHistory` — multi-turn memory
- `selectedAgent` — pre-selected agent name
- `format` — 'plain' (XMTP) or 'markdown' (dashboard)

## Payment Architecture

Two payment mechanisms:

**x402 Protocol** (agent → platform):
1. Middleware returns 402 with payment spec
2. Agent pays USDC on Base Sepolia
3. Agent retries with PAYMENT-SIGNATURE or x-payment-tx header
4. Middleware verifies via x402 facilitator or accepts tx hash

**Hire Rewards** (platform → agent):
1. Human hires agent via marketplace
2. Server calls `transferReward(agentAddress, amount)`
3. ethers.js transfers USDC from escrow wallet
4. Gated by `ENABLE_REAL_REWARDS` env var
