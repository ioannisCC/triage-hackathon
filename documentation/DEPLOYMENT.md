# Deployment

## Overview

Two Railway services + one npm package:

| Service | URL | What |
|---------|-----|------|
| Main Server | triage-hackathon-production.up.railway.app | Full dashboard + marketplace + XMTP + monitoring |
| The Roaster | triage-roaster-production.up.railway.app | Demo site using triage-middleware from npm |
| npm Package | npmjs.com/package/triage-middleware | Published middleware |

## Main Server (Railway)

### Dockerfile

```dockerfile
FROM node:22-bookworm
RUN apt-get update && apt-get install -y ca-certificates openssl libssl-dev libstdc++6 libc6 libgcc-s1 sqlite3 libsqlite3-0
WORKDIR /app
COPY dashboard/package.json dashboard/
RUN cd dashboard && npm install
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build
COPY server/package.json server/tsconfig.json server/
RUN cd server && npm install
COPY server/ server/
COPY package.json .
WORKDIR /app/server
ENV NAPI_RS_NATIVE_LIBRARY_PATH=/app/server/node_modules/@xmtp/node-bindings/dist/bindings_node.linux-x64-gnu.node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
```

### How it works in production

1. Dashboard is built at Docker build time → `dashboard/dist/`
2. Server starts with `NODE_ENV=production`
3. `isProd` flag enables:
   - Static file serving from `../dashboard/dist/`
   - WebSocket on same port via HTTP upgrade on `/ws`
4. API routes handle all `/api/*` traffic
5. Catch-all `GET *` serves dashboard SPA with fallback to `index.html`

### Railway Environment Variables

Set these in Railway dashboard (not committed):

```
PORT                    → Railway injects automatically
ANTHROPIC_API_KEY       → Claude API key
WORLD_RP_ID             → rp_ac97197261e6f570
WORLD_SIGNING_KEY       → 0x...
XMTP_ENV                → production
XMTP_WALLET_KEY         → 0x...
XMTP_DB_ENCRYPTION_KEY  → 0x...
AGENT_PRIVATE_KEY       → 0x...
AGENT_ADDRESS            → 0x...
PAY_TO_ADDRESS          → 0x...
ENABLE_REAL_REWARDS     → true
```

### XMTP on Railway

Known issue: `@xmtp/node-bindings` native binary fails to load under `tsx`'s CJS loader on Linux. Workaround:

```
ENV NAPI_RS_NATIVE_LIBRARY_PATH=/app/server/node_modules/@xmtp/node-bindings/dist/bindings_node.linux-x64-gnu.node
```

This tells NAPI-RS exactly where the `.node` file is, bypassing the platform detection that breaks under tsx.

If the bot still fails to start, the server continues without it — XMTP is non-blocking.

### Persistent Storage

Railway volume mounted at `/data` for XMTP database:
```typescript
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'xmtp-db')
  : join(process.cwd(), '.xmtp-db')
```

## The Roaster (Railway)

### Dockerfile

```dockerfile
FROM node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json* .
RUN npm install
COPY . .
RUN npm run build && ls dist/index.html && echo "BUILD OK"
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["npx", "tsx", "server.ts"]
```

### How it works

1. Vite builds React frontend → `dist/`
2. Server starts, imports `triage-middleware` from npm
3. Mounts `triage()` on `/api/*` — real classification + x402 payments
4. Mounts `triageDashboard()` at `/triage` — monitoring dashboard + World ID
5. Serves built frontend from `dist/` for all other routes
6. Single port serves everything

### URL Structure

```
/              → React frontend (The Roaster)
/api/roast     → Protected by triage middleware
/triage        → Monitoring dashboard (from npm package)
/triage/api/*  → Dashboard API endpoints
/health        → Health check
```

## npm Package Publishing

```bash
cd triage/packages/triage-middleware

# Rebuild dashboard
cd dashboard-src && npm run build && cp -r dist/* ../dashboard-dist/ && cd ..

# Rebuild TypeScript
npx tsc

# Publish
npm version patch
npm publish
```

### Package Contents (files field)

```
dist/              → Compiled TypeScript (7 .js + .d.ts files)
dashboard-dist/    → Pre-built React dashboard
README.md
```

## Local Development

### Main Server

```bash
cd triage/server
npm install
npm run dev    # tsx watch src/index.ts
```

Dashboard (separate terminal):
```bash
cd triage/dashboard
npm install
npm run dev    # vite dev server on :5173
```

### Test Site

```bash
cd triage/test-site
npm install
npm run server    # backend on :3000
npm run dev       # vite on :5174 (separate terminal)
# OR
npm run start     # both via concurrently
```

### Package Development

```bash
cd triage/packages/triage-middleware
npm install
npx tsc --watch

# Link locally to test-site:
cd ../../test-site
npm install ../packages/triage-middleware
```
