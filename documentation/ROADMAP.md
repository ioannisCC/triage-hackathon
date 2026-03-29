# Roadmap

## Current State (Hackathon v1)

What exists and works today:

- 4-tier classification: World ID, AgentKit, x402 wallet, blocked
- EigenTrust-based trust scoring (identity + behavior + reputation - risk)
- Dynamic x402 pricing (trust → USDC price per request)
- Published npm package (`triage-middleware`) with bundled dashboard
- Real USDC payments on Base Sepolia
- Real World ID verification (server-verified nullifier hashes)
- Real-time WebSocket monitoring dashboard
- Demo site (The Roaster) demonstrating the full flow
- XMTP bot (works locally, Railway native binding issue)

## v2 — Stronger Identity

### AgentKit On-Chain Contract Verification
Full HUMAN_AGENT tier with signature validation against deployed AgentBook contracts on Base. Currently uses SDK-level verification — v2 adds direct contract calls to verify agent registration and human linkage on-chain.

### Agent Signatures
Unique generative art per agent derived from wallet address hash. Displayed as visual identity on trust leaderboard cards and agent profiles. Think ENS avatars but for trust — a visual shorthand for "this agent has been verified."

### Persistent Storage
PostgreSQL for agent profiles, trust scores, verified humans, and marketplace data. Scores survive restarts. Historical trust trajectories tracked over time.

### Rate Limiting Per Tier
Trust score determines not just price but request allowance:
- HUMAN: unlimited
- HUMAN_AGENT (trust > 70): 1000 req/min
- ANON_BOT (trust > 40): 100 req/min
- ANON_BOT (trust < 40): 20 req/min
- BLOCKED: 0

### Trust Score Webhooks
Developers register webhooks for trust events:
- Agent crosses tier threshold
- Trust score drops below minimum
- New agent first seen
- Sybil detection triggered

## v3 — Wider Adoption

### Mainnet Deployment
Base mainnet with real USDC. Escrow contract for marketplace payments. Audited payment flow.

### Multi-Chain Support
- Ethereum mainnet
- Arbitrum
- Base
- Solana (via different payment adapter)

### Trust Portability
Agent reputation follows across APIs using the same middleware. An agent that builds trust on API-A starts with credit on API-B. Federated trust scores anchored to wallet address.

### SDK Adapters
Beyond Hono:
- Express adapter
- Fastify adapter
- Next.js middleware
- Cloudflare Workers adapter

### Developer Dashboard
SaaS-style analytics:
- Traffic by tier over time
- Revenue from agent payments
- Custom pricing curves (not just linear tiers)
- Allowlists and blocklists
- API key management

### Custom Pricing Curves
Developers define their own trust-to-price mapping:
```typescript
triage({
  payTo: '0x...',
  pricing: (trustScore) => {
    if (trustScore > 80) return 0
    return 0.01 * (1 - trustScore / 100)
  }
})
```

## Non-Goals

These are explicitly out of scope for Triage:

- **Authentication/sessions** — Triage classifies, it doesn't auth. Use your own auth layer.
- **Content moderation** — Triage doesn't inspect request bodies. It classifies the caller, not the content.
- **Agent orchestration** — Triage doesn't manage what agents do. It manages who agents are and what they pay.
- **Token/NFT mechanics** — Trust is computed, not tokenized. No governance tokens, no staking.
