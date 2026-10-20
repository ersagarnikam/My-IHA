import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAuthUser } from '@iha/db/server'
import { fetchCaseForCurrentUser } from '@/lib/repositories/cases'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { fetchVisaSubmissionForCase, fetchVisaDocuments, fetchSentHospitalDocumentsForCase, type HospitalLetterType } from '@iha/db/visa'
import { VisaPageClient } from '@/components/visa/visa-page-client'

export default async function VisaPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params

  const t = await getTranslations('visaForm')
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const caseData = await fetchCaseForCurrentUser(caseId)
  if (!caseData) notFound()

  const VISA_ALLOWED = ['payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed']
  if (!VISA_ALLOWED.includes(caseData.status)) {
    redirect(`/cases/${caseId}`)
  }

  const patient = await fetchPatientByUserId(user.id)

  if (!patient) notFound()

  const patientId = patient.id

  const { data: submission } = await fetchVisaSubmissionForCase(caseId)

  const needsToStart = !submission || submission.status === 'not_started'
  if (needsToStart) {
    const REQUIRED_HOSPITAL_LETTERS: HospitalLetterType[] = ['hospital_invitation', 'appointment_confirmation']
    const { data: hospitalLetters } = await fetchSentHospitalDocumentsForCase(caseId)
    const receivedLetterTypes = new Set(hospitalLetters.map((d) => d.category))
    const canStartVisaApplication = REQUIRED_HOSPITAL_LETTERS.every((letterType) => receivedLetterTypes.has(letterType))
    if (!canStartVisaApplication) {
      redirect(`/cases/${caseId}`)
    }
  }

  const documentsResult = submission ? await fetchVisaDocuments(submission.id) : null
  const documents = documentsResult?.data ?? []

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/cases/${caseId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {caseData.reference_number}
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{t('pageTitle')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('pageSubtitle')}</p>
      </div>

      <VisaPageClient
        caseId={caseId}
        patientId={patientId}
        userId={user.id}
        referenceNumber={caseData.reference_number}
        initialSubmission={submission}
        initialDocuments={documents ?? []}
        patient={patient}
        userEmail={user.email ?? ''}
      />
    </div>
  )
}
