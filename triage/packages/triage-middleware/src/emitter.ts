import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { TriageEvent } from './types'

let wss: WebSocketServer | null = null
const clients = new Set<WebSocket>()

export function startWebSocketServer(port: number) {
  wss = new WebSocketServer({ port })
  wireConnections()
}

export function attachWebSocketToServer(server: { on: (event: string, handler: (...args: any[]) => void) => void }) {
  wss = new WebSocketServer({ noServer: true })
  wireConnections()
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    if (url.pathname === '/ws') {
      wss!.handleUpgrade(request, socket, head, (ws) => wss!.emit('connection', ws, request))
    } else {
      socket.destroy()
    }
  })
}

function wireConnections() {
  if (!wss) return
  wss.on('connection', (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })
}

export function emitEvent(event: TriageEvent) {
  const data = JSON.stringify(event)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}
