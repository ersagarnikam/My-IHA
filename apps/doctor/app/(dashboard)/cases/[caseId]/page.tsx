import Image from 'next/image'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { fetchCaseById, fetchDocumentsByCase } from '@iha/db/cases'
import { fetchAssignmentForCase } from '@iha/db/case-assignments'
import { fetchPatientForCase } from '@iha/db/patients'
import { fetchTreatmentPlanForCase } from '@iha/db/treatment-plans'
import { fetchConsultationRequestsForCase } from '@iha/db/consultations'
import { Card, CardContent, CardHeader, CardTitle, CaseRowStatusBadge, CaseDocumentsList } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { CaseAssignmentActions } from '@/components/cases/case-assignment-actions'
import { CaseWorkflowActions } from '@/components/cases/case-workflow-actions'
import { RequestAdditionalInfoDialog } from '@/components/cases/request-additional-info-dialog'
import type { AssignmentStatus } from '@/types'

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function CaseDetailPage({
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
  if (!account) redirect('/register')
  if (account.role === 'hospital') notFound()

  const [
    { data: assignment },
    { data: caseRow },
    { data: documents },
    { data: treatmentPlan },
    { data: consultationRequests },
  ] = await Promise.all([
    fetchAssignmentForCase(caseId, account.id),
    fetchCaseById(caseId),
    fetchDocumentsByCase(caseId),
    fetchTreatmentPlanForCase(caseId, account.id),
    fetchConsultationRequestsForCase(caseId),
  ])

  if (!assignment || !caseRow) notFound()

  const { data: patient } = await fetchPatientForCase(caseRow.patient_id)

  const canRequestInfo = assignment.status === 'accepted' && caseRow.status === 'evaluation'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/cases"
          aria-label="Back to My Cases"
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
        </CardContent>
      </Card>

      {/* SENSITIVE: renders patient.medical_history — never log this value */}
      {patient?.medical_history && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medical History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{patient.medical_history}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Uploaded Documents</CardTitle>
          {canRequestInfo && <RequestAdditionalInfoDialog caseId={caseId} />}
        </CardHeader>
        <CardContent>
          <CaseDocumentsList documents={documents} />
        </CardContent>
      </Card>

      {consultationRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consultation Request</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {consultationRequests.map((request) => (
              <Link
                key={request.id}
                href={`/consultations/${request.id}`}
                className="inline-flex h-9 items-center rounded-md bg-cyan-700 px-4 text-sm font-medium text-white hover:bg-cyan-800"
              >
                View Consultation
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <CaseAssignmentActions
          assignmentId={assignment.id}
          caseId={caseId}
          status={assignment.status as AssignmentStatus}
        />
        {assignment.status === 'accepted' && (
          <CaseWorkflowActions
            caseId={caseId}
            caseStatus={caseRow.status}
            evaluationStartedAt={assignment.evaluation_started_at}
            planSubmittedAt={assignment.plan_submitted_at}
            treatmentEndDate={treatmentPlan?.treatment_end_date ?? null}
          />
        )}
      </div>
    </div>
  )
}
