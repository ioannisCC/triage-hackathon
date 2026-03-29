# Environment Variables

## Server (.env)

All variables read from `triage/server/.env`. Required for full deployment.

| Variable | Required | Used In | Purpose |
|----------|----------|---------|---------|
| `PORT` | No (default: 4021) | index.ts | HTTP server port |
| `WS_PORT` | No (default: 4022) | index.ts | WebSocket port (dev only) |
| `PAY_TO_ADDRESS` | No (has fallback) | index.ts, monitor.ts | Wallet receiving x402 payments |
| `WORLD_RP_ID` | Yes (for World ID) | index.ts | World ID relying party ID |
| `WORLD_SIGNING_KEY` | Yes (for World ID) | index.ts | Signs rp_context for IDKit widget |
| `WORLD_APP_ADDRESS` | No | index.ts | World App contract address |
| `XMTP_ENV` | No (default: dev) | bot.ts | XMTP network (production/dev) |
| `XMTP_WALLET_KEY` | Yes (for bot) | bot.ts | XMTP agent identity private key |
| `XMTP_DB_ENCRYPTION_KEY` | Yes (for bot) | bot.ts | Encrypts local XMTP database |
| `AGENT_PRIVATE_KEY` | Yes (for payments) | transfer.ts, monitor.ts | Signs USDC transfers |
| `AGENT_ADDRESS` | No (derived) | monitor.ts | Agent wallet address |
| `ANTHROPIC_API_KEY` | Yes (for AI) | index.ts, bot.ts, monitor.ts | Claude API access |
| `ENABLE_REAL_REWARDS` | No (default: false) | transfer.ts | Gates real USDC transfers |
| `NODE_ENV` | No | index.ts | production enables static file serving |
| `RAILWAY_VOLUME_MOUNT_PATH` | No | bot.ts | Persistent storage path on Railway |

## Test Site

The test-site uses triage-middleware from npm. World ID config is hardcoded in server.ts (not env vars) for demo simplicity:

```typescript
rpId: 'rp_ac97197261e6f570'
signingKey: '0x...'  // World ID signing key
```

For production, move these to environment variables.

## .env.example

```bash
# Server
PORT=4021
WS_PORT=4022
PAY_TO_ADDRESS=0xYourWallet

# World ID
WORLD_RP_ID=rp_your_id
WORLD_SIGNING_KEY=0xYourSigningKey

# XMTP Bot
XMTP_ENV=production
XMTP_WALLET_KEY=0xYourXmtpKey
XMTP_DB_ENCRYPTION_KEY=0xYourEncryptionKey

# Agent Wallet
AGENT_PRIVATE_KEY=0xYourAgentKey
AGENT_ADDRESS=0xYourAgentAddress

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Payments
ENABLE_REAL_REWARDS=true
```

## Security Notes

- All private keys in `.env` are for **Base Sepolia testnet** wallets
- ANTHROPIC_API_KEY gives access to Claude API billing
- WORLD_SIGNING_KEY can forge verification contexts (rotate post-hackathon)
- XMTP_WALLET_KEY controls the bot's XMTP identity
- Never commit `.env` to version control in production
- All keys should be rotated after hackathon judging

## Hardcoded Values (not in .env)

These are in source code, not environment variables:

| Value | File | Notes |
|-------|------|-------|
| `eip155:84532` (Base Sepolia) | index.ts, pricing.ts | Chain ID |
| `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | index.ts, transfer.ts, monitor.ts | USDC contract on Base Sepolia |
| `https://base-sepolia-rpc.publicnode.com` | transfer.ts, monitor.ts | RPC endpoint |
| `https://x402.org/facilitator/verify` | index.ts | x402 facilitator |
| `https://api.coingecko.com/api/v3` | monitor.ts | Price feed |
| `app_7d1c626d5f999f278a30144020444544` | WorldIDButton.tsx, test-site | World App ID (public) |
