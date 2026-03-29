# Limitations

## Hackathon Constraints

### 1. Temporary Demo Credentials
Some demo/testnet credentials are temporarily embedded in the hackathon deployment and will be rotated post-hackathon.

### 2. In-Memory Storage
All data (agent profiles, bounties, verified humans, monitored wallets) is stored in JavaScript Maps/Sets. Restarting the server loses everything. Production needs PostgreSQL or similar.

### 3. No Rate Limiting
No request rate limiting at the HTTP level. The trust formula penalizes high-frequency agents, but there's no hard cap preventing DoS.

### 4. XMTP Native Binding on Railway
`@xmtp/node-bindings` uses `import.meta.url` in its loader, which `tsx`'s CJS require hook cannot handle. The bot may fail to start on Railway depending on the environment.

**Workaround**: Server catches the error and continues without XMTP. Bot is non-blocking.

## Demo-Only Shortcuts

### 5. Demo Header Bypass (Main Server Only)
The main demo server includes optional demo headers for reliable hackathon flows. The published npm package does not include these shortcuts and uses server-verified identity checks only.

### 6. Low-Trust Anonymous Header Path
`x-agent-address` is accepted as a low-trust anonymous identity signal on the demo server. This intentionally maps to the lowest pricing tier and is economically discouraged.

## Production Follow-Ups

### 7. AgentKit On-Chain Verification
AgentKit payload schema and signature types are integrated. Full on-chain contract verification against deployed AgentBook contracts is planned for v2.

### 8. Nonce Collision Risk
The hire reward transfer and monitoring agent's x402 payment both use the same `AGENT_PRIVATE_KEY` wallet. Simultaneous transactions can collide. Mitigated with a 10-second delay between hire payment and monitoring start.

### 9. CORS Open
`origin: '*'` on the main server. Acceptable for a public API with no session cookies, but should be restricted in production.

## By Design

### 10. Trust Score Cap at 90
Maximum trust is 90, not 100. This is intentional — perfect trust is unattainable. Even the most trusted agent carries some uncertainty.

### 11. Demo Agent Trust Floors
Sentinel Watch, ChainGuard, and PortfolioAI maintain a minimum trust of 75 to ensure consistent demo behavior. In production, no agent would have a floor.

### 12. x402 Facilitator Dependency
Payment verification depends on `https://x402.org/facilitator/verify`. If the facilitator is down, non-human requests are blocked. This is correct behavior — fail closed, not open.