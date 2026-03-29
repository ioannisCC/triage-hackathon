import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'

const app = new Hono()
app.use('/*', cors({ origin: '*' }))

// ─── Load triage-middleware (REAL, from npm) ─────────────────────────

let triageLoaded = false
try {
  const { triage, triageDashboard, attachWebSocketToServer: _attach } = await import('triage-middleware')

  // REAL triage middleware on ALL /api/* routes
  app.use('/api/*', triage({
    payTo: '0x976aE51C1bc10Adfa65014cd42dc2c2cf62Fd232',
    network: 'eip155:84532',
  }))

  // Dashboard + World ID routes at /triage/*
  triageDashboard(app, {
    rpId: 'rp_ac97197261e6f570',
    signingKey: 'REDACTED_SIGNING_KEY',
  })

  triageLoaded = true
  console.log('[TRIAGE] Middleware loaded on /api/* — dashboard at /triage')
} catch {
  console.log('[TRIAGE] triage-middleware not installed, using fallback')
}

// ─── Roast endpoint (protected by triage) ────────────────────────────

const ROASTS: Record<string, string[]> = {
  HUMAN: [
    'Verified. Trusted. Suspiciously calm. Welcome, human.',
    "World ID confirmed. Free access. Proof of personhood still means something.",
    "You proved you're human. The bar is underground and you still cleared it.",
  ],
  HUMAN_AGENT: [
    "Delegated intelligence. Your human trusts you. Don't blow it.",
    "AgentKit verified. Basically a human with better uptime.",
  ],
  ANON_BOT: [
    'You brought a wallet, not a reputation. That costs extra.',
    'Anonymous bot. Full price. Trust is earned, not assumed.',
  ],
  BLOCKED: [
    'No identity. No wallet. No access. Try being someone first.',
    'BLOCKED. Confidence detected. Identity not found.',
    'You brought nothing. We returned the favor.',
    'Error 403: Existence not verified.',
  ],
}

app.get('/api/roast', (c) => {
  // If triage middleware passed the request through, these headers exist
  const tier = c.req.header('X-Triage-Tier') || 'HUMAN'
  const score = parseInt(c.req.header('X-Triage-Trust-Score') || '100')

  const tierRoasts = ROASTS[tier] || ROASTS.HUMAN
  const roast = tierRoasts[Math.floor(Math.random() * tierRoasts.length)]

  const price = tier === 'HUMAN' ? '$0.00' : score >= 60 ? '$0.001' : score >= 40 ? '$0.003' : '$0.007'
  return c.json({ tier, trustScore: score, roast, price, timestamp: new Date().toISOString() })
})

app.get('/api/agents', (c) => c.json([]))

// ─── Serve built frontend ────────────────────────────────────────────

import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const distDir = join(process.cwd(), 'dist')
console.log('[STATIC] Serving from:', distDir, 'exists:', existsSync(distDir))

app.get('/health', (c) => c.text('ok'))

app.get('/*', async (c) => {
  try {
    const url = new URL(c.req.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const fp = join(distDir, pathname)

    const mimes: Record<string, string> = {
      '.html': 'text/html', '.js': 'application/javascript',
      '.css': 'text/css', '.svg': 'image/svg+xml',
      '.png': 'image/png', '.wasm': 'application/wasm',
      '.ico': 'image/x-icon', '.json': 'application/json',
    }

    const ext = '.' + (fp.split('.').pop() || 'html')
    const data = await readFile(fp)
    return new Response(data, {
      headers: { 'Content-Type': mimes[ext] || 'application/octet-stream' }
    })
  } catch {
    try {
      const index = await readFile(join(distDir, 'index.html'))
      return new Response(index, { headers: { 'Content-Type': 'text/html' } })
    } catch {
      console.error('[STATIC] No index.html found in', distDir)
      return c.text('Not found', 404)
    }
  }
})

// ─── Start ───────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3000
console.log(`The Roaster running on http://localhost:${port}`)
if (triageLoaded) console.log(`Dashboard: http://localhost:${port}/triage`)

const server = serve({ fetch: app.fetch, port })

if (triageLoaded) {
  try {
    const { attachWebSocketToServer } = await import('triage-middleware')
    attachWebSocketToServer(server)
    console.log('[WS] WebSocket attached on /ws')
  } catch {}
}
