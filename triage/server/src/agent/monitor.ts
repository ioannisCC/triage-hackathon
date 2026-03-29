import Anthropic from '@anthropic-ai/sdk'
import { ethers } from 'ethers'
import { notifyHuman } from '../xmtp/bot'

const BASE_SEPOLIA_RPC = 'https://base-sepolia-rpc.publicnode.com'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'
const USDC_CONTRACT = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const USDC_DECIMALS = 6

interface MonitoredWallet {
  address: string
  humanAddress: string
  startedAt: number
  lastBlock: number
  prevBalance?: number
  prevTxCount?: number
}

const monitoredWallets = new Map<string, MonitoredWallet>()
let pollingInterval: ReturnType<typeof setInterval> | null = null
let lastBriefingTime = 0
const BRIEFING_COOLDOWN_MS = 30000

function getAgentWallet(): ethers.Wallet | null {
  const key = process.env.AGENT_PRIVATE_KEY
  if (!key) return null
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC)
  return new ethers.Wallet(key, provider)
}

// Report through Triage with x402 payment flow
async function reportThroughTriage(body: Record<string, unknown>) {
  const url = `http://localhost:${process.env.PORT || 4021}/api/agent/report`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-agentkit-demo': 'human-backed',
    'x-agent-address': process.env.AGENT_ADDRESS || 'monitoring-agent-0x01',
  }

  try {
    // First request — will get 402
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (res.status === 402) {
      const paymentDetails = await res.json() as any
      console.log('[MONITOR] Got 402 — attempting payment...')

      const wallet = getAgentWallet()
      if (!wallet) {
        console.log('[MONITOR] No agent wallet — cannot pay. Report still classified.')
        return
      }

      try {
        const payTo = paymentDetails.x402?.accepts?.[0]?.payTo
          || process.env.PAY_TO_ADDRESS
          || '0x976aE51C1bc10Adfa65014cd42dc2c2cf62Fd232'
        const amount = paymentDetails.x402?.accepts?.[0]?.amount || '3000'

        const usdc = new ethers.Contract(USDC_CONTRACT, [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address) view returns (uint256)',
        ], wallet)

        const balance = await usdc.balanceOf(wallet.address)
        const amountBigInt = BigInt(amount)
        console.log(`[MONITOR] Agent USDC balance: ${ethers.formatUnits(balance, USDC_DECIMALS)} USDC`)
        console.log(`[MONITOR] Payment required: ${ethers.formatUnits(amountBigInt, USDC_DECIMALS)} USDC`)

        if (balance < amountBigInt) {
          console.log('[MONITOR] Insufficient USDC — report classified but unpaid')
          return
        }

        const tx = await usdc.transfer(payTo, amountBigInt)
        console.log(`[MONITOR] Payment tx sent: ${tx.hash}`)
        const receipt = await tx.wait()
        console.log(`[MONITOR] Payment confirmed in block ${receipt?.blockNumber}`)

        // Retry with payment proof
        headers['x-payment-tx'] = tx.hash
        headers['x-payment-amount'] = amount.toString()
        headers['x-payment-token'] = USDC_CONTRACT

        const paidRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, paymentTx: tx.hash }),
        })
        console.log(`[MONITOR] Paid report status: ${paidRes.status}`)
      } catch (payErr) {
        console.error('[MONITOR] Payment failed:', (payErr as Error).message?.slice(0, 100))
        console.log('[MONITOR] Payment failed, retrying in 5s...')
        await new Promise(r => setTimeout(r, 5000))
        try {
          const retryWallet = getAgentWallet()
          if (retryWallet) {
            const retryUsdc = new ethers.Contract(USDC_CONTRACT, [
              'function transfer(address to, uint256 amount) returns (bool)',
            ], retryWallet)
            const retryPayTo = paymentDetails.x402?.accepts?.[0]?.payTo
              || process.env.PAY_TO_ADDRESS
              || '0x976aE51C1bc10Adfa65014cd42dc2c2cf62Fd232'
            const retryAmount = BigInt(paymentDetails.x402?.accepts?.[0]?.amount || '3000')
            const retryTx = await retryUsdc.transfer(retryPayTo, retryAmount)
            console.log(`[MONITOR] Retry payment tx sent: ${retryTx.hash}`)
            const retryReceipt = await retryTx.wait()
            console.log(`[MONITOR] Retry payment confirmed in block ${retryReceipt?.blockNumber}`)
            headers['x-payment-tx'] = retryTx.hash
            headers['x-payment-amount'] = retryAmount.toString()
            headers['x-payment-token'] = USDC_CONTRACT
            const paidRes = await fetch(url, {
              method: 'POST', headers,
              body: JSON.stringify({ ...body, paymentTx: retryTx.hash }),
            })
            console.log(`[MONITOR] Retry paid report status: ${paidRes.status}`)
          }
        } catch (retryErr) {
          console.error('[MONITOR] Retry payment also failed:', (retryErr as Error).message?.slice(0, 100))
        }
      }
    } else {
      console.log(`[MONITOR] Report status: ${res.status}`)
    }
  } catch (err) {
    console.error('[MONITOR] Report failed:', (err as Error).message?.slice(0, 80))
  }
}

export function startMonitoring(walletAddress: string, humanAddress: string) {
  const normalized = walletAddress.toLowerCase()
  monitoredWallets.set(normalized, {
    address: normalized,
    humanAddress,
    startedAt: Date.now(),
    lastBlock: 0,
  })

  console.log(`[MONITOR] Watching wallet: ${walletAddress}`)
  if (!pollingInterval) startPolling()

  reportThroughTriage({
    type: 'monitor-started',
    walletAddress,
    timestamp: Date.now(),
  })
}

function startPolling() {
  console.log('[MONITOR] Starting blockchain polling (every 5 seconds)')
  pollingInterval = setInterval(async () => {
    for (const [, wallet] of monitoredWallets) {
      try { await checkForActivity(wallet) } catch (e) { console.error(`[MONITOR] Error:`, e) }
    }
  }, 5000)
}

async function checkForActivity(wallet: MonitoredWallet) {
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(BASE_SEPOLIA_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    return (await res.json() as { result: string }).result
  }

  const currentBlock = parseInt(await rpc('eth_blockNumber', []), 16)
  if (wallet.lastBlock === 0) { wallet.lastBlock = currentBlock; return }

  const currentBalance = parseInt(await rpc('eth_getBalance', [wallet.address, 'latest']), 16) / 1e18
  const txCount = parseInt(await rpc('eth_getTransactionCount', [wallet.address, 'latest']), 16)

  if (wallet.prevBalance === undefined) {
    wallet.prevBalance = currentBalance
    wallet.prevTxCount = txCount
    wallet.lastBlock = currentBlock
    return
  }

  if (currentBalance !== wallet.prevBalance || txCount !== (wallet.prevTxCount ?? 0)) {
    const balanceChange = currentBalance - wallet.prevBalance
    console.log(`[MONITOR] Activity on ${wallet.address}: ${balanceChange > 0 ? '+' : ''}${balanceChange.toFixed(6)} ETH`)

    const now = Date.now()
    if (now - lastBriefingTime < BRIEFING_COOLDOWN_MS) {
      console.log(`[MONITOR] Activity detected but briefing cooldown active (${Math.round((BRIEFING_COOLDOWN_MS - (now - lastBriefingTime)) / 1000)}s remaining)`)
      wallet.prevBalance = currentBalance
      wallet.prevTxCount = txCount
    } else {
      lastBriefingTime = now
      wallet.prevBalance = currentBalance
      wallet.prevTxCount = txCount
      await generateBriefing(wallet, currentBalance, balanceChange, txCount, currentBlock)
    }
  }

  wallet.lastBlock = currentBlock
}

async function getEthPrice(): Promise<{ price: number; change24h: number; btcPrice: number }> {
  try {
    const res = await fetch(`${COINGECKO_API}/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true`)
    const data = await res.json() as any
    return { price: data.ethereum?.usd || 0, change24h: data.ethereum?.usd_24h_change || 0, btcPrice: data.bitcoin?.usd || 0 }
  } catch { return { price: 0, change24h: 0, btcPrice: 0 } }
}

async function getUsdcBalance(address: string): Promise<number> {
  try {
    const data = '0x70a08231000000000000000000000000' + address.replace('0x', '')
    const res = await fetch(BASE_SEPOLIA_RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: USDC_CONTRACT, data }, 'latest'] }),
    })
    const result = await res.json() as { result: string }
    return parseInt(result.result, 16) / 1e6
  } catch { return 0 }
}

async function generateBriefing(wallet: MonitoredWallet, ethBalance: number, balanceChange: number, txCount: number, blockNumber: number) {
  const [ethPrice, usdcBalance] = await Promise.all([getEthPrice(), getUsdcBalance(wallet.address)])
  const ethValueUsd = ethBalance * ethPrice.price
  const totalUsd = ethValueUsd + usdcBalance
  const ethPct = totalUsd > 0 ? (ethValueUsd / totalUsd * 100) : 0
  const usdcPct = totalUsd > 0 ? (usdcBalance / totalUsd * 100) : 0

  let briefing: string

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const result = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: `You are a concise portfolio analyst. Generate a brief wallet alert:

Wallet: ${wallet.address}
Event: Balance changed by ${balanceChange > 0 ? '+' : ''}${balanceChange.toFixed(6)} ETH
ETH Balance: ${ethBalance.toFixed(6)} ETH ($${ethValueUsd.toFixed(2)})
USDC Balance: ${usdcBalance.toFixed(2)} USDC
Total: $${totalUsd.toFixed(2)}
ETH: ${ethPct.toFixed(0)}% | USDC: ${usdcPct.toFixed(0)}%
ETH Price: $${ethPrice.price.toFixed(2)} (${ethPrice.change24h > 0 ? '+' : ''}${ethPrice.change24h.toFixed(1)}% 24h)
BTC: $${ethPrice.btcPrice.toFixed(2)}
Block ${blockNumber} | Tx count: ${txCount}

Format as a clean mobile chat message under 150 words. No markdown. No emojis.` }],
      })
      briefing = result.content[0].type === 'text' ? result.content[0].text : ''
    } catch {
      briefing = templateBriefing(ethBalance, balanceChange, ethPrice, usdcBalance, totalUsd, ethPct, usdcPct, txCount, blockNumber)
    }
  } else {
    briefing = templateBriefing(ethBalance, balanceChange, ethPrice, usdcBalance, totalUsd, ethPct, usdcPct, txCount, blockNumber)
  }

  // Send XMTP notification (always, regardless of payment)
  await notifyHuman(`PORTFOLIO BRIEFING\n\n${briefing}`)

  // Report through Triage with x402 payment
  reportThroughTriage({
    type: 'portfolio-briefing',
    walletAddress: wallet.address,
    briefingSummary: briefing.slice(0, 200),
    ethBalance,
    timestamp: Date.now(),
  })
}

function templateBriefing(ethBal: number, change: number, price: { price: number; change24h: number; btcPrice: number }, usdcBal: number, totalUsd: number, ethPct: number, usdcPct: number, txCount: number, block: number): string {
  const dir = change > 0 ? 'RECEIVED' : 'SENT'
  return `${dir} ${Math.abs(change).toFixed(6)} ETH ($${(Math.abs(change) * price.price).toFixed(2)})

Portfolio:
- ${ethBal.toFixed(6)} ETH — $${(ethBal * price.price).toFixed(2)} (${ethPct.toFixed(0)}%)
- ${usdcBal.toFixed(2)} USDC (${usdcPct.toFixed(0)}%)
- Total: $${totalUsd.toFixed(2)}

Market:
- ETH $${price.price.toFixed(2)} (${price.change24h > 0 ? '+' : ''}${price.change24h.toFixed(1)}% 24h)
- BTC $${price.btcPrice.toFixed(2)}

Block ${block} | Tx: ${txCount}`
}

export function getMonitoredWallets() {
  return Array.from(monitoredWallets.values()).map(w => ({
    address: w.address, humanAddress: w.humanAddress, startedAt: w.startedAt,
  }))
}

export function stopMonitoring(address?: string) {
  if (address) {
    monitoredWallets.delete(address.toLowerCase())
  } else {
    monitoredWallets.clear()
  }
  if (monitoredWallets.size === 0 && pollingInterval) {
    clearInterval(pollingInterval); pollingInterval = null
  }
}
