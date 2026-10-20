import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchNotificationsForUser } from '@iha/db/notifications'
import { getTranslations } from 'next-intl/server'
import { NotificationsList } from '@/components/notifications/notifications-list'

export default async function NotificationsPage() {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const [{ data: notifications }, t] = await Promise.all([
    fetchNotificationsForUser(user.id),
    getTranslations('notifications'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <NotificationsList initialNotifications={notifications} />
    </div>
  )
}
