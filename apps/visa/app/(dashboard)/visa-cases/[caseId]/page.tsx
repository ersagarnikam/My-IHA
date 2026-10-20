import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  DollarSign,
  FileQuestion,
  FileText,
  HeartPulse,
  Plane,
  Scale,
  StickyNote,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import { createClient } from '@iha/db/server'
import { createVisaDocumentSignedUrl } from '@iha/db/visa'
import { Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchCaseDetailForLawyer, fetchCaseNotes } from '@/lib/data/cases'
import { fetchVisaDocumentsForCase, fetchDocumentRequestsForCase } from '@/lib/data/documents'
import { VisaStatusBadge } from '@/components/cases/visa-status-badge'
import { UpdateStatusDialog } from '@/components/cases/update-status-dialog'
import { RequestDocumentDialog } from '@/components/cases/request-document-dialog'
import { getDocumentCategoryLabel } from '@/components/cases/document-category-labels'
import { CollapsibleSection } from '@/components/cases/collapsible-section'
import { VisaDocumentsList } from '@/components/cases/visa-documents-list'
import { CaseNotesSection } from '@/components/cases/case-notes-section'

// Mirrors UPLOAD_LOCKED_STATUSES in
// apps/patient/components/visa/visa-detail-documents.tsx — once the patient's
// upload window is closed, a lawyer-side document request could never be
// fulfilled, so the request UI closes in lockstep.
const DOCUMENT_REQUESTS_CLOSED_STATUSES = new Set(['application_submitted', 'processing', 'approved', 'rejected'])

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <Icon className="h-4 w-4 text-cyan-700" />
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

export default async function VisaCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const { data: detail } = await fetchCaseDetailForLawyer(caseId)
  if (!detail) notFound()

  const [{ data: documents }, { data: requests }, { data: notes }] = await Promise.all([
    fetchVisaDocumentsForCase(caseId),
    fetchDocumentRequestsForCase(caseId),
    fetchCaseNotes(caseId),
  ])

  const documentsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      const { url } = await createVisaDocumentSignedUrl(doc.file_path)
      return { ...doc, signedUrl: url }
    }),
  )
  // Fulfilled requests aren't shown separately — the uploaded document itself
  // (already in documentsWithUrls) is the confirmation.
  const pendingRequests = requests.filter((r) => !r.fulfilled)

  const form = detail.formData ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link
          href="/visa-cases"
          aria-label="Back to Visa Cases"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex flex-1 flex-wrap items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-cyan-700 to-cyan-600 px-6 py-5 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-lg font-semibold shadow-lg ring-4 ring-white">
              {detail.patient?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.patient.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (detail.patient?.full_name ?? '?').charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold">{detail.patient?.full_name ?? 'Patient'}</h1>
              <p className="mt-0.5 text-sm text-cyan-50">{detail.case?.reference_number ?? 'Case'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <VisaStatusBadge status={detail.status} />
            <UpdateStatusDialog caseId={caseId} currentStatus={detail.status} />
          </div>
        </div>
      </div>

      <Section title="Patient Details" icon={User}>
        <Field label="Full Name" value={detail.patient?.full_name} />
        <Field label="Gender" value={detail.patient?.gender} />
        <Field label="Nationality" value={detail.patient?.nationality} />
        <Field label="Date of Birth" value={detail.patient?.date_of_birth} />
        <Field label="Country of Residence" value={detail.patient?.country_of_residence} />
        <Field label="Phone" value={detail.patient?.phone} />
        <Field label="Address" value={detail.patient?.address} />
      </Section>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Visa Application — Submitted by Patient
        </h2>
        <div className="space-y-3">
          <CollapsibleSection title="Traveler Details" icon={<User className="h-4 w-4 text-cyan-700" />} defaultOpen>
            <Field label="First Name" value={form.first_name} />
            <Field label="Last Name" value={form.last_name} />
            <Field label="Gender" value={form.gender} />
            <Field label="Nationality" value={form.nationality} />
            <Field label="Date of Birth" value={form.date_of_birth} />
            <Field label="Passport Number" value={form.passport_number} />
            <Field label="Passport Expiry" value={form.passport_expiry} />
            <Field label="Email" value={form.email} />
            <Field label="Phone" value={form.phone} />
          </CollapsibleSection>

          <CollapsibleSection title="Medical Information" icon={<HeartPulse className="h-4 w-4 text-cyan-700" />}>
            <Field label="Condition Summary" value={form.condition_summary} />
            <Field label="Pre-existing Medical Conditions" value={form.has_medical_conditions} />
            <Field label="Medical Conditions Details" value={form.medical_conditions_details} />
            <Field label="Health Examination Completed" value={form.health_examination_completed} />
          </CollapsibleSection>

          <CollapsibleSection title="Australian Provider Details" icon={<Building2 className="h-4 w-4 text-cyan-700" />}>
            <Field label="Provider Name" value={form.provider_name} />
            <Field label="Organization" value={form.provider_organization} />
            <Field label="Address" value={form.provider_address} />
            <Field label="Contact" value={form.provider_contact} />
          </CollapsibleSection>

          <CollapsibleSection title="Financial Details" icon={<DollarSign className="h-4 w-4 text-cyan-700" />}>
            <Field label="Source of Funds" value={form.source_of_funds} />
            <Field label="Bank Balance" value={form.bank_balance} />
            <Field label="Sponsor Name" value={form.sponsor_name} />
            <Field label="Sponsor Relationship" value={form.sponsor_relationship} />
            <Field label="Sponsor Contact" value={form.sponsor_contact} />
          </CollapsibleSection>

          <CollapsibleSection title="Travel Details" icon={<Plane className="h-4 w-4 text-cyan-700" />}>
            <Field label="Arrival Date" value={form.arrival_date} />
            <Field label="Departure Date" value={form.departure_date} />
            <Field label="Purpose of Visit" value={form.purpose_of_visit} />
            <Field label="Flight Booking" value={form.flight_booking} />
            <Field label="Accommodation" value={form.accommodation} />
          </CollapsibleSection>

          <CollapsibleSection title="Legal & Compliance" icon={<Scale className="h-4 w-4 text-cyan-700" />}>
            <Field label="Criminal Record" value={form.criminal_record} />
            <Field label="Criminal Record Details" value={form.criminal_record_details} />
            <Field label="Previous Visa Issues" value={form.previous_visa_issues} />
            <Field label="Previous Visa Issues Details" value={form.previous_visa_issues_details} />
          </CollapsibleSection>

          {form.travelling_with_companion === 'Yes' && (
            <CollapsibleSection title="Companion Details" icon={<Users className="h-4 w-4 text-cyan-700" />}>
              <Field label="Companion Name" value={form.companion_name} />
              <Field label="Relationship" value={form.companion_relationship} />
              <Field label="Companion Passport Number" value={form.companion_passport_number} />
              <Field label="Companion Passport Expiry" value={form.companion_passport_expiry} />
            </CollapsibleSection>
          )}
        </div>
      </div>

      {detail.rejectionReason && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base text-red-700">
              <StickyNote className="h-4 w-4" />
              Rejection Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-800">{detail.rejectionReason}</p>
          </CardContent>
        </Card>
      )}

      <CaseNotesSection caseId={caseId} initialNotes={notes} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <FileText className="h-4 w-4 text-cyan-700" />
              Documents
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {documentsWithUrls.length}
              </span>
            </CardTitle>
            {detail.status === 'documents_submitted' ? (
              <p className="text-xs text-slate-400">Change status to "Under Review" to request documents.</p>
            ) : DOCUMENT_REQUESTS_CLOSED_STATUSES.has(detail.status) ? (
              <p className="text-xs text-slate-400">Document requests are closed once the application is submitted for processing.</p>
            ) : (
              <RequestDocumentDialog caseId={caseId} />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {documentsWithUrls.length === 0 && pendingRequests.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No documents submitted yet.</p>
          ) : (
            <>
              <VisaDocumentsList documents={documentsWithUrls} />

              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                      <FileQuestion className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{request.document_type}</p>
                      <p className="truncate text-xs text-slate-500">
                        {getDocumentCategoryLabel(request.category)}
                        {request.instructions ? ` — ${request.instructions}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    Requested
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Section title="Hospital & Doctor Treatment Plan" icon={Stethoscope}>
        <Field label="Case Specialty" value={detail.case?.specialty_other || detail.case?.specialty} />
        <Field label="Hospital" value={detail.treatmentPlan?.hospital} />
        <Field label="Doctor" value={detail.treatmentPlan?.doctor} />
        <Field label="Doctor Specialty" value={detail.treatmentPlan?.doctorSpecialties?.join(', ')} />
        <Field label="Procedure / Treatment" value={detail.treatmentPlan?.procedureName} />
        <Field label="Treatment Start Date" value={detail.treatmentPlan?.treatmentStartDate} />
        <Field label="Treatment End Date" value={detail.treatmentPlan?.treatmentEndDate} />
      </Section>
    </div>
  )
}
