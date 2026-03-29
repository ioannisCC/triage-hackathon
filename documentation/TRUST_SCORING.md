# Trust Scoring — Deep Dive

## Academic Foundation

The trust formula draws from three peer-reviewed reputation systems:

- **EigenTrust** (Kamvar, Schlosser & Garcia-Molina, 2003) — pre-trusted peers as trust anchors, iterative reputation convergence
- **PeerTrust** (Xiong & Liu, 2004) — multi-dimensional behavioral context (transaction success, feedback, community)
- **EigenTrust++** (Fan et al., 2012) — attack-resilient trust with active threat detection

## The Formula

```
TrustScore = Identity(0-50) + Behavior(0-25) + Reputation(0-15) - Risk(0-30)
Clamped to: [0, 90]
```

Maximum possible: 90 (not 100 — this is intentional; perfect trust is unattainable).

## Component 1: Identity Score (0-50)

Pre-trusted peers form the trust anchors. Stronger identity = more trust.

```typescript
function identityScore(agent: AgentProfile): number {
  switch (agent.tier) {
    case 'HUMAN':       return 50  // World ID — Sybil-proof
    case 'HUMAN_AGENT': return 35  // AgentKit — on-chain + human-linked
    case 'ANON_BOT':    return 15  // wallet — has funds
    case 'BLOCKED':     return 0   // nothing
  }
}
```

This is the largest single factor. A World ID verified human starts at 50/90 before any behavior.

## Component 2: Behavior Score (0-25)

Multi-dimensional behavioral context. Four sub-scores:

### Payment Success Rate (0-10)
```typescript
const successRate = agent.successfulRequests / agent.totalRequests
const paymentScore = Math.min(10, successRate * 10)
```
- 100% success → 10 pts
- 85% success → 8.5 pts
- 50% success → 5 pts

### Request Regularity (0-5)
```typescript
// Compute coefficient of variation of inter-request intervals
const intervals = requestTimestamps.map((t, i) => t - requestTimestamps[i-1])
const mean = avg(intervals)
const variance = avg(intervals.map(v => (v - mean) ** 2))
const coeffOfVariation = mean > 0 ? sqrt(variance) / mean : 0
const regularityScore = Math.min(5, coeffOfVariation * 5)
```
- Steady, regular requests → high score
- Erratic bursts → lower score
- Note: some variation is expected and rewarded (not penalized)

### Endpoint Diversity (0-5)
```typescript
const diversityScore = Math.min(5, agent.endpointsAccessed.size / 3 * 5)
```
- 3+ unique endpoints → 5 pts (full)
- 1 endpoint → 1.67 pts
- Single-endpoint hammering scores low

### Request Pacing (0-5)
```typescript
const rpm = agent.recentRequestsPerMinute
let pacingScore = 5
if (rpm > 30) pacingScore = 2
if (rpm > 60) pacingScore = 0
```
- Under 30 RPM → 5 pts (normal)
- 30-60 RPM → 2 pts (elevated)
- Over 60 RPM → 0 pts (aggressive)

## Component 3: Reputation Score (0-15)

Trust builds over time through sustained participation.

### Account Age (0-5)
```typescript
const daysSinceFirst = (now - agent.firstSeen) / (86400000)
const ageScore = Math.min(5, daysSinceFirst * 0.5)
```
- 10+ days → full 5 pts
- 1 day → 0.5 pts
- New → 0 pts

### Request Volume (0-5)
```typescript
const volumeScore = Math.min(5, Math.log10(agent.totalRequests) * 2.5)
```
- 100 requests → log10(100) * 2.5 = 5 pts (full)
- 10 requests → log10(10) * 2.5 = 2.5 pts
- 1 request → 0 pts
- Logarithmic: rewards early activity, diminishes at scale

### Daily Consistency (0-5)
```typescript
const totalDays = Math.max(1, daysSinceFirst)
const consistencyScore = Math.min(5, (agent.daysActive.size / totalDays) * 5)
```
- Active every day → 5 pts
- Active 3 out of 7 days → 2.14 pts
- One-time visitor → low

## Component 4: Risk Penalty (0-30 subtracted)

Active threat detection. These subtract from the total.

### Inactivity Decay (0-5)
```typescript
const hoursInactive = (now - agent.lastSeen) / 3600000
const inactivityPenalty = Math.min(5, hoursInactive * 0.5)
```
- 10+ hours dormant → 5 pts penalty
- Just seen → 0 penalty

### Frequency Spike (0-10)
```typescript
if (rpm > 50) frequencyPenalty = 10
else if (rpm > 20) frequencyPenalty = 5
else if (rpm > 10) frequencyPenalty = 2
```
- This is surge pricing in trust form
- Sudden traffic spikes trigger high penalties

### Failed Payments (0-5)
```typescript
const failurePenalty = Math.min(5, agent.failedPayments * 2)
```
- 3+ failures → 5 pts penalty (max)
- Each failure = 2 pts

### Sybil Detection (0-5)
```typescript
const sybilPenalty = Math.min(5, Math.max(0, (agent.addressesFromSameIp.size - 1) * 2.5))
```
- 1 address per IP → 0 penalty
- 2 addresses → 2.5 pts
- 3+ addresses → 5 pts (max)

## Example Calculations

### New Human (World ID verified, first request)
```
Identity: 50 (HUMAN)
Behavior: 0 (no history)
Reputation: 0 (brand new)
Risk: 0 (no red flags)
Total: 50 → Price: Free
```

### Established Agent (7 days, 200 requests, 95% success)
```
Identity: 35 (HUMAN_AGENT)
Behavior: 9.5 + 3 + 5 + 5 = 22.5
Reputation: 3.5 + 5 + 4 = 12.5
Risk: 0
Total: 70 → Price: $0.001/req
```

### New Bot (wallet only, 5 requests)
```
Identity: 15 (ANON_BOT)
Behavior: 7.5 + 2 + 1 + 5 = 15.5
Reputation: 0 + 1.7 + 2 = 3.7
Risk: 0
Total: 34.2 → Price: $0.007/req
```

### Suspicious Bot (50 RPM, 3 failures, multiple IPs)
```
Identity: 15 (ANON_BOT)
Behavior: 5 + 2 + 3 + 0 = 10
Reputation: 1 + 3 + 2 = 6
Risk: 0 + 10 + 5 + 5 = 20
Total: 11 → Price: $0.01/req
```

## Trust → Price Mapping

| Score | Category | Price | Rationale |
|-------|----------|-------|-----------|
| 80-100 | Highly Trusted | Free | Proven identity + excellent behavior |
| 60-79 | Trusted | $0.001 | Solid identity + good track record |
| 40-59 | Building Trust | $0.003 | Moderate identity, still earning |
| 20-39 | Low Trust | $0.007 | Weak identity, limited history |
| 1-19 | Minimal Trust | $0.01 | Barely identified, high risk |
| 0 | Blocked | Denied | No identity, no trust |

## Demo Agent Trust Floors

For hackathon demo consistency, three agents maintain a minimum trust of 75:
- SentinelWatch, ChainGuard, PortfolioAI

This ensures they always demonstrate Elite-tier pricing. In production, no floors exist.
