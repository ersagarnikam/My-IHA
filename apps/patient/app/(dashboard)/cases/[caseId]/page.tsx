import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { getAuthUser } from '@iha/db/server'
import { fetchCaseForCurrentUser, fetchCaseDocumentsForCase } from '@/lib/repositories/cases'
import { fetchTreatmentOptionsForCurrentCase } from '@/lib/repositories/treatments'
import { fetchConsultationRequestsForOptions } from '@/lib/repositories/consultations'
import { fetchVisaSubmissionForCase, fetchSentHospitalDocumentsForCase, fetchApprovedVisaDocumentForCase, type HospitalLetterType } from '@iha/db/visa'
import { fetchNotificationsForCase } from '@iha/db/notifications'
import { fetchSpecialtyLabelMap } from '@iha/db/specialties'
import { CaseStatusBadge } from '@/components/cases/case-status-badge'
import { CaseStatusListener } from '@/components/cases/case-status-listener'
import { ConsultationRequestsListener } from '@/components/treatments/consultation-requests-listener'
import { StatusTimeline } from '@/components/cases/status-timeline'
import { CaseTimeline } from '@/components/cases/case-timeline'
import { CaseDocumentsSection } from '@/components/cases/case-documents-section'
import { CaseLettersSection } from '@/components/cases/case-letters-section'
import { ApprovedVisaBanner } from '@/components/visa/approved-visa-banner'
import { TravelAssistanceSection } from '@/components/cases/travel-assistance-section'
import { TreatmentOptionsSection } from '@/components/treatments/treatment-options-section'
import { getSpecialtyLabel } from '@/lib/specialty-label'

const TREATMENT_STATUSES = ['treatment_plan', 'treatment_confirmed', 'payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'visa_rejected', 'completed']
const VISA_STATUSES = ['payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'visa_rejected', 'completed']
const REQUIRED_HOSPITAL_LETTERS: HospitalLetterType[] = ['hospital_invitation', 'appointment_confirmation']

// Mirrors dashboard/page.tsx's VISA_STATUS_KEYS/getVisaDisplay so the same
// translated, properly-capitalized labels show on both pages.
const VISA_STATUS_KEYS = new Set([
  'documents_submitted', 'under_review', 'additional_docs_requested',
  'application_submitted', 'processing', 'approved', 'rejected',
])

type TFunc = Awaited<ReturnType<typeof getTranslations>>

function capitalize(s: string) {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function getVisaStatusLabel(status: string, tDash: TFunc) {
  return VISA_STATUS_KEYS.has(status) ? tDash(`visaStatus.${status}`) : capitalize(status.replace(/_/g, ' '))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params

  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [caseData, documents, notificationsResult, t, tDash, locale, specialtyLabelMap] = await Promise.all([
    fetchCaseForCurrentUser(caseId),
    fetchCaseDocumentsForCase(caseId),
    fetchNotificationsForCase(caseId, user.id),
    getTranslations('caseDetail'),
    getTranslations('dashboard'),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  if (!caseData) notFound()

  const notifications = notificationsResult.data

  const needsTreatment = TREATMENT_STATUSES.includes(caseData.status)
  const needsVisa = VISA_STATUSES.includes(caseData.status)

  const [treatmentOptions, visaSubmission, hospitalLetters, approvedVisaDocument] = await Promise.all([
    needsTreatment ? fetchTreatmentOptionsForCurrentCase(caseId) : Promise.resolve([]),
    needsVisa ? fetchVisaSubmissionForCase(caseId).then((r) => r.data) : Promise.resolve(null),
    needsVisa ? fetchSentHospitalDocumentsForCase(caseId).then((r) => r.data) : Promise.resolve([]),
    needsVisa ? fetchApprovedVisaDocumentForCase(caseId).then((r) => r.data) : Promise.resolve(null),
  ])

  const consultationsByOption = needsTreatment
    ? await fetchConsultationRequestsForOptions(treatmentOptions.map((o) => o.id))
    : {}

  const displaySpecialty =
    caseData.specialty === 'Other' && caseData.specialty_other
      ? caseData.specialty_other
      : getSpecialtyLabel(caseData.specialty, locale, specialtyLabelMap)

  return (
    <div className="space-y-6">
      <CaseStatusListener caseId={caseData.id} />
      <ConsultationRequestsListener caseId={caseData.id} />

      {/* Back link + header */}
      <div>
        <Link
          href="/cases"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{caseData.reference_number}</h1>
              <CaseStatusBadge status={caseData.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{displaySpecialty}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t('submitted')} {formatDate(caseData.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Approved visa — highlighted at the top so it's never missed */}
      {approvedVisaDocument && <ApprovedVisaBanner document={approvedVisaDocument} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          {/* Documents */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">{t('uploadedDocuments')}</h2>
            <CaseDocumentsSection
              documents={documents}
              caseId={caseData.id}
              caseStatus={caseData.status}
            />
          </section>

          {/* Condition description */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">{t('conditionDescription')}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {caseData.description}
            </p>
          </section>

          {/* Treatment Options — Section 3 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">{t('treatmentOptions')}</h2>
            {needsTreatment ? (
              <TreatmentOptionsSection
                options={treatmentOptions}
                caseId={caseData.id}
                caseStatus={caseData.status}
                consultations={consultationsByOption}
                specialtyLabelMap={specialtyLabelMap}
              />
            ) : (
              <p className="text-sm text-slate-400">{t('treatmentPending')}</p>
            )}
          </section>

          {/* Visa & Travel — visible only after payment_confirmed */}
          {needsVisa && (() => {
            const receivedLetterTypes = new Set(hospitalLetters.map((d) => d.category))
            const canStartVisaApplication = REQUIRED_HOSPITAL_LETTERS.every((letterType) => receivedLetterTypes.has(letterType))
            const needsToStart = !visaSubmission || visaSubmission.status === 'not_started'
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">{t('visaTravel')}</h2>
                  <div className="flex shrink-0 items-center gap-3">
                    {visaSubmission && (
                      <Link
                        href={`/visa-travel/${visaSubmission.id}`}
                        className="text-sm font-medium text-cyan-600 hover:text-cyan-800"
                      >
                        {t('viewDetails')}
                      </Link>
                    )}
                    {needsToStart && (
                      canStartVisaApplication ? (
                        <Link
                          href={`/cases/${caseData.id}/visa`}
                          className="inline-flex items-center rounded-lg bg-cyan-700 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-cyan-800"
                        >
                          {t('startVisaApplication')}
                        </Link>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-400"
                          title={t('startVisaApplicationLocked')}
                        >
                          {t('startVisaApplication')}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {visaSubmission
                    ? `${t('visaStatus')} ${getVisaStatusLabel(visaSubmission.status, tDash)}`
                    : needsToStart && !canStartVisaApplication
                      ? t('visaApplicationLockedDesc')
                      : t('visaApplicationDesc')}
                </p>
                <CaseLettersSection documents={hospitalLetters} />
              </section>
            )
          })()}

          {/* Travel assistance — visible once travel ready */}
          {caseData.status === 'travel_ready' && (
            <TravelAssistanceSection
              caseId={caseData.id}
              needTravelAssistance={caseData.need_travel_assistance}
              needStayBookingAssistance={caseData.need_stay_booking_assistance}
              needTransportationAssistance={caseData.need_transportation_assistance}
            />
          )}

          {/* Timeline */}
          <CaseTimeline notifications={notifications} />
        </div>

        {/* Sidebar: Status Timeline */}
        <aside className="rounded-xl border border-slate-200 bg-white p-5 lg:self-start">
          <h2 className="mb-4 text-base font-semibold text-slate-900">{t('statusTimeline')}</h2>
          <StatusTimeline caseData={caseData} />
        </aside>
      </div>
    </div>
  )
}
