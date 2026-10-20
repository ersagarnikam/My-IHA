import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { ProfileSetupWizard } from '@/components/profile/profile-setup-wizard'

export default async function ProfileSetupPage() {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const patient = await fetchPatientByUserId(user.id)

  // A signed-in user with no patients row can't be sent to /login — middleware
  // bounces signed-in users to /cases, whose layout sends them straight back
  // here, looping forever. Surface it via error.tsx instead.
  if (!patient) throw new Error(`No patients row for user ${user.id}`)

  // Already completed setup — send to dashboard
  if (patient.date_of_birth && patient.emergency_contact_name) {
    redirect('/dashboard')
  }

  return <ProfileSetupWizard patient={patient} userEmail={user.email ?? ''} />
}
