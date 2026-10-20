import Image from 'next/image'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { fetchCaseById } from '@iha/db/cases'
import { fetchPatientForCase } from '@iha/db/patients'
import { fetchTreatmentPlanForCase, fetchTreatmentPlanStatusesForHospital } from '@iha/db/treatment-plans'
import { Card, CardContent, CardHeader, CardTitle, CaseRowStatusBadge, TreatmentPlanSummary } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import {
  fetchAssignmentForHospitalCase,
  fetchHospitalAssignmentById,
  VISA_ELIGIBLE_STATUSES,
} from '@/lib/data/case-management'
import { VisaLettersSection } from '@/components/cases/visa-letters-section'
import { fetchHospitalGeneratedDocumentsForCase } from '@iha/db/visa'
import { createLogger } from '@iha/logger'

const logger = createLogger('hospital:case-management-detail')

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function HospitalCaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>
  searchParams: Promise<{ assignmentId?: string }>
}) {
  const { caseId } = await params
  const { assignmentId } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/cases')

  // A case can be routed to two of this hospital's own doctors in parallel
  // (one plan later confirmed, the other closed out) — the list page passes
  // ?assignmentId= to say exactly which row was clicked, so viewing the
  // closed one doesn't show the confirmed one's details. Anything landing
  // here without it (notifications, dashboard shortcuts) falls back to
  // "whichever assignment has the confirmed plan, else the latest invited".
  const { data: assignmentById } = assignmentId ? await fetchHospitalAssignmentById(assignmentId) : { data: null }
  const { data: fallbackAssignment } = assignmentById ? { data: null } : await fetchAssignmentForHospitalCase(caseId)
  const assignment = assignmentById?.case_id === caseId ? assignmentById : fallbackAssignment
  if (!assignment) notFound()

  const [{ data: caseRow }, { data: planStatuses }, { data: visaLetters }] = await Promise.all([
    fetchCaseById(caseId),
    fetchTreatmentPlanStatusesForHospital(account.id),
    fetchHospitalGeneratedDocumentsForCase(caseId),
  ])

  if (!caseRow) notFound()

  const [{ data: patient }, { data: plan, error: planError }] = await Promise.all([
    fetchPatientForCase(caseRow.patient_id),
    fetchTreatmentPlanForCase(caseId, assignment.doctor_id),
  ])
  if (planError) {
    logger.error({ err: planError, caseId, doctorId: assignment.doctor_id }, 'fetchTreatmentPlanForCase failed')
  }
  const treatmentPlanStatus =
    planStatuses.find((p) => p.case_id === caseId && p.doctor_id === assignment.doctor_id)?.status ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/case-management"
          aria-label="Back to Case Management"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Case Details</h1>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm font-medium text-slate-500">
            Case ID: <span className="font-semibold text-slate-900">{caseRow.reference_number}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <CaseRowStatusBadge
              assignmentStatus={assignment.status}
              caseStatus={caseRow.status}
              planSubmittedAt={assignment.plan_submitted_at}
              treatmentPlanStatus={treatmentPlanStatus}
            />
          </div>
        </CardContent>
      </Card>

      {patient && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {patient.avatar_url ? (
                <Image
                  src={patient.avatar_url}
                  alt={patient.full_name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cyan-100 text-base font-semibold text-cyan-800">
                  {patient.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-sm font-semibold text-slate-900">{patient.full_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Medical Condition</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {caseRow.specialty_other || caseRow.specialty}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Date of Birth</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {formatDate(patient.date_of_birth) ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Gender</p>
                <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">{patient.gender ?? '—'}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Globe2 className="h-3 w-3" />
                  Country
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{patient.country_of_residence ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-slate-400">Condition</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">
              {caseRow.specialty_other || caseRow.specialty}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Symptoms:</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{caseRow.description}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Assigned Doctor</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">{assignment.doctors?.full_name ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      {plan && <TreatmentPlanSummary plan={plan} />}

      {VISA_ELIGIBLE_STATUSES.includes(caseRow.status) && treatmentPlanStatus === 'patient_confirmed' && (
        <VisaLettersSection caseId={caseId} documents={visaLetters} />
      )}
    </div>
  )
}
