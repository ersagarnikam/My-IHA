import type { Notification } from '@iha/db/types'
import { formatRelativeTime } from './lib/format-relative-time'

type Props = {
  notification: Notification
  onClick: () => void
  dense?: boolean
}

export function NotificationRow({ notification, onClick, dense }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-0.5 text-left transition-colors hover:bg-slate-50 ${
        dense ? 'px-4 py-2.5' : 'px-4 py-3'
      } ${!notification.read ? 'bg-cyan-50/60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{notification.title}</p>
        {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />}
      </div>
      <p className={`text-xs text-slate-500 ${dense ? 'line-clamp-2' : ''}`}>{notification.message}</p>
      <p className="text-[11px] text-slate-400">{formatRelativeTime(notification.created_at)}</p>
    </button>
  )
}
