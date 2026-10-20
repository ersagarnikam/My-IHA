'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { Notification } from '@iha/db/types'
import { markAllNotificationsAsRead, markNotificationAsRead, resolveNotificationHref } from '@/lib/actions/notifications'
import { useNotificationsChannel } from '@/hooks/use-notifications-channel'
import { NotificationRow } from './notification-row'

type Props = {
  initialNotifications: Notification[]
  initialUnreadCount: number
}

export function NotificationBell({ initialNotifications, initialUnreadCount }: Props) {
  const router = useRouter()
  const t = useTranslations('notifications')
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { subscribe } = useNotificationsChannel()

  useEffect(() => {
    return subscribe((row) => {
      setNotifications((prev) => [row, ...prev].slice(0, 5))
      setUnreadCount((prev) => prev + 1)
      toast.custom(
        (id) => (
          <div className="flex w-80 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{row.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{row.message}</p>
              {row.case_id && (
                <button
                  type="button"
                  onClick={async () => {
                    toast.dismiss(id)
                    const href = await resolveNotificationHref(row)
                    if (href) router.push(href)
                  }}
                  className="mt-2 text-xs font-medium text-cyan-600 hover:text-cyan-700"
                >
                  {t('view')}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label={t('dismiss')}
              onClick={() => toast.dismiss(id)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        { position: 'top-right', duration: 6000 },
      )
    })
  }, [subscribe, router, t])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleItemClick(notification: Notification) {
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      await markNotificationAsRead(notification.id)
    }
    setOpen(false)
    const href = await resolveNotificationHref(notification)
    if (href) router.push(href)
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    await markAllNotificationsAsRead()
  }

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <div ref={containerRef} className="relative">
      {/* Mobile: navigate straight to the notifications page */}
      <Link
        href="/notifications"
        aria-label={t('title')}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 lg:hidden"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badgeLabel}
          </span>
        )}
      </Link>

      {/* Desktop: dropdown panel */}
      <button
        type="button"
        aria-label={t('title')}
        onClick={() => setOpen((prev) => !prev)}
        className="relative hidden h-9 w-9 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 lg:inline-flex"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 hidden w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg lg:block">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">{t('title')}</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
              >
                {t('markAllAsRead')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">{t('empty')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <NotificationRow key={n.id} notification={n} onClick={() => handleItemClick(n)} dense />
                ))}
              </div>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-cyan-600 hover:bg-slate-50 hover:text-cyan-700"
          >
            {t('viewAll')}
          </Link>
        </div>
      )}
    </div>
  )
}
