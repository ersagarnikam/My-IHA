import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { fetchCaseById } from '@iha/db/cases'
import { fetchAssignmentForCase } from '@iha/db/case-assignments'
import { fetchTreatmentPlanForCase } from '@iha/db/treatment-plans'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchHospitalOptionsForDoctor } from '@/lib/data/hospitals'
import { TreatmentPlanForm } from '@/components/treatment-plan/treatment-plan-form'

export default async function TreatmentPlanPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account || account.role !== 'doctor') notFound()

  const [{ data: assignment }, { data: caseRow }] = await Promise.all([
    fetchAssignmentForCase(caseId, account.id),
    fetchCaseById(caseId),
  ])

  if (!assignment || !caseRow || assignment.status !== 'accepted') notFound()

  const [{ data: plan }, hospitalOptions] = await Promise.all([
    fetchTreatmentPlanForCase(caseId, account.id),
    fetchHospitalOptionsForDoctor(account.id),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/cases/${caseId}`}
          aria-label="Back to Case Details"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Treatment Plan</h1>
          <p className="text-sm text-slate-500">Case ID: {caseRow.reference_number}</p>
        </div>
      </div>

      <TreatmentPlanForm caseId={caseId} plan={plan} hospitalOptions={hospitalOptions} />
    </div>
  )
}
