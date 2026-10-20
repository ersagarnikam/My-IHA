import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchNotificationsForUser } from '@iha/db/notifications'
import { NotificationsList } from '@/components/notifications/notifications-list'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: notifications } = await fetchNotificationsForUser(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
        <p className="mt-0.5 text-sm text-slate-500">Your notification history.</p>
      </div>

      <NotificationsList initialNotifications={notifications} />
    </div>
  )
}
