import { join } from 'path'
import { getOpenBounties, getAllBounties } from '../bounty/store'
import { getAllAgents } from '../trust/store'
import { getPrice } from '../config/tiers'
import { getSimpleHirePriceBand } from '../config/pricing'
import { startMonitoring } from '../agent/monitor'
import { processMessage, findAgentByNameOrAddress, stripActionTags } from '../ai/processor'
import type { ParsedAction } from '../ai/processor'

const API = `http://localhost:${process.env.PORT || 4021}`

let agent: any = null
let humanAddress: string | null = null
let lastConversation: any = null

const conversationHistories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()

// --- API helpers (bot is a CLIENT of its own API) ---

async function apiCreateBounty(params: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API}/api/bounties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

async function apiHireAgent(bountyId: string, agentAddress: string): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${API}/api/bounties/${bountyId}/hire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentAddress }),
  })
  return { ok: res.ok, data: await res.json() }
}

// --- Simple fallback commands (no Claude API key) ---

async function handleSimpleCommand(text: string, senderAddress: string, sendText: (msg: string) => Promise<void>) {
  if (text === 'help' || text === 'hi' || text === 'hello') {
    await sendText('TRIAGE BOT\n\nCommands:\n1. "agents" — Browse agents ranked by trust\n2. "hire <address>" — Hire an agent\n3. "bounties" — See open tasks\n4. "post <task>" — Post a new task\n5. "status" — Your activity\n6. "monitor <address>" — Watch a wallet\n7. "help" — This menu')
    return
  }
  if (text === 'agents' || text === 'browse') {
    const agents = getAllAgents()
      .filter(a => a.tier === 'HUMAN_AGENT' || a.tier === 'ANON_BOT')
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, 5)
    if (!agents.length) { await sendText('No agents yet.'); return }
    let msg = 'AVAILABLE AGENTS\n\n'
    agents.forEach((a, i) => {
      const tier = a.tier === 'HUMAN_AGENT' ? 'Human-Backed' : 'Anonymous Bot'
      const platformFee = getPrice(a.trustScore)
      const hireBand = getSimpleHirePriceBand(a.trustScore)
      msg += `${i + 1}. ${a.name || a.address.slice(0, 10)}\n   ${a.specialty || 'General purpose'}\n   Trust: ${Math.round(a.trustScore)} | ${tier}\n   Platform fee: $${platformFee.toFixed(4)}/req | Hire price: $${hireBand.minPrice}\n\n`
    })
    await sendText(msg); return
  }
  if (text.startsWith('hire ')) {
    const addr = text.replace('hire ', '').trim()
    try {
      const bounty = await apiCreateBounty({
        type: 'HUMAN_HIRES_AGENT', mode: 'DIRECT_HIRE',
        task: 'Hired via XMTP', reward: '$0', category: 'general',
        poster: { address: senderAddress, worldId: 'xmtp-verified', tier: 'HUMAN' },
      })
      const { ok } = await apiHireAgent(bounty.id, addr)
      await sendText(ok ? `Done: Agent ${addr.slice(0, 10)}... hired. Task: ${bounty.id}` : 'Error: Could not hire.')
    } catch { await sendText('Error: Error hiring. Try again.') }
    return
  }
  if (text === 'bounties' || text === 'tasks') {
    const bounties = getOpenBounties()
    if (!bounties.length) { await sendText('No open bounties.'); return }
    let msg = ' OPEN BOUNTIES\n\n'
    bounties.forEach((b, i) => { msg += `${i + 1}. [${b.id}] ${b.task}\n   ${b.reward} | ${b.bids.length} bids\n\n` })
    await sendText(msg); return
  }
  if (text.startsWith('post ')) {
    const task = text.replace('post ', '').trim()
    try {
      const bounty = await apiCreateBounty({
        type: 'HUMAN_HIRES_AGENT', mode: 'COMPETE',
        task, reward: '$0.05', category: 'general',
        poster: { address: senderAddress, worldId: 'xmtp-verified', tier: 'HUMAN' },
      })
      await sendText(`Done: Task posted: ${bounty.id}\n${task}`)
    } catch { await sendText('Error: Error posting task.') }
    return
  }
  if (text.startsWith('monitor ')) {
    const addr = text.replace('monitor ', '').trim()
    try {
      const bounty = await apiCreateBounty({
        type: 'HUMAN_HIRES_AGENT', mode: 'DIRECT_HIRE',
        task: `Monitor wallet ${addr}`, reward: '$0', category: 'monitoring',
        poster: { address: senderAddress, worldId: 'xmtp-verified', tier: 'HUMAN' },
      })
      await apiHireAgent(bounty.id, 'monitoring-agent-0x01')
      startMonitoring(addr, senderAddress)
      await sendText(`Active: Monitoring ${addr.slice(0, 10)}...${addr.slice(-6)}\nYou'll get portfolio briefings when activity is detected.`)
    } catch { await sendText('Error: Error starting monitor.') }
    return
  }
  if (text === 'status') {
    const all = getAllBounties()
    await sendText(` STATUS\nOpen: ${all.filter(b => b.status === 'OPEN').length} | Active: ${all.filter(b => b.status === 'ACTIVE').length} | Done: ${all.filter(b => b.status === 'COMPLETED').length}`)
    return
  }
  await sendText('Type "help" to see commands.')
}

// --- Bot startup ---

export async function startXmtpBot() {
  try {
    const walletKey = process.env.XMTP_WALLET_KEY
    const dbEncKey = process.env.XMTP_DB_ENCRYPTION_KEY
    if (!walletKey || !dbEncKey) { console.log('[XMTP] Missing keys — bot disabled'); return }

    let Agent: any, createUser: any, createSigner: any, getTestUrl: any
    try {
      const sdk = await import('@xmtp/agent-sdk')
      Agent = sdk.Agent; createUser = sdk.createUser; createSigner = sdk.createSigner; getTestUrl = sdk.getTestUrl
    } catch (err) {
      console.warn('[XMTP] Could not load SDK:', (err as Error).message?.slice(0, 100))
      console.log('[XMTP] Bot disabled — server continues without XMTP'); return
    }

    let signer: any
    if (createUser && createSigner) {
      signer = createSigner(createUser(walletKey))
    }

    const xmtpEnv = (process.env.XMTP_ENV as 'dev' | 'production') || 'dev'
    const dbPath = join(process.cwd(), '.xmtp-db')

    if (signer) {
      try {
        const tempAgent = await Agent.create(signer, { env: xmtpEnv, dbPath })
        // Try to revoke old installations to free up slots
        try {
          const inboxState = await tempAgent.client.inboxState(true)
          const installations = inboxState.installations || []
          console.log(`[XMTP] Found ${installations.length} installations`)
          if (installations.length > 1) {
            for (const install of installations.slice(0, -1)) {
              try {
                await tempAgent.client.revokeInstallations([install.id])
                console.log(`[XMTP] Revoked installation: ${String(install.id).slice(0, 16)}...`)
              } catch {}
            }
          }
        } catch {}
        agent = tempAgent
      } catch (revokeErr) {
        console.log('[XMTP] Could not reuse db, trying fresh creation...')
        const fs = await import('fs')
        try { fs.rmSync(dbPath, { recursive: true, force: true }) } catch {}
        try { fs.rmSync(dbPath + '-shm', { force: true }) } catch {}
        try { fs.rmSync(dbPath + '-wal', { force: true }) } catch {}
        agent = await Agent.create(signer, { env: xmtpEnv, dbPath })
      }
    } else if (Agent.createFromEnv) {
      agent = await Agent.createFromEnv()
    } else { throw new Error('No signer method available') }

    agent.on('text', async (ctx: any) => {
      const text = ctx.message.content.trim()
      const message = ctx.message
      const senderAddress = message.senderAddress
        || message.sender?.address
        || message.senderInboxId
        || ctx.conversation?.peerAddress
        || 'unknown'

      if (senderAddress && senderAddress !== 'unknown' && senderAddress !== agent.address) {
        humanAddress = senderAddress
      }
      lastConversation = ctx.conversation
      console.log('[XMTP] Conversation stored for notifications')

      console.log(`[XMTP] Received: "${text}" from ${senderAddress}`)
      console.log('[XMTP] ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY)

      const sendText = async (msg: string) => {
        console.log('[XMTP] Sending response:', msg.slice(0, 80))
        await ctx.conversation.sendText(msg)
        console.log('[XMTP] Response sent successfully')
      }

      try {

      if (!process.env.ANTHROPIC_API_KEY) {
        await handleSimpleCommand(text.toLowerCase(), senderAddress || '', sendText)
        return
      }

      // AI mode — shared processor
      const historyKey = senderAddress || 'default'
      if (!conversationHistories.has(historyKey)) conversationHistories.set(historyKey, [])
      const history = conversationHistories.get(historyKey)!

      const { reply: response, action } = await processMessage(text, { conversationHistory: history })
      console.log('[XMTP] Claude returned intent:', action.intent)
      history.push({ role: 'user', content: text })
      history.push({ role: 'assistant', content: response })
      if (history.length > 20) history.splice(0, history.length - 20)

      console.log(`[XMTP] Processing action: intent=${action.intent} from=${senderAddress?.slice(0, 12) || 'unknown'}`)

      switch (action.intent) {
        case 'list_agents': {
          const agents = getAllAgents()
            .filter(a => a.tier === 'HUMAN_AGENT' || a.tier === 'ANON_BOT')
            .sort((a, b) => b.trustScore - a.trustScore)
            .slice(0, 5)
          let list = '\n\n'
          agents.forEach((a, i) => {
            const tier = a.tier === 'HUMAN_AGENT' ? 'Human-Backed' : 'Anonymous Bot'
            const platformFee = getPrice(a.trustScore)
            const hireBand = getSimpleHirePriceBand(a.trustScore)
            list += `${i + 1}. ${a.name || a.address.slice(0, 10)}\n   ${a.specialty || 'General purpose'}\n   Trust: ${Math.round(a.trustScore)} | ${tier}\n   Platform fee: $${platformFee.toFixed(4)}/req | Hire price: $${hireBand.minPrice}\n\n`
          })
          await sendText(response + list); break
        }

        case 'hire_agent': {
          if (!action.address) { await sendText(response); break }
          const resolvedAgent = findAgentByNameOrAddress(action.address, text)
          const agentAddress = resolvedAgent?.address || action.address
          const hireBand = getSimpleHirePriceBand(resolvedAgent?.trustScore ?? 0)
          console.log(`[XMTP] Hiring agent: ${agentAddress.slice(0, 12)} (resolved from "${action.address}") | trust=${resolvedAgent?.trustScore ?? 0} | hire=$${hireBand.minPrice} | task="${(action.task || 'Hired via XMTP').slice(0, 60)}"`)
          try {
            const bounty = await apiCreateBounty({
              type: 'HUMAN_HIRES_AGENT', mode: 'DIRECT_HIRE',
              task: action.task || 'Hired via XMTP', reward: `$${hireBand.minPrice}`,
              category: action.category || 'monitoring',
              poster: { address: senderAddress || null, worldId: 'xmtp-verified', tier: 'HUMAN' },
            })
            const { ok, data } = await apiHireAgent(bounty.id, agentAddress)
            if (ok) {
              await sendText(response + `\n\nTask ID: ${bounty.id} | Status: Active`)
              // Auto-start monitoring if task contains a wallet address
              const walletMatch = (action.task || text || '').match(/0x[a-fA-F0-9]{40}/)
              if (walletMatch) {
                console.log(`[XMTP] Will start monitoring for wallet ${walletMatch[0]} in 10s (waiting for hire payment to confirm)`)
                setTimeout(() => {
                  try {
                    startMonitoring(walletMatch[0]!, senderAddress || '')
                    console.log(`[MONITOR] Monitoring started for ${walletMatch[0]} via hire flow`)
                  } catch (monErr) {
                    console.error(`[MONITOR] Failed to start monitoring:`, monErr)
                  }
                }, 10000)
              }
            } else {
              await sendText(response || `Error: Could not hire. ${data.error || ''}`)
            }
          } catch (err) {
            console.error('[XMTP] Hire failed:', err)
            await sendText('Error: Error hiring agent. Try again.')
          }
          break
        }

        case 'post_task': {
          try {
            const bounty = await apiCreateBounty({
              type: 'HUMAN_HIRES_AGENT', mode: 'COMPETE',
              task: action.task || text, reward: action.reward || '$0.05',
              category: action.category || 'general',
              poster: { address: senderAddress || null, worldId: 'xmtp-verified', tier: 'HUMAN' },
            })
            await sendText(response + `\n\nBounty ID: ${bounty.id}`)
          } catch (err) {
            console.error('[XMTP] Post task failed:', err)
            await sendText('Error: Error posting task. Try again.')
          }
          break
        }

        case 'list_bounties': {
          const bounties = getOpenBounties()
          let list = '\n\n'
          if (!bounties.length) list += 'No open bounties.'
          else bounties.forEach((b, i) => { list += `${i + 1}. [${b.id}] ${b.task}\n   ${b.reward} | ${b.bids.length} bids | ${b.mode}\n\n` })
          await sendText(response + list); break
        }

        case 'status': {
          const all = getAllBounties()
          await sendText(response + `\n\nOpen: ${all.filter(b => b.status === 'OPEN').length} | Active: ${all.filter(b => b.status === 'ACTIVE').length} | Done: ${all.filter(b => b.status === 'COMPLETED').length}`)
          break
        }

        case 'monitor_wallet': {
          if (action.address) {
            console.log(`[XMTP] Starting wallet monitor: ${action.address}`)
            try {
              const bounty = await apiCreateBounty({
                type: 'HUMAN_HIRES_AGENT', mode: 'DIRECT_HIRE',
                task: `Monitor wallet ${action.address}`, reward: '$0', category: 'monitoring',
                poster: { address: senderAddress || null, worldId: 'xmtp-verified', tier: 'HUMAN' },
              })
              await apiHireAgent(bounty.id, 'monitoring-agent-0x01')
              startMonitoring(action.address, senderAddress || '')
              await sendText(response)
            } catch (err) {
              console.error('[XMTP] Monitor failed:', err)
              await sendText('Error: Error starting monitor. Try again.')
            }
          } else {
            await sendText(response || 'Please provide a wallet address to monitor.')
          }
          break
        }

        case 'stop_monitoring': {
          try {
            const { stopMonitoring } = await import('../agent/monitor')
            stopMonitoring()
            console.log(`[XMTP] Monitoring stopped by user request`)
            await sendText(response || 'Monitoring has been stopped.')
          } catch (err) {
            console.error('[XMTP] Stop monitoring failed:', err)
            await sendText('Error stopping monitoring.')
          }
          break
        }

        default: await sendText(response); break
      }

      } catch (err) {
        console.error('[XMTP] Handler error:', err)
        try { await ctx.conversation.sendText('Error processing message.') } catch {}
      }
    })

    agent.on('start', () => {
      console.log(`[XMTP] Bot online: ${agent.address}`)
      if (getTestUrl) { try { console.log(`[XMTP] Test URL: ${getTestUrl(agent.client)}`) } catch {} }

      // World App XMTP requires Orb verification for inbox creation
      // Demo uses Coinbase Wallet instead — works on production XMTP
    })

    await agent.start()
  } catch (error) {
    console.error('[XMTP] Failed to start bot:', (error as Error).message)
    console.log('[XMTP] Bot disabled — server continues without XMTP')
  }
}

export async function notifyHuman(message: string) {
  if (!agent) { console.log('[XMTP] Cannot notify — no agent'); return }
  try {
    if (lastConversation) {
      await lastConversation.sendText(message)
      console.log('[XMTP] Notified via stored conversation')
      return
    }
    if (humanAddress) {
      const conversation = await agent.createDmWithAddress(humanAddress)
      await conversation.sendText(message)
      console.log('[XMTP] Notified via address')
      return
    }
    console.log('[XMTP] Cannot notify — no conversation or address')
  } catch (error) {
    console.error('[XMTP] Notify failed:', (error as Error).message)
  }
}

export async function initiateWorldAppChat(address: string) {
  if (!agent) { console.log('[XMTP] Cannot initiate — no agent'); return }
  try {
    const conversation = await agent.createDmWithAddress(address)
    await conversation.sendText('Triage Bot is online. You can hire agents, monitor wallets, and manage tasks through this chat. Type "help" to see commands.')
    lastConversation = conversation
    humanAddress = address
    console.log(`[XMTP] Initiated chat with World App user: ${address}`)
  } catch (error) {
    console.error('[XMTP] Failed to initiate World App chat:', (error as Error).message)
  }
}

export function getBotAddress(): string | null { return agent?.address || null }

export function getBotTestUrl(): string | null {
  if (!agent) return null
  try {
    const { getTestUrl } = require('@xmtp/agent-sdk')
    return getTestUrl(agent.client)
  } catch { return null }
}
