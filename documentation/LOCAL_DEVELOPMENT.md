# Local Development

## Prerequisites

- Node.js 22+
- npm 10+
- World App (for World ID verification testing)

## Quick Start

### Main Server + Dashboard

```bash
# Terminal 1: Server
cd triage/server
cp .env.example .env  # fill in your keys
npm install
npm run dev            # http://localhost:4021

# Terminal 2: Dashboard
cd triage/dashboard
npm install
npm run dev            # http://localhost:5173
```

The dashboard at :5173 proxies API calls to :4021 and connects WebSocket to :4022.

### Test Site (The Roaster)

```bash
# Terminal 1: Backend
cd triage/test-site
npm install
npm run server         # http://localhost:3000

# Terminal 2: Frontend
cd triage/test-site
npm run dev            # http://localhost:5174
```

Vite proxies `/api` and `/triage` to :3000.

Or run both:
```bash
npm run start          # concurrently runs server + dev
```

### Package Development

```bash
cd triage/packages/triage-middleware
npm install
npx tsc --watch

# In another terminal, link to test-site:
cd triage/test-site
npm install ../packages/triage-middleware
```

Changes to the package source are picked up by tsc --watch. Restart the test-site server to see changes.

### Dashboard for Package

```bash
cd triage/packages/triage-middleware/dashboard-src
npm install
npm run dev            # standalone dashboard dev server

# After changes, rebuild:
npm run build
cp -r dist/* ../dashboard-dist/
cd ..
npx tsc                # rebuild package
```

## Testing API Endpoints

### Triage Classification

```bash
# BLOCKED — no identity
curl http://localhost:4021/api/data

# HUMAN — World ID (demo header, main server only)
curl -H "x-world-id: verified" http://localhost:4021/api/data

# HUMAN_AGENT — AgentKit (demo header)
curl -H "x-agentkit-demo: human-backed" -H "x-agent-address: 0xAGENT" http://localhost:4021/api/data

# ANON_BOT — wallet address
curl -H "x-agent-address: 0xBOT1234" http://localhost:4021/api/data
```

### Roaster

```bash
# Without triage-middleware installed (fallback mode)
curl http://localhost:3000/api/roast
curl -H "x-world-id: verified" http://localhost:3000/api/roast
curl -H "x-agent-address: 0xBOT" http://localhost:3000/api/roast
```

### Chat

```bash
curl -X POST http://localhost:4021/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "show me agents"}'
```

### World ID Verification

```bash
# Get rp_context
curl -X POST http://localhost:4021/api/idkit/rp-context

# Verify proof (requires real World ID proof)
curl -X POST http://localhost:4021/api/verify-human \
  -H "Content-Type: application/json" \
  -d '{"proof": "...", "nullifier_hash": "..."}'
```

## Port Map

| Port | Service |
|------|---------|
| 4021 | Main server API |
| 4022 | Main server WebSocket (dev only) |
| 5173 | Dashboard Vite dev server |
| 3000 | Test site backend |
| 5174 | Test site Vite dev server |

## Common Issues

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Dashboard shows "Loading agents..."
Server must be running. Check port 4021 is up.

### XMTP bot won't start
Needs XMTP_WALLET_KEY and XMTP_DB_ENCRYPTION_KEY in .env. Bot startup is non-blocking — server continues if it fails.

### World ID widget shows "Open World App" instead of QR
Screen width < 1024px triggers mobile mode. IDKit CSS overrides in dashboard's index.css force desktop mode.

### Trust scores seem stuck
Demo agents have trust floors (minimum 75). Real agents score based on actual behavior.
