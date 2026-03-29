export interface Article {
  id: string
  title: string
  author: string
  category: string
  summary: string
  content: string
  publishedAt: string
}

export const articles: Article[] = [
  {
    id: '1',
    title: 'The Rise of AI Agents in Financial Markets',
    author: 'Maria Chen',
    category: 'Technology',
    summary: 'How autonomous AI agents are reshaping trades, portfolios, and risk — and why trust classification is becoming essential.',
    content: 'Autonomous AI agents are reshaping how trades are executed, portfolios managed, and risk assessed. In Q1 2026, agent-initiated transactions accounted for 34% of all API calls to major financial data providers. The challenge: distinguishing legitimate algorithmic traders from data scrapers. Trust classification systems like Triage are emerging as the standard solution, enabling APIs to price access dynamically based on verified identity and behavioral reputation. The implications are massive — APIs that once blocked all bot traffic are now earning revenue from it, while verified humans continue to access data freely.',
    publishedAt: '2026-03-25',
  },
  {
    id: '2',
    title: 'Why Proof of Humanity Changes Everything for Content Creators',
    author: 'James Okafor',
    category: 'Creator Economy',
    summary: 'Free access for verified humans, paid access for AI agents — the new creator monetization model.',
    content: 'For years, content creators have battled bots inflating metrics and scraping content. World ID verification offers a radical solution: free access for verified humans, paid access for AI agents. A food blogger using this model reported that agent traffic now generates $340/month in micropayments — revenue that previously went to zero because bots consumed content without paying. The key insight: human readers are the community, agent readers are the revenue stream. With Triage middleware, any creator can implement this in three lines of code.',
    publishedAt: '2026-03-24',
  },
  {
    id: '3',
    title: 'Building Trust in the Agent Economy: Lessons from EigenTrust',
    author: 'Dr. Sarah Kim',
    category: 'Research',
    summary: "Stanford's 2003 reputation algorithm finds new life in AI agent trust scoring.",
    content: "Stanford's EigenTrust algorithm, originally designed for P2P file-sharing networks, is finding new life in AI agent reputation systems. The core principle — trust propagates from pre-trusted seeds through consistent good behavior — maps directly to the agent economy. World ID verified humans serve as trust anchors. Their delegated agents inherit baseline trust via AgentKit. Anonymous agents must earn trust through sustained, consistent API interactions. The math hasn't changed since 2003. The application has. Modern implementations add behavioral analysis, on-chain wallet history, and surge pricing to create comprehensive trust scores.",
    publishedAt: '2026-03-23',
  },
  {
    id: '4',
    title: 'Micropayments Are Finally Working (Thanks to AI Agents)',
    author: 'Alex Rivera',
    category: 'Payments',
    summary: "The x402 protocol succeeds where decades of micropayment experiments failed — because agents don't experience friction.",
    content: "The x402 protocol has achieved what decades of micropayment experiments could not: making sub-cent payments viable at scale. The secret ingredient isn't the technology — it's the customer. AI agents don't experience payment friction. They don't abandon carts. They don't need checkout flows. An agent hits a 402 response, signs a USDC payment, and retries — all in under 200 milliseconds. Human micropayment systems failed because humans hate paying. Agent micropayment systems work because agents don't care. This is why x402 adoption is growing exponentially among API providers.",
    publishedAt: '2026-03-22',
  },
]
