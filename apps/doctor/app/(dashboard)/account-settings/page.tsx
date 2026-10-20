import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { fetchFeeSettings, fetchDoctorFeePayments } from '@iha/db/doctor-fees'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchDoctorAccountSettings } from '@/lib/data/account-settings'
import { fetchHospitalOptions } from '@/lib/data/hospitals'
import { AccountSettingsClient } from '@/components/account-settings/account-settings-client'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const [doctor, { data: specialtyOptions }, hospitalOptions, { data: feeSettings }, { data: feePayments }] =
    await Promise.all([
      fetchDoctorAccountSettings(user.id),
      fetchActiveSpecialties(),
      fetchHospitalOptions(),
      fetchFeeSettings(),
      fetchDoctorFeePayments(account.id),
    ])
  if (!doctor) redirect('/register')

  return (
    <AccountSettingsClient
      doctor={doctor}
      email={user.email ?? ''}
      specialtyOptions={specialtyOptions}
      hospitalOptions={hospitalOptions}
      annualFeeAud={feeSettings?.doctorAnnualFeeAud ?? 2000}
      feePayments={feePayments}
    />
  )
}
