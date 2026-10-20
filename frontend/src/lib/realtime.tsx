import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { authHeaders } from './api'

// One server-sent-events stream per tab (GET /api/realtime), replacing the
// Supabase Realtime channels. EventSource can't send the bearer token, so the
// stream is read with fetch and parsed here. Reconnects with backoff.

type Listener = (type: string, payload: unknown) => void

type RealtimeValue = { subscribe: (listener: Listener) => () => void }

const RealtimeContext = createContext<RealtimeValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    let controller: AbortController | null = null

    async function connect(signal: AbortSignal) {
      let attempt = 0
      while (!signal.aborted) {
        try {
          const response = await fetch('/api/realtime', { headers: authHeaders(), signal })
          if (!response.ok || !response.body) throw new Error(`stream ${response.status}`)
          attempt = 0
          await readEvents(response.body, (type, data) => {
            listeners.current.forEach((listener) => listener(type, data))
          })
        } catch {
          if (signal.aborted) return
        }
        attempt++
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1000 * 2 ** attempt)))
      }
    }

    const start = () => {
      controller?.abort()
      controller = new AbortController()
      void connect(controller.signal)
    }
    // A page kept in the back/forward cache would otherwise hold its stream open;
    // browsers allow only ~6 connections per host on HTTP/1.1, so leaked streams
    // stall every other request.
    const stop = () => controller?.abort()
    const resume = (e: PageTransitionEvent) => e.persisted && start()

    start()
    window.addEventListener('pagehide', stop)
    window.addEventListener('pageshow', resume)
    return () => {
      stop()
      window.removeEventListener('pagehide', stop)
      window.removeEventListener('pageshow', resume)
    }
  }, [])

  const value = useRef<RealtimeValue>({
    subscribe: (listener) => {
      listeners.current.add(listener)
      return () => listeners.current.delete(listener)
    },
  }).current

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

async function readEvents(
  stream: ReadableStream<Uint8Array>,
  emit: (type: string, data: unknown) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      let type = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) {
        try {
          emit(type, JSON.parse(data.join('\n')))
        } catch {
          // Ignore malformed events.
        }
      }
    }
  }
}

/** Calls `onEvent` for every realtime event of `type` while mounted. */
export function useRealtime<T>(type: string, onEvent: (payload: T) => void) {
  const context = useContext(RealtimeContext)
  const handler = useRef(onEvent)
  handler.current = onEvent
  useEffect(() => {
    if (!context) return
    return context.subscribe((eventType, payload) => {
      if (eventType === type) handler.current(payload as T)
    })
  }, [context, type])
}
