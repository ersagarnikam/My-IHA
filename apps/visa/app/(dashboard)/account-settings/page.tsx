import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchLawyerAccountSettings } from '@/lib/data/account-settings'
import { AccountSettingsClient } from '@/components/account-settings/account-settings-client'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const lawyer = await fetchLawyerAccountSettings(user.id)
  if (!lawyer) redirect('/register')

  return <AccountSettingsClient lawyer={lawyer} email={user.email ?? ''} />
}
