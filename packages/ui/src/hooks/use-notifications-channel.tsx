'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@iha/db/client'
import type { Notification } from '@iha/db/types'

type Listener = (notification: Notification) => void

type NotificationsChannelContextValue = {
  subscribe: (listener: Listener) => () => void
  unreadCount: number
  markOneAsRead: () => void
  markAllAsRead: () => void
}

const NotificationsChannelContext = createContext<NotificationsChannelContextValue | null>(null)

type ProviderProps = {
  userId: string
  initialUnreadCount: number
  children: ReactNode
}

// Owns the single realtime subscription and the shared unread count for the
// current user's notifications, so that components like NotificationBell and
// NotificationsList, which may be mounted at the same time, don't each open a
// duplicate websocket channel or drift out of sync with each other's read state.
export function NotificationsChannelProvider({ userId, initialUnreadCount, children }: ProviderProps) {
  const listenersRef = useRef(new Set<Listener>())
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as Notification
            setUnreadCount((prev) => prev + 1)
            for (const listener of listenersRef.current) listener(row)
          },
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId])

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const markOneAsRead = useCallback(() => {
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return (
    <NotificationsChannelContext.Provider value={{ subscribe, unreadCount, markOneAsRead, markAllAsRead }}>
      {children}
    </NotificationsChannelContext.Provider>
  )
}

export function useNotificationsChannel(): NotificationsChannelContextValue {
  const ctx = useContext(NotificationsChannelContext)
  if (!ctx) throw new Error('useNotificationsChannel must be used within a NotificationsChannelProvider')
  return ctx
}
