import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '../../../components/Toasts'
import { Badge, ErrorState, FileDrop, FormError, Loading } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { ApiError, apiPost, openFile } from '../../../lib/api'
import { useFormat, useSpecialtyLabel } from '../../../lib/format'
import { useRealtime } from '../../../lib/realtime'
import type {
  VisaDocument,
  VisaFormData,
  VisaRequest,
  VisaSubmissionSummary,
} from '../../../lib/types'
import { useApi } from '../../../lib/useApi'
import { ApprovedVisaBanner } from '../CaseDetailPage'
import { UPLOADABLE_VISA_CATEGORIES } from '../DocumentsPage'
import { usePatient } from '../PatientContext'
import { VISA_TONE } from './VisaTravelPage'

/** The application form grouped into the old SECTION_KEYS. */
export const FORM_SECTIONS: Record<string, string[]> = {
  travelerDetails: [
    'first_name',
    'last_name',
    'gender',
    'nationality',
    'date_of_birth',
    'passport_number',
    'passport_expiry',
    'email',
    'phone',
    'australian_provider_details',
  ],
  medicalInformation: [
    'condition_summary',
    'has_medical_conditions',
    'medical_conditions_details',
    'health_examination_completed',
  ],
  australianProviderDetails: [
    'provider_name',
    'provider_organization',
    'provider_address',
    'provider_contact',
  ],
  financialDetails: [
    'source_of_funds',
    'bank_balance',
    'sponsor_name',
    'sponsor_relationship',
    'sponsor_contact',
  ],
  travelDetails: [
    'arrival_date',
    'departure_date',
    'purpose_of_visit',
    'flight_booking',
    'accommodation',
  ],
  legalCompliance: [
    'criminal_record',
    'criminal_record_details',
    'previous_visa_issues',
    'previous_visa_issues_details',
  ],
  companionDetails: [
    'travelling_with_companion',
    'companion_name',
    'companion_relationship',
    'companion_passport_number',
    'companion_passport_expiry',
  ],
}

type Detail = {
  submission: VisaSubmissionSummary
  form: VisaFormData | null
  documents: VisaDocument[]
  openRequests: VisaRequest[]
  uploadsLocked: boolean
}

export function VisaDetailPage() {
  const t = useT('visaDetail')
  const { submissionId } = useParams()
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const detail = useApi<Detail>(`/api/patient/visa-submissions/${submissionId}`)
  useRealtime<{ caseId: string | null }>('notification', (n) => {
    if (n.caseId === detail.data?.submission.caseId) void detail.reload()
  })

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const { submission, form, documents, openRequests, uploadsLocked } = detail.data
  const approved = documents.find((d) => d.category === 'approved_visa')

  return (
    <section className="stack">
      <Link to="/patient/visa-travel?tab=visa" className="muted small">
        ← {t('backToVisaManagement')}
      </Link>
      <div className="page-header">
        <div>
          <p className="case-ref">{submission.caseReference}</p>
          <h1>
            {t('applicationTitle')} —{' '}
            {submission.specialty
              ? specialtyLabel({
                  specialty: submission.specialty,
                  specialtyOther: submission.specialtyOther,
                })
              : t('defaultSpecialty')}
          </h1>
          <p className="muted small">{t('visaSubclassLabel')}</p>
        </div>
        <Badge tone={VISA_TONE[submission.status] ?? 'info'}>
          {t(`statusBadge.${submission.status}`)}
        </Badge>
      </div>
      {submission.status === 'rejected' && submission.rejectionReason && (
        <div className="banner banner-bad">
          <strong>{t('rejectionReason')}</strong> {submission.rejectionReason}
        </div>
      )}
      {approved && <ApprovedVisaBanner document={approved} />}
      <VisaDocumentsCard
        submissionId={submission.id}
        documents={documents}
        openRequests={openRequests}
        locked={uploadsLocked}
        onChanged={detail.reload}
      />
      {form && <FormSummary form={form} />}
    </section>
  )
}

export function FormSummary({ form }: { form: VisaFormData }) {
  const t = useT('visaDetail')
  return (
    <div className="stack">
      {Object.entries(FORM_SECTIONS).map(([section, fields]) => {
        const filled = fields.filter((f) => form[f])
        if (!filled.length) return null
        return (
          <section key={section} className="card">
            <h2>{t(`sections.${section}`)}</h2>
            <dl className="details grid-2">
              {filled.map((f) => (
                <div key={f}>
                  <dt className="small muted">{t(`fields.${f}`)}</dt>
                  <dd className="prewrap">{form[f]}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

function VisaDocumentsCard({
  submissionId,
  documents,
  openRequests,
  locked,
  onChanged,
}: {
  submissionId: string
  documents: VisaDocument[]
  openRequests: VisaRequest[]
  locked: boolean
  onChanged: () => void
}) {
  const t = useT('visaDetail.documents')
  const format = useFormat()
  const toast = useToast()
  const [category, setCategory] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function upload(files: File[]) {
    const file = files[0]
    if (!file || !category) return
    if (file.size > 10 * 1024 * 1024) return setError(new ApiError(400, 'size', t('fileTooLarge')))
    setPending(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('category', category)
      form.append('file', file)
      await apiPost(`/api/patient/visa-submissions/${submissionId}/documents`, form)
      toast({ title: t('documentUploaded'), tone: 'good' })
      setCategory(null)
      onChanged()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'passport_photo_ratio'
          ? new ApiError(400, err.code, t('invalidPhotoDimensions'))
          : err,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card stack">
      <div className="row-between">
        <h2>{t('title')}</h2>
        {!locked && category === null && (
          <button
            type="button"
            className="button-secondary"
            onClick={() => setCategory(openRequests[0]?.category ?? 'passport')}
          >
            + {t('addDocuments')}
          </button>
        )}
      </div>
      {openRequests.length > 0 && (
        <ul className="plain-list">
          {openRequests.map((r) => (
            <li key={r.id} className="notice row-between">
              <span>
                <Badge tone="warn">{t('requested')}</Badge> {t(`docCategories.${r.category}`)}
                {r.instructions && <span className="small block">{r.instructions}</span>}
              </span>
              {!locked && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setCategory(r.category)}
                >
                  {t('upload')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {documents.length === 0 ? (
        <p className="muted">{t('noDocuments')}</p>
      ) : (
        <ul className="doc-list">
          {documents.map((d) => (
            <li key={d.id}>
              <div>
                <p>{t(`docCategories.${d.category}`)}</p>
                <p className="muted small">
                  {d.fileName} · {format.date(d.uploadedAt)}{' '}
                  {d.requestedByLawyer && <Badge tone="warn">{t('requested')}</Badge>}
                </p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  openFile(
                    `/api/patient/documents/visa/${d.id}/content?download=true`,
                    d.fileName,
                  ).catch(() => setError(new ApiError(500, 'download', t('downloadFailed'))))
                }
              >
                {t('download')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {locked && <p className="muted small">{t('uploadWindowClosed')}</p>}
      {category !== null && (
        <div className="panel stack">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {UPLOADABLE_VISA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`docCategories.${c}`)}
              </option>
            ))}
          </select>
          <FileDrop
            multiple={false}
            onFiles={upload}
            label={pending ? t('uploading') : t('chooseFile')}
            disabled={pending}
          />
          <button type="button" className="button-secondary" onClick={() => setCategory(null)}>
            {t('cancel')}
          </button>
        </div>
      )}
      <FormError error={error} />
    </section>
  )
}
