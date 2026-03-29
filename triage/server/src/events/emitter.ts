import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import { Tier } from '../config/tiers'

export interface TriageEvent {
  id: string
  timestamp: number
  tier: Tier
  color: string
  agentAddress: string | null
  trustScore: number
  priceCharged: number
  humanId: string | null
  requestPath: string
}

let wss: WebSocketServer | null = null
const clients = new Set<WebSocket>()

/** Dev mode: standalone WebSocket server on its own port */
export function startWebSocketServer(port: number) {
  wss = new WebSocketServer({ port })
  wireConnections()
  console.log(`WebSocket server running on ws://localhost:${port}`)
}

/** Production mode: attach to existing HTTP server for upgrade on /ws path */
export function attachWebSocketToServer(server: { on: (event: string, handler: (...args: any[]) => void) => void }) {
  wss = new WebSocketServer({ noServer: true })
  wireConnections()

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/ws') {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request)
      })
    } else {
      socket.destroy()
    }
  })

  console.log('[WS] WebSocket attached to HTTP server on /ws path')
}

function wireConnections() {
  if (!wss) return
  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`Dashboard connected (${clients.size} clients)`)
    ws.on('close', () => {
      clients.delete(ws)
      console.log(`Dashboard disconnected (${clients.size} clients)`)
    })
  })
}

export function emitEvent(event: TriageEvent) {
  console.log('[WS] Broadcasting to', clients.size, 'clients:', event.tier, event.trustScore)
  const data = JSON.stringify(event)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
  console.log(`[TRIAGE] ${event.tier} | score: ${event.trustScore} | price: $${event.priceCharged} | ${event.requestPath}`)
}
