import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { fetchFeeSettings } from '@iha/db/doctor-fees'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchHospitalOptions } from '@/lib/data/hospitals'
import { postAuthRedirect } from '@/lib/actions/auth'
import { DoctorRegistrationWizard } from '@/components/registration/doctor-registration-wizard'

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const account = await getAccountForUser(user.id)
    // postAuthRedirect also accounts for the registration-fee gate (approved
    // but unpaid goes to /registration-fee, not /dashboard) — duplicating
    // that ternary here previously missed it.
    if (account) redirect(await postAuthRedirect(user.id))
  }

  const [{ data: specialties }, hospitalOptions, { data: feeSettings }] = await Promise.all([
    fetchActiveSpecialties(),
    fetchHospitalOptions(),
    fetchFeeSettings(),
  ])

  return (
    <DoctorRegistrationWizard
      initialStep={user ? 3 : 1}
      userId={user?.id ?? null}
      specialties={specialties}
      hospitalOptions={hospitalOptions}
      registrationFeeAud={feeSettings?.doctorRegistrationFeeAud ?? 5000}
    />
  )
}
