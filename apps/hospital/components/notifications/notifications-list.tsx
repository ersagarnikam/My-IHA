'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Notification } from '@iha/db/types'
import { markAllNotificationsAsRead, markNotificationAsRead } from '@/lib/actions/notifications'
import { useNotificationsChannel, NotificationRow } from '@iha/ui'

type Props = {
  initialNotifications: Notification[]
}

export function NotificationsList({ initialNotifications }: Props) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const { subscribe, markOneAsRead, markAllAsRead } = useNotificationsChannel()

  useEffect(() => {
    return subscribe((row) => {
      setNotifications((prev) => [row, ...prev])
    })
  }, [subscribe])

  const hasUnread = notifications.some((n) => !n.read)

  async function handleItemClick(notification: Notification) {
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      )
      markOneAsRead()
      await markNotificationAsRead(notification.id)
    }
    if (notification.case_id) {
      router.push(
        `/case-management/${notification.case_id}${notification.assignment_id ? `?assignmentId=${notification.assignment_id}` : ''}`,
      )
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllAsRead()
    await markAllNotificationsAsRead()
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <p className="text-sm font-medium text-slate-500">No notifications yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {hasUnread && (
        <div className="flex items-center justify-end border-b border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
          >
            Mark all as read
          </button>
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {notifications.map((n) => (
          <NotificationRow key={n.id} notification={n} onClick={() => handleItemClick(n)} />
        ))}
      </div>
    </div>
  )
}
