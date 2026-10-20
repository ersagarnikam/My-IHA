import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAuthUser } from '@iha/db/server'
import { fetchVisaSubmissionWithCaseDetail, fetchVisaDocuments, fetchDocumentRequestsForCase } from '@iha/db/visa'
import { fetchSpecialtyLabelMap } from '@iha/db/specialties'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import { VisaDetailDocuments } from '@/components/visa/visa-detail-documents'
import { ApprovedVisaBanner } from '@/components/visa/approved-visa-banner'

const SECTION_KEYS = [
  {
    titleKey: 'travelerDetails' as const,
    fieldKeys: ['first_name', 'last_name', 'gender', 'nationality', 'date_of_birth', 'passport_number', 'passport_expiry', 'email', 'phone', 'australian_provider_details'] as const,
  },
  {
    titleKey: 'medicalInformation' as const,
    fieldKeys: ['condition_summary', 'has_medical_conditions', 'medical_conditions_details', 'health_examination_completed'] as const,
  },
  {
    titleKey: 'australianProviderDetails' as const,
    fieldKeys: ['provider_name', 'provider_organization', 'provider_address', 'provider_contact'] as const,
  },
  {
    titleKey: 'financialDetails' as const,
    fieldKeys: ['source_of_funds', 'bank_balance', 'sponsor_name', 'sponsor_relationship', 'sponsor_contact'] as const,
  },
  {
    titleKey: 'travelDetails' as const,
    fieldKeys: ['arrival_date', 'departure_date', 'purpose_of_visit', 'flight_booking', 'accommodation'] as const,
  },
  {
    titleKey: 'legalCompliance' as const,
    fieldKeys: ['criminal_record', 'criminal_record_details', 'previous_visa_issues', 'previous_visa_issues_details'] as const,
  },
  {
    titleKey: 'companionDetails' as const,
    fieldKeys: ['travelling_with_companion', 'companion_name', 'companion_relationship', 'companion_passport_number', 'companion_passport_expiry'] as const,
  },
]

const STATUS_CLASS: Record<string, string> = {
  not_started:               'bg-slate-100 text-slate-600',
  documents_submitted:       'bg-blue-100 text-blue-700',
  under_review:              'bg-blue-100 text-blue-700',
  additional_docs_requested: 'bg-orange-100 text-orange-700',
  application_submitted:     'bg-purple-100 text-purple-700',
  processing:                'bg-purple-100 text-purple-700',
  approved:                  'bg-emerald-100 text-emerald-700',
  rejected:                  'bg-red-100 text-red-700',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function VisaDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>
}) {
  const { submissionId } = await params

  const t = await getTranslations('visaDetail')
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [{ data: submission }, { data: documents }, locale, specialtyLabelMap] = await Promise.all([
    fetchVisaSubmissionWithCaseDetail(submissionId),
    fetchVisaDocuments(submissionId),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  if (!submission) notFound()

  const { data: documentRequests } = await fetchDocumentRequestsForCase(submission.case_id)
  // With multiple open requests, list every unfulfilled one so an earlier
  // request doesn't look like it was overwritten by a newer one.
  const pendingDocumentRequests = documentRequests.filter((r) => !r.fulfilled)

  const approvedVisaDocument = (documents ?? []).find((d) => d.category === 'approved_visa') ?? null
  const otherDocuments = (documents ?? []).filter((d) => d.category !== 'approved_visa')

  const formData = (submission.form_data ?? {}) as Record<string, string>
  const badgeClass = STATUS_CLASS[submission.status] ?? 'bg-slate-100 text-slate-600'
  const badgeLabel = submission.status in STATUS_CLASS
    ? t(`statusBadge.${submission.status}` as never)
    : submission.status
  const specialtyLabel = submission.cases?.specialty
    ? getSpecialtyLabel(submission.cases.specialty, locale, specialtyLabelMap)
    : t('defaultSpecialty')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/visa-travel?tab=visa"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToVisaManagement')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {specialtyLabel} — {t('applicationTitle')}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {submission.cases?.reference_number ?? '—'} · {t('visaSubclassLabel')}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* Rejection reason */}
      {submission.status === 'rejected' && submission.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">{t('rejectionReason')} </span>{submission.rejection_reason}
        </div>
      )}

      {/* Approved visa — highlighted at the top so it's never missed */}
      {approvedVisaDocument && <ApprovedVisaBanner document={approvedVisaDocument} />}

      {/* Form data sections */}
      <div className="space-y-4">
        {SECTION_KEYS.map((section) => {
          const filled = section.fieldKeys.filter((key) => formData[key]?.trim())
          if (filled.length === 0) return null
          return (
            <div key={section.titleKey} className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-700">{t(`sections.${section.titleKey}`)}</h2>
              </div>
              <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                {filled.map((key) => (
                  <div key={key}>
                    <p className="text-xs text-slate-400">{t(`fields.${key}` as never)}</p>
                    <p className="mt-0.5 text-sm text-slate-800 whitespace-pre-wrap">{formData[key]}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Documents — interactive upload/download */}
      <VisaDetailDocuments
        submissionId={submissionId}
        caseId={submission.case_id}
        userId={user.id}
        status={submission.status}
        initialDocuments={otherDocuments}
        pendingRequests={pendingDocumentRequests}
      />
    </div>
  )
}
