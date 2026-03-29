import { useEffect, useRef, useState, useCallback } from 'react'
import type { TriageEvent } from '../types'

const MAX_EVENTS = 100

export function useWebSocket(url: string) {
  const [events, setEvents] = useState<TriageEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    console.log('[WS] Connecting to', url)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Connected')
      setIsConnected(true)
    }

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as TriageEvent
        console.log('[WS] Event received:', event.tier, event.trustScore)
        setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 2s...')
      setIsConnected(false)
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { events, isConnected }
}
