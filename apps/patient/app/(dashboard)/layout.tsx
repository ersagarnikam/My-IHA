import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchNotificationsForUser, fetchUnreadNotificationCount } from '@iha/db/notifications'
import { fetchChatThreadForPatient, fetchUnreadChatMessageCount } from '@iha/db/chat'
import { getLocale } from 'next-intl/server'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { NavigationProgressProvider } from '@/components/layout/navigation-progress'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  if (!user.email_confirmed_at) {
    redirect(`/verify?email=${encodeURIComponent(user.email ?? '')}`)
  }

  const patient = await fetchPatientByUserId(user.id)

  // Onboarding isn't finished — every route under (dashboard) requires a
  // completed profile, so send them back before rendering anything here.
  if (!patient || !patient.date_of_birth || !patient.emergency_contact_name) {
    redirect('/profile/setup')
  }

  const userName = user.user_metadata?.full_name ?? user.email ?? 'Patient'
  const userInitial = (userName[0] ?? 'P').toUpperCase()
  const avatarUrl = patient.avatar_url
  const patientId = patient.id

  const [{ data: notifications }, { count: unreadCount }, locale, { data: chatThread }] = await Promise.all([
    fetchNotificationsForUser(user.id),
    fetchUnreadNotificationCount(user.id),
    getLocale(),
    patientId ? fetchChatThreadForPatient(patientId) : Promise.resolve({ data: null, error: null }),
  ])

  let unreadChatCount = 0
  if (chatThread) {
    unreadChatCount = (await fetchUnreadChatMessageCount(chatThread.id)).count
  }

  return (
    <NavigationProgressProvider>
      <DashboardShell
        userName={userName}
        userInitial={userInitial}
        avatarUrl={avatarUrl}
        userId={user.id}
        initialNotifications={notifications.slice(0, 5)}
        initialUnreadCount={unreadCount}
        initialUnreadChatCount={unreadChatCount}
        locale={locale}
      >
        {children}
      </DashboardShell>
    </NavigationProgressProvider>
  )
}
