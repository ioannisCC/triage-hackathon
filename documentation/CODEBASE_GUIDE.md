# Codebase Guide

## File-by-File Reference

### Server (`triage/server/src/`)

#### index.ts (691 lines)
Main entry point. Initializes everything.

**Key sections:**
- Lines 1-50: Imports, CORS, constants (chain ID, USDC contract, World App ID)
- Lines 51-100: World ID endpoints (`/api/idkit/rp-context`, `/api/verify-human`)
- Lines 101-165: Public API routes (`/api/agents`, `/api/health`, `/api/marketplace/stats`)
- Lines 166-275: Chat endpoint (`/api/chat` — shared Claude processor)
- Lines 276-420: Marketplace routes (bounties, hire, bid, pick)
- Lines 421-590: Triage middleware (classification → pricing → 402/403/200 → WebSocket)
- Lines 591-630: Protected routes (`/api/data`, `/api/content/:id`, `/api/agent/report`)
- Lines 631-660: Production static file serving (dashboard)
- Lines 661-695: Server startup (HTTP + WebSocket)

**Notable patterns:**
- `isProd` flag switches between dev (separate WS port) and prod (HTTP upgrade)
- Static file handler uses `process.cwd() + '../dashboard/dist'` (relative to WORKDIR)
- XMTP bot starts non-blocking — server continues if bot fails

#### ai/processor.ts (210 lines)
Shared Claude AI brain. Used by both XMTP bot and dashboard chat.

**Exports:**
- `processMessage(message, context?)` → `{ reply, action }`
- `parseAction(response)` → extracts `<action>JSON</action>` tags
- `stripActionTags(response)` → removes tags from visible text
- `findAgentByNameOrAddress(identifier, originalMessage?)` → resolves agent

**How it works:**
1. `buildSystemPrompt(format)` — dynamically generates prompt with live agent data
2. Calls Claude `claude-sonnet-4-6` with 500 max tokens
3. Parses intent from `<action>` tag: hire_agent, list_agents, monitor_wallet, etc.
4. Returns clean reply (tags stripped) + parsed action

**Format parameter:**
- `'plain'` (default, for XMTP): no markdown, no emojis, plain text
- `'markdown'` (for dashboard): bold, numbered lists, line breaks

#### xmtp/bot.ts (401 lines)
XMTP messaging bot on World App.

**Key functions:**
- `startXmtpBot()` — initializes XMTP agent SDK, revokes old installations
- `notifyHuman(text)` — sends DM to last known human address
- `getBotAddress()` — returns bot's XMTP address
- `findAgentByNameOrAddress()` — now imported from ai/processor.ts

**Action handlers (lines 215-380):**
Each Claude intent maps to an action:
- `hire_agent` → create bounty, direct hire, transfer reward, start monitoring
- `monitor_wallet` → create bounty, hire, start monitoring with 10s delay
- `stop_monitoring` → calls `stopMonitoring()` from monitor.ts
- `list_agents` → fetches from /api/agents, formats for XMTP
- `post_task` → creates COMPETE bounty
- `list_bounties` → fetches open bounties

**Fallback mode (lines 40-110):**
If no ANTHROPIC_API_KEY, uses simple command parsing instead of Claude.

#### trust/store.ts (283 lines)
Agent profile storage and trust scoring engine.

**Data structure:**
```typescript
interface AgentProfile {
  address, tier, trustScore, totalRequests, successfulRequests,
  failedPayments, firstSeen, lastSeen, isHumanBacked, humanId,
  name?, specialty?, requestTimestamps[], endpointsAccessed: Set,
  recentRequestsPerMinute, addressesFromSameIp: Set, daysActive: Set
}
```

**Key functions:**
- `getOrCreateAgent(address, tier, humanId)` — creates or upgrades agent
- `recordRequest(address, tier, success, humanId, endpoint, clientIp)` — full tracking
- `calculateTrustScore(agent)` — the formula (see TRUST_SCORING.md)
- `seedDemoAgents()` — 8 pre-built agents with realistic profiles

**Demo trust floors:**
SentinelWatch, ChainGuard, PortfolioAI always maintain trust >= 75 via:
```typescript
if (DEMO_TRUST_FLOOR_AGENTS.includes(agent.name)) return Math.max(75, score)
```

#### middleware/triage.ts (110 lines)
4-tier identity classification.

**Classification order (strongest to weakest):**
1. `x-world-id: verified` → HUMAN (demo fallback, main server only)
2. AgentKit header → verify signature → HUMAN_AGENT
3. `x-agentkit-demo: human-backed` → HUMAN_AGENT (demo fallback)
4. PAYMENT-SIGNATURE → extract wallet → ANON_BOT
5. `x-agent-address` header → ANON_BOT (weak)
6. Nothing → BLOCKED

#### config/pricing.ts (149 lines)
Dual pricing model.

**Platform fee** (agent pays Triage):
- `calculatePlatformFee({ trustScore, baseFee, trafficMultiplier, categoryMultiplier })`
- Trust discount: `D(T) = 1.8 - 1.4 * (T/100)`
- `getSimplePlatformFee(trustScore)` — tier-based lookup (used in production)

**Hire price** (human pays agent):
- `calculateHirePrice({ qualityScore, basePrice, specializationMultiplier, urgencyMultiplier, successRate })`
- Quality multiplier: `M(Q) = 0.7 + 1.1 * (Q/100)`
- `getSimpleHirePriceBand(trustScore)` — Elite/Pro/Starter bands

#### payments/transfer.ts (47 lines)
USDC reward transfers on Base Sepolia.

```typescript
transferReward(toAddress: string, amountUsd: number): Promise<string | null>
```

- Checks `ENABLE_REAL_REWARDS` env var
- Uses `AGENT_PRIVATE_KEY` wallet as escrow
- Transfers via ethers.js Contract.transfer()
- Returns tx hash or null

#### agent/monitor.ts (301 lines)
Wallet monitoring agent.

**Functions:**
- `startMonitoring(walletAddress, humanAddress)` — adds to polling loop
- `stopMonitoring(address?)` — removes from polling (no address = stop all)
- `checkForActivity(wallet)` — RPC balance + tx count check
- `generateBriefing(wallet, balance, change, txCount, block)` — Claude or template
- `reportThroughTriage(wallet, briefing)` — POST to /api/agent/report with x402 payment

**Polling:** Every 5 seconds. 30-second briefing cooldown to prevent duplicates.

#### bounty/store.ts (150 lines)
Marketplace bounty management. In-memory Map.

**Types:** BountyType (HUMAN_HIRES_AGENT, AGENT_NEEDS_HUMAN), BountyMode (COMPETE, DIRECT_HIRE)

**Functions:** createBounty, addBid, pickWinner, directHire, getMarketplaceStats

#### events/emitter.ts (69 lines)
WebSocket event broadcasting.

**Two modes:**
- `startWebSocketServer(port)` — standalone (dev)
- `attachWebSocketToServer(server)` — HTTP upgrade on `/ws` (prod)

Both call `wireConnections()` which tracks clients in a Set.

### npm Package (`packages/triage-middleware/src/`)

Same logic as server but packaged for npm. Key differences:
- `classify.ts` — no demo fallback headers, uses `isVerifiedHuman()` store check
- `index.ts` — exports `triage()` middleware + `triageDashboard()` + `attachWebSocketToServer()`
- `store.ts` — includes `verifiedHumans` Set for World ID nullifier hashes
- `dashboard-dist/` — pre-built React monitoring dashboard (built from `dashboard-src/`)

### Dashboard (`triage/dashboard/src/`)

React 19 + Tailwind CSS 4 + Framer Motion. Liquid glass design.

**Key components:**
- `MarketplaceTab.tsx` (419 lines) — glass agent cards + chat interface
- `RequestFlow.tsx` (212 lines) — canvas particle visualization
- `TrustLeaderboard.tsx` — agent rankings with live polling
- `LiveFeed.tsx` — real-time event table
- `StatCard.tsx` — animated split-flap numbers
- `Donut.tsx` — tier distribution chart
- `WorldIDButton.tsx` — IDKitRequestWidget integration
- `config.ts` — auto-detecting API/WS URLs

### Test Site (`triage/test-site/`)

**server.ts** — Imports triage-middleware from npm, mounts middleware + dashboard + World ID. Serves built React frontend from `dist/`. Single-port deployment.

**src/App.tsx** — MeshGradient background, World ID verification (IDKitRequestWidget), "Get Roasted" button with 200/402/403 handling, curl commands, code examples.

## Key Design Decisions

1. **In-memory everything** — Speed over persistence. Hackathon trade-off.
2. **Demo headers on main server** — Allows quick demos without World App. npm package is strict.
3. **Shared AI processor** — One Claude brain, two interfaces (XMTP + dashboard).
4. **Trust floors for demo agents** — Consistent demo experience > realistic scoring.
5. **10s delay between hire payment and monitoring** — Prevents nonce collision on shared wallet.
6. **x402 for pricing, not auth** — Classification is identity-based; pricing is economic enforcement on top.
