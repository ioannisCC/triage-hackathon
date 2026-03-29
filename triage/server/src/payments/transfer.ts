import { ethers } from 'ethers'

const USDC_CONTRACT = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const BASE_SEPOLIA_RPC = 'https://base-sepolia-rpc.publicnode.com'

export async function transferReward(toAddress: string, amountUsd: number): Promise<string | null> {
  if (process.env.ENABLE_REAL_REWARDS !== 'true') {
    console.log(`[PAYMENT] Reward display only: $${amountUsd} to ${toAddress.slice(0, 12)} (ENABLE_REAL_REWARDS not set)`)
    return null
  }

  const key = process.env.AGENT_PRIVATE_KEY
  if (!key) {
    console.log('[PAYMENT] No wallet key — reward not transferred')
    return null
  }

  try {
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC)
    const wallet = new ethers.Wallet(key, provider)
    const usdc = new ethers.Contract(USDC_CONTRACT, [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ], wallet)

    const amountUnits = BigInt(Math.round(amountUsd * 1e6)) // USDC has 6 decimals
    const balance = await usdc.balanceOf(wallet.address)

    console.log(`[PAYMENT] Attempting reward transfer: $${amountUsd} (${amountUnits} units) to ${toAddress.slice(0, 12)}`)
    console.log(`[PAYMENT] Escrow balance: ${ethers.formatUnits(balance, 6)} USDC`)

    if (balance < amountUnits) {
      console.log('[PAYMENT] Insufficient escrow balance — reward not transferred')
      return null
    }

    const tx = await usdc.transfer(toAddress, amountUnits)
    console.log(`[PAYMENT] Reward tx sent: ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`[PAYMENT] Reward confirmed in block ${receipt?.blockNumber}: $${amountUsd} to ${toAddress.slice(0, 12)}`)
    return tx.hash
  } catch (err) {
    console.error('[PAYMENT] Reward transfer failed:', (err as Error).message?.slice(0, 100))
    return null
  }
}
