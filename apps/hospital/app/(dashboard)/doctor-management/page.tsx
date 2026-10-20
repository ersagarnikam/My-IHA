import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchAffiliatedDoctors } from '@/lib/data/doctor-management'
import { DoctorManagementTable } from '@/components/doctor-management/doctor-management-table'

export default async function DoctorManagementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/dashboard')

  const { data: doctors, error } = await fetchAffiliatedDoctors(account.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Doctor Management</h1>
        <p className="mt-0.5 text-sm text-slate-500">Doctors affiliated with your hospital.</p>
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-red-600">Couldn&apos;t load doctors: {error}</p>
      ) : (
        <DoctorManagementTable doctors={doctors} />
      )}
    </div>
  )
}
