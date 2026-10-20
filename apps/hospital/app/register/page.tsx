import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { getAccountForUser } from '@/lib/auth/account'
import { HospitalRegistrationWizard } from '@/components/registration/hospital-registration-wizard'

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const account = await getAccountForUser(user.id)
    if (account) redirect(account.status === 'approved' ? '/dashboard' : '/pending-approval')
  }

  const { data: specialties } = await fetchActiveSpecialties()

  return (
    <HospitalRegistrationWizard
      initialStep={user ? 3 : 1}
      userId={user?.id ?? null}
      specialties={specialties}
    />
  )
}
