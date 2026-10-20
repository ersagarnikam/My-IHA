import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@iha/db/server'
import { fetchProviderThread, fetchUnreadProviderMessageCount } from '@iha/db/provider-messages'
import { fetchNotificationsForUser, fetchUnreadNotificationCount } from '@iha/db/notifications'
import { getAccountForUser } from '@/lib/auth/account'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { NavigationProgressProvider } from '@iha/ui'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  if (!user.email_confirmed_at) {
    redirect(`/verify?email=${encodeURIComponent(user.email ?? '')}`)
  }

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') {
    // This app only serves hospitals — sign out before redirecting,
    // otherwise the middleware's "authenticated user on /login" rule bounces
    // them straight back to /dashboard, which redirects here again: an
    // infinite loop instead of a clear error.
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  if (account.status !== 'approved') redirect('/pending-approval')

  const { data: thread } = await fetchProviderThread(account.role, account.id)
  const { count: unreadMessageCount } = thread
    ? await fetchUnreadProviderMessageCount(thread.id)
    : { count: 0 }

  const [{ data: notifications }, { count: unreadNotificationCount }] = await Promise.all([
    fetchNotificationsForUser(user.id),
    fetchUnreadNotificationCount(user.id),
  ])

  return (
    <NavigationProgressProvider>
      <DashboardShell
        account={account}
        userId={user.id}
        unreadMessageCount={unreadMessageCount}
        initialNotifications={notifications.slice(0, 5)}
        initialUnreadCount={unreadNotificationCount}
      >
        {children}
      </DashboardShell>
    </NavigationProgressProvider>
  )
}
