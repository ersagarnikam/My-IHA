import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { CaseSubmissionWizard } from '@/components/cases/case-submission-wizard'

export default async function NewCasePage() {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const patient = await fetchPatientByUserId(user.id)
  if (!patient) redirect('/login')

  // Block if profile incomplete
  if (!patient.date_of_birth || !patient.emergency_contact_name) {
    redirect('/profile/setup')
  }

  const { data: specialties } = await fetchActiveSpecialties()

  return (
    <div className="w-full">
      <CaseSubmissionWizard patientId={patient.id} specialties={specialties} />
    </div>
  )
}
