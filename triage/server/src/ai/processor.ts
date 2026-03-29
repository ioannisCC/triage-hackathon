import Anthropic from '@anthropic-ai/sdk'
import { getAllAgents } from '../trust/store'
import { getPrice } from '../config/tiers'
import { getSimpleHirePriceBand } from '../config/pricing'

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedAction {
  intent: string
  address?: string
  task?: string
  category?: string
  [key: string]: unknown
}

export interface ProcessResult {
  reply: string
  action: ParsedAction
}

export interface ProcessContext {
  selectedAgent?: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  format?: 'markdown' | 'plain'
}

// ─── System Prompt ───────────────────────────────────────────────────

function buildSystemPrompt(format: 'markdown' | 'plain' = 'plain'): string {
  const agents = getAllAgents()
    .filter(a => a.tier === 'HUMAN_AGENT' || a.tier === 'ANON_BOT')
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 8)

  const agentList = agents.map((a, i) => {
    const fee = getPrice(a.trustScore)
    const band = getSimpleHirePriceBand(a.trustScore)
    return `${i + 1}. ${a.name || a.address.slice(0, 10)} | Trust: ${a.trustScore} | ${a.specialty || 'General'} | ${a.tier === 'HUMAN_AGENT' ? 'Human-Backed' : 'Bot'} | Fee: $${fee.toFixed(4)}/req | Hire: ${band.band} $${band.minPrice}`
  }).join('\n')

  const formattingRules = format === 'markdown'
    ? `FORMATTING RULES:
- No emojis. None. Ever.
- Use markdown for emphasis: **bold** for agent names and numbers.
- Use numbered lists for agent listings.
- Use line breaks for readability.
- Short sentences. No fluff. Professional tone.
- Keep responses under 150 words unless listing agents.`
    : `STRICT FORMATTING RULES:
- No emojis. None. Ever.
- No markdown (no **, no *, no #, no backticks, no ---)
- No bullet points with symbols. Use numbered lists or plain sentences.
- Short sentences. No fluff. No filler phrases.
- Responses must be under 100 words unless listing agents.
- Sound like a professional assistant, not a chatbot.`

  return `You are Triage Bot — the concierge for Triage, a trust infrastructure platform for AI agents.

${formattingRules}

CRITICAL BEHAVIOR:
- When a user wants to hire an agent or monitor something, ALWAYS show available agents with trust scores FIRST. Never auto-hire.
- After showing agents, wait for the user to choose.
- Only hire/start monitoring after the user picks an agent.
- If user says "monitor my wallet 0x..." without choosing an agent, show agents first.

AVAILABLE AGENTS:
${agentList}

CAPABILITIES (use action tags on the FIRST line of every response):

<action>{"intent": "list_agents"}</action> — Show agents ranked by trust
<action>{"intent": "hire_agent", "address": "AGENT_NAME", "task": "description"}</action> — Hire after user chose
  IMPORTANT: "address" = the AGENT NAME the user picked (e.g. "SentinelWatch", "ChainGuard") — NOT a wallet address.
  "task" = what the agent should do, INCLUDING any wallet 0x address the user mentioned.
<action>{"intent": "monitor_wallet", "address": "0x..."}</action> — Start monitoring (address = the WALLET to monitor, a 0x... address)
<action>{"intent": "post_task", "task": "description", "category": "monitoring"}</action> — Post task
<action>{"intent": "list_bounties"}</action> — Show open tasks
<action>{"intent": "stop_monitoring"}</action> — Stop active wallet monitoring
<action>{"intent": "status"}</action> — Show activity
<action>{"intent": "help"}</action> — Explain capabilities
<action>{"intent": "chat"}</action> — General conversation

EXAMPLE INTERACTIONS:

User: "I want to monitor my wallet 0x976a..."
You: <action>{"intent": "list_agents"}</action>
Here are the available monitoring agents, ranked by trust score. Higher trust means more reliable and cheaper.
Which one would you like to hire?

User: "hire SentinelWatch to monitor 0x976aE51C..."
You: <action>{"intent": "hire_agent", "address": "SentinelWatch", "task": "Monitor wallet 0x976aE51C..."}</action>
SentinelWatch has been hired. Monitoring will begin shortly for your wallet.

User: "the first one"
You: <action>{"intent": "hire_agent", "address": "SentinelWatch", "task": "Monitor wallet"}</action>
SentinelWatch has been hired. What would you like them to do?

User: "help"
You: <action>{"intent": "help"}</action>
Triage is trust infrastructure for AI agents. Through this chat you can:
1. Browse agents ranked by trust score
2. Hire an agent to monitor your wallet
3. Post tasks for agents to compete on
4. Check your marketplace activity
Tell me what you need.

CONTEXT:
Triage classifies API traffic by trust tier: Human (World ID verified, free access), Human-Backed Agent (AgentKit verified, discounted), Anonymous Bot (full price), Blocked (denied). Trust scores range 0-100 based on identity, behavior, and on-chain history. Higher trust means lower costs.`
}

// ─── Action Parsing ──────────────────────────────────────────────────

export function parseAction(response: string): ParsedAction {
  const m = response.match(/<action>(.*?)<\/action>/)
  if (m) {
    try { return JSON.parse(m[1]) } catch {}
  }
  return { intent: 'chat' }
}

export function stripActionTags(response: string): string {
  return response.replace(/<action>[\s\S]*?<\/action>/g, '').trim()
}

// ─── Agent Resolution ────────────────────────────────────────────────

export function findAgentByNameOrAddress(identifier: string, originalMessage?: string) {
  const agents = getAllAgents()
  const byAddress = agents.find(a => a.address.toLowerCase() === identifier.toLowerCase())
  if (byAddress) return byAddress
  const byName = agents.find(a =>
    a.name && a.name.toLowerCase().includes(identifier.toLowerCase().replace('0x', ''))
  )
  if (byName) return byName
  const nameLower = identifier.toLowerCase()
  const byContains = agents.find(a => a.name && nameLower.includes(a.name.toLowerCase()))
  if (byContains) return byContains
  if (originalMessage && identifier.startsWith('0x') && identifier.length === 42) {
    const msgLower = originalMessage.toLowerCase()
    const byMsg = agents.find(a => a.name && msgLower.includes(a.name.toLowerCase()))
    if (byMsg) {
      console.log(`[AI] Resolved agent from message context: "${byMsg.name}" (identifier was wallet ${identifier.slice(0, 12)})`)
      return byMsg
    }
  }
  return null
}

// ─── Main Processing ─────────────────────────────────────────────────

export async function processMessage(message: string, context?: ProcessContext): Promise<ProcessResult> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const systemPrompt = buildSystemPrompt(context?.format || 'plain')

    // Build messages array with history if provided
    const history = context?.conversationHistory || []
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history.slice(-10),
      { role: 'user', content: message },
    ]

    // If a selected agent is provided, prepend context
    const finalMessage = context?.selectedAgent
      ? `[User has selected agent: ${context.selectedAgent}. User says:] ${message}`
      : message

    // Replace the last message with the contextualized version
    if (context?.selectedAgent) {
      messages[messages.length - 1] = { role: 'user', content: finalMessage }
    }

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages,
    })

    const full = result.content[0].type === 'text' ? result.content[0].text : ''
    const action = parseAction(full)
    let reply = stripActionTags(full)

    // If Claude only returned an action tag with no text, generate a fallback reply
    if (!reply || reply === full) {
      if (action.intent === 'hire_agent' && action.address) {
        reply = `${action.address} has been hired.${action.task ? ` Task: ${action.task}` : ''}`
      } else if (action.intent === 'list_agents') {
        reply = 'Here are the available agents ranked by trust score.'
      } else if (action.intent === 'monitor_wallet') {
        reply = `Monitoring started for wallet ${action.address || ''}.`
      } else if (action.intent === 'stop_monitoring') {
        reply = 'Monitoring has been stopped.'
      } else {
        reply = full.replace(/<action>[\s\S]*?<\/action>/g, '').trim() || 'Done.'
      }
    }

    console.log(`[AI] Processed: intent=${action.intent} reply="${reply.slice(0, 60)}"`)
    return { reply, action }
  } catch (error) {
    console.error('[AI] Claude API error:', error)
    return {
      reply: "I'm having trouble right now. Try: agents, hire, post, bounties, status, or help.",
      action: { intent: 'chat' },
    }
  }
}
