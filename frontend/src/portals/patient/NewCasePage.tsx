import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Field, FileDrop, FormError, fieldError, Stepper } from '../../components/ui'
import { useLocale, useT } from '../../i18n/I18nContext'
import { ApiError, apiPost } from '../../lib/api'
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  MAX_FILES,
  MEDICAL_DOCUMENT_TYPES,
  type CaseSummary,
  type MedicalDocumentType,
} from '../../lib/cases'
import { drafts, useFormat } from '../../lib/format'
import { usePatient } from './PatientContext'

type PendingFile = { key: string; file: File; documentType: MedicalDocumentType }
type Draft = { specialty: string; specialtyOther: string; description: string }

/** Condition → documents → review, then a success screen (old CaseSubmissionWizard). */
export function NewCasePage() {
  const t = useT('caseWizard')
  const tTypes = useT('documentTypes')
  const tUpload = useT('documentUpload')
  const tDetail = useT('caseDetail')
  const { locale } = useLocale()
  const format = useFormat()
  const navigate = useNavigate()
  const { profile, specialties } = usePatient()
  const draftName = `case-wizard:${profile.id}`
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState<Draft>(
    () => drafts.load<Draft>(draftName) ?? { specialty: '', specialtyOther: '', description: '' },
  )
  const [files, setFiles] = useState<PendingFile[]>([])
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<CaseSummary | null>(null)

  const options = useMemo(
    () =>
      specialties.map((s) => ({ value: s.name, label: locale === 'zh' ? s.labelZh : s.labelEn })),
    [specialties, locale],
  )

  function update(patch: Partial<Draft>) {
    const next = { ...details, ...patch }
    setDetails(next)
    drafts.save(draftName, next)
  }

  function detailsError(): string | null {
    if (!details.specialty) return t('conditionDetails.validation.specialtyRequired')
    if (details.specialty === 'Other' && details.specialtyOther.trim().length < 2)
      return t('conditionDetails.validation.specialtyOtherRequired')
    if (details.description.trim().length < 50)
      return t('conditionDetails.validation.descriptionMinLength')
    if (details.description.length > 2000)
      return t('conditionDetails.validation.descriptionMaxLength')
    return null
  }

  function addFiles(picked: File[]) {
    const problems: string[] = []
    const ok = picked.filter((f) => {
      if (!ACCEPTED_MIME.includes(f.type))
        problems.push(tUpload('unsupportedFormat', { fileName: f.name }))
      else if (f.size > MAX_FILE_BYTES) problems.push(tUpload('fileTooLarge', { fileName: f.name }))
      else return true
      return false
    })
    const room = MAX_FILES - files.length
    if (ok.length > room) problems.push(tUpload('maxDocuments', { max: MAX_FILES }))
    setError(problems.length ? new ApiError(400, 'files', problems.join(' ')) : null)
    setFiles((current) => [
      ...current,
      ...ok
        .slice(0, room)
        .map((file) => ({ key: crypto.randomUUID(), file, documentType: 'other' as const })),
    ])
  }

  async function submit() {
    const form = new FormData()
    form.append('specialty', details.specialty)
    if (details.specialty === 'Other') form.append('specialtyOther', details.specialtyOther)
    form.append('description', details.description)
    for (const f of files) {
      form.append('files', f.file)
      form.append('documentTypes', f.documentType)
    }
    setPending(true)
    setError(null)
    try {
      setCreated(await apiPost<CaseSummary>('/api/patient/cases', form))
      drafts.clear(draftName)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  if (created)
    return (
      <SubmissionSuccess created={created} onDashboard={() => navigate('/patient/dashboard')} />
    )

  const specialtyLabel =
    details.specialty === 'Other'
      ? details.specialtyOther
      : options.find((o) => o.value === details.specialty)?.label

  return (
    <section className="stack narrow">
      <Link to="/patient/cases" className="muted small">
        ← {tDetail('back')}
      </Link>
      <h1>{t('title')}</h1>
      <Stepper
        steps={[t('steps.conditionDetails'), t('steps.uploadDocuments'), t('steps.reviewSubmit')]}
        current={step}
      />

      {step === 0 && (
        <div className="card stack">
          <h2>{t('conditionDetails.title')}</h2>
          <Field
            label={t('conditionDetails.medicalCondition')}
            error={fieldError(error, 'specialty')}
          >
            <select
              value={details.specialty}
              onChange={(e) => update({ specialty: e.target.value })}
              required
            >
              <option value="" disabled>
                {t('conditionDetails.selectCondition')}
              </option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {details.specialty === 'Other' && (
            <Field label={t('conditionDetails.describeCondition')}>
              <input
                value={details.specialtyOther}
                maxLength={100}
                placeholder={t('conditionDetails.describePlaceholder')}
                onChange={(e) => update({ specialtyOther: e.target.value })}
              />
            </Field>
          )}
          <Field
            label={t('conditionDetails.describeSymptoms')}
            hint={`${details.description.length} / 2000`}
          >
            <textarea
              rows={7}
              maxLength={2000}
              value={details.description}
              placeholder={t('conditionDetails.symptomsPlaceholder')}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <FormError error={error} />
          <div className="row-end">
            <button
              type="button"
              onClick={() => {
                const problem = detailsError()
                if (problem) setError(new ApiError(400, 'details', problem))
                else {
                  setError(null)
                  setStep(1)
                }
              }}
            >
              {t('conditionDetails.next')}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card stack">
          <h2>{t('documentUpload.title')}</h2>
          {files.length < MAX_FILES && (
            <FileDrop
              onFiles={addFiles}
              label={t('documentUpload.dragDrop')}
              hint={t('documentUpload.allowedTypes')}
            />
          )}
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.key}>
                <span className="file-name">
                  {f.file.name} <span className="muted small">({format.bytes(f.file.size)})</span>
                </span>
                <select
                  aria-label={f.file.name}
                  value={f.documentType}
                  onChange={(e) =>
                    setFiles((all) =>
                      all.map((c) =>
                        c.key === f.key
                          ? { ...c, documentType: e.target.value as MedicalDocumentType }
                          : c,
                      ),
                    )
                  }
                >
                  {MEDICAL_DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tTypes(type)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove"
                  onClick={() => setFiles((all) => all.filter((c) => c.key !== f.key))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <FormError error={error} />
          <div className="row-between">
            <button type="button" className="button-secondary" onClick={() => setStep(0)}>
              {t('documentUpload.prev')}
            </button>
            <button
              type="button"
              disabled={files.length === 0}
              onClick={() => {
                setError(null)
                setStep(2)
              }}
            >
              {t('documentUpload.next')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          <h2>{t('review.title')}</h2>
          <dl className="details">
            <div>
              <dt className="small muted">{t('review.condition')}</dt>
              <dd>{specialtyLabel}</dd>
            </div>
            <div>
              <dt className="small muted">{t('review.symptoms')}</dt>
              <dd className="prewrap">{details.description}</dd>
            </div>
            <div>
              <dt className="small muted">{t('review.uploadedDocuments')}</dt>
              <dd>
                <ul className="plain-list">
                  {files.map((f) => (
                    <li key={f.key}>
                      {f.file.name} — <span className="muted">{tTypes(f.documentType)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="notice small">{t('review.disclosure')}</p>
          <FormError error={error} />
          <div className="row-between">
            <button type="button" className="button-secondary" onClick={() => setStep(1)}>
              {t('review.prev')}
            </button>
            <button type="button" disabled={pending} onClick={submit}>
              {pending ? t('review.submitting') : t('review.submit')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function SubmissionSuccess({
  created,
  onDashboard,
}: {
  created: CaseSummary
  onDashboard: () => void
}) {
  const ts = useT('submissionSuccess')
  return (
    <section className="card stack narrow success-card">
      <h1>{ts('title')}</h1>
      <p>
        {ts('reference')} <strong className="case-ref">{created.referenceNumber}</strong>
      </p>
      <p className="muted">{ts('body')}</p>
      <ol className="next-steps">
        {(['review', 'specialists', 'options', 'visa'] as const).map((k) => (
          <li key={k}>{ts(`nextSteps.${k}`)}</li>
        ))}
      </ol>
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onDashboard}>
          {ts('returnToDashboard')}
        </button>
        <Link className="button" to={`/patient/cases/${created.id}`}>
          {ts('trackStatus')}
        </Link>
      </div>
    </section>
  )
}
