import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { LawyerRegistrationWizard } from '@/components/registration/lawyer-registration-wizard'

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const account = await getAccountForUser(user.id)
    if (account) redirect(account.status === 'approved' ? '/dashboard' : '/pending-approval')
  }

  return <LawyerRegistrationWizard initialStep={user ? 3 : 1} userId={user?.id ?? null} />
}
