import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchHospitalAccountSettings } from '@/lib/data/account-settings'
import { HospitalAccountSettingsClient } from '@/components/account-settings/hospital-account-settings-client'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const [hospital, { data: specialtyOptions }] = await Promise.all([
    fetchHospitalAccountSettings(user.id),
    fetchActiveSpecialties(),
  ])
  if (!hospital) redirect('/register')

  return (
    <HospitalAccountSettingsClient hospital={hospital} email={user.email ?? ''} specialtyOptions={specialtyOptions} />
  )
}
