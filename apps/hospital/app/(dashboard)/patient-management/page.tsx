import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchPatientsForHospitalDoctors } from '@/lib/data/patient-management'
import { PatientManagementTable } from '@/components/patient-management/patient-management-table'

export default async function PatientManagementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/dashboard')

  const { data: patients, error } = await fetchPatientsForHospitalDoctors(account.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Patient Management</h1>
        <p className="mt-0.5 text-sm text-slate-500">Patients with cases assigned to your hospital by affiliated doctors.</p>
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-red-600">Couldn&apos;t load patients: {error}</p>
      ) : (
        <PatientManagementTable patients={patients} />
      )}
    </div>
  )
}
