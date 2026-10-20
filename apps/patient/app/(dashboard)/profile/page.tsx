import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { ProfileClient } from '@/components/profile/profile-client'

export default async function ProfilePage() {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const patient = await fetchPatientByUserId(user.id)

  if (!patient) redirect('/login')

  if (!patient.date_of_birth || !patient.emergency_contact_name) {
    redirect('/profile/setup')
  }

  return <ProfileClient patient={patient} email={user.email ?? ''} />
}
