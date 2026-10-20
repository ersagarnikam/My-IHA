import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useToast } from '../../../components/Toasts'
import { Badge, ErrorState, Field, FormError, Loading, Stepper } from '../../../components/ui'
import { useLocale, useT } from '../../../i18n/I18nContext'
import { ApiError, apiPost } from '../../../lib/api'
import { countries } from '../../../lib/countries'
import { drafts } from '../../../lib/format'
import type { CaseVisa, VisaDocument, VisaFormData } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'
import { ApprovedVisaBanner } from '../CaseDetailPage'
import { usePatient } from '../PatientContext'
import { FormSummary } from './VisaDetailPage'
import { VISA_TONE } from './VisaTravelPage'

const STEPS = [
  'traveler_details',
  'medical_information',
  'provider_details',
  'financial_details',
  'travel_details',
  'visa_documents',
  'legal_compliance',
  'companion_details',
] as const

/** Which step each server field error belongs to, so a rejected submit jumps back to it. */
const FIELD_STEP: Record<string, number> = {
  first_name: 0,
  last_name: 0,
  gender: 0,
  nationality: 0,
  date_of_birth: 0,
  passport_number: 0,
  passport_expiry: 0,
  email: 0,
  phone: 0,
  has_medical_conditions: 1,
  medical_conditions_details: 1,
  health_examination_completed: 1,
  provider_name: 2,
  provider_organization: 2,
  provider_address: 2,
  provider_contact: 2,
  source_of_funds: 3,
  bank_balance: 3,
  sponsor_name: 3,
  sponsor_relationship: 3,
  sponsor_contact: 3,
  arrival_date: 4,
  departure_date: 4,
  criminal_record: 6,
  criminal_record_details: 6,
  previous_visa_issues: 6,
  previous_visa_issues_details: 6,
  companion_name: 7,
  companion_relationship: 7,
  companion_passport_number: 7,
  companion_passport_expiry: 7,
}

const FUNDS = [
  ['Self-Funded', 'selfFunded'],
  ['Employer Sponsored', 'employerSponsored'],
  ['Family Sponsored', 'familySponsored'],
  ['Other', 'other'],
] as const

const PASSPORT = /^[A-Z0-9]{5,12}$/i

export function VisaApplicationPage() {
  const { caseId } = useParams()
  const visa = useApi<CaseVisa>(`/api/patient/cases/${caseId}/visa`)
  if (visa.error) return <ErrorState error={visa.error} onRetry={visa.reload} />
  if (!visa.data) return <Loading />
  if (!visa.data.visaPageOpen) return <Navigate to={`/patient/cases/${caseId}`} replace />
  if (visa.data.submission?.formSubmitted) return <SubmittedApplication visa={visa.data} />
  if (!visa.data.canStart) return <Navigate to={`/patient/cases/${caseId}`} replace />
  return <Wizard visa={visa.data} onDocumentsChanged={visa.reload} />
}

function SubmittedApplication({ visa }: { visa: CaseVisa }) {
  const t = useT('visaForm')
  const tc = useT('caseDetail')
  const status = visa.submission!.status
  const approved = visa.documents.find((d) => d.category === 'approved_visa')
  return (
    <section className="stack">
      <Link to={`/patient/cases/${visa.caseId}`} className="muted small">
        ← {visa.referenceNumber}
      </Link>
      <div className="page-header">
        <div>
          <h1>{t('pageTitle')}</h1>
          <p className="muted">{t('pageSubtitle')}</p>
        </div>
        <Badge tone={VISA_TONE[status] ?? 'info'}>
          {t.has(`statusBadge.${status}`) ? t(`statusBadge.${status}`) : status}
        </Badge>
      </div>
      {t.has(`statusBanner.${status}`) && <p className="notice">{t(`statusBanner.${status}`)}</p>}
      {approved && <ApprovedVisaBanner document={approved} />}
      <Link to={`/patient/visa-travel/${visa.submission!.id}`}>{tc('viewDetails')}</Link>
      {visa.form && <FormSummary form={visa.form} />}
    </section>
  )
}

function Wizard({ visa, onDocumentsChanged }: { visa: CaseVisa; onDocumentsChanged: () => void }) {
  const t = useT('visaForm')
  const tp = useT('profile.personalDetails')
  const tPay = useT('paymentPage')
  const { locale } = useLocale()
  const toast = useToast()
  const { profile } = usePatient()
  const draftName = `visa-form:${visa.caseId}`
  const countryList = useMemo(() => countries(locale), [locale])

  const [form, setForm] = useState<VisaFormData>(() => {
    const saved = drafts.load<VisaFormData>(draftName)
    if (saved) return saved
    const [first, ...rest] = profile.fullName.split(' ')
    return {
      first_name: first,
      last_name: rest.join(' '),
      gender: profile.gender ?? '',
      nationality: profile.nationality ?? '',
      date_of_birth: profile.dateOfBirth ?? '',
      email: profile.email,
      phone: profile.phone ?? '',
      purpose_of_visit: 'Medical treatment',
      travelling_with_companion: 'No',
    }
  })
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stepError, setStepError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    drafts.save(draftName, form)
  }, [draftName, form])

  // Latest patient upload per category counts as "uploaded" (documents may also come from the Documents page).
  const uploaded = useMemo(() => {
    const map: Record<string, VisaDocument> = {}
    for (const d of visa.documents) if (d.source === 'patient_upload') map[d.category] = d
    return map
  }, [visa.documents])

  const set = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }))
  const v = (name: string) => form[name] ?? ''

  function validateStep(index: number): boolean {
    const e: Record<string, string> = {}
    const need = (name: string, message = t('errors.fieldRequired')) => {
      if (!v(name).trim()) e[name] = message
    }
    const today = new Date().toISOString().slice(0, 10)
    let docError: string | null = null
    if (index === 0) {
      need('first_name', t('validation.firstNameRequired'))
      need('last_name', t('validation.lastNameRequired'))
      need('gender', t('validation.genderRequired'))
      need('nationality', t('validation.nationalityRequired'))
      need('date_of_birth', t('validation.dateOfBirthRequired'))
      if (v('date_of_birth') && v('date_of_birth') >= today)
        e.date_of_birth = t('validation.dateOfBirthInvalid')
      need('passport_number', t('validation.passportNumberRequired'))
      if (v('passport_number') && !PASSPORT.test(v('passport_number').trim()))
        e.passport_number = t('validation.passportNumberInvalid')
      need('passport_expiry', t('validation.passportExpiryRequired'))
      if (v('passport_expiry') && v('passport_expiry') <= today)
        e.passport_expiry = t('validation.passportExpiryFuture')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) e.email = t('validation.emailInvalid')
      if (!/^\+?[\d\s()-]{7,}$/.test(v('phone'))) e.phone = t('validation.phoneInvalid')
    } else if (index === 1) {
      need('has_medical_conditions', t('validation.answerRequired'))
      need('health_examination_completed', t('validation.answerRequired'))
      if (v('has_medical_conditions') === 'Yes')
        need('medical_conditions_details', t('errors.medicalConditionsRequired'))
    } else if (index === 2) {
      need('provider_name', t('validation.providerNameRequired'))
      need('provider_organization', t('validation.organizationRequired'))
      need('provider_address', t('validation.addressRequired'))
      need('provider_contact', t('validation.contactRequired'))
    } else if (index === 3) {
      need('source_of_funds', t('validation.sourceOfFundsRequired'))
      const funds = v('source_of_funds')
      if (funds === 'Self-Funded') {
        need('bank_balance', t('errors.bankBalanceRequired'))
        if (!uploaded.bank_statement) docError = t('errors.bankStatementRequired')
      } else if (funds === 'Employer Sponsored' || funds === 'Family Sponsored') {
        ;['sponsor_name', 'sponsor_relationship', 'sponsor_contact'].forEach((f) => need(f))
        if (funds === 'Family Sponsored' && !uploaded.sponsorship_letter)
          docError = t('errors.sponsorshipLetterRequired')
        if (
          funds === 'Employer Sponsored' &&
          !uploaded.sponsorship_letter &&
          !uploaded.employer_letter
        )
          docError = t('errors.oneDocRequired')
      } else if (
        funds === 'Other' &&
        !uploaded.bank_statement &&
        !uploaded.sponsorship_letter &&
        !uploaded.employer_letter
      ) {
        docError = t('errors.financialDocRequired')
      }
    } else if (index === 4) {
      need('arrival_date', t('validation.arrivalDateRequired'))
      need('departure_date', t('validation.departureDateRequired'))
      if (v('arrival_date') && v('arrival_date') < today)
        e.arrival_date = t('validation.arrivalDateFuture')
      if (v('arrival_date') && v('departure_date') && v('departure_date') <= v('arrival_date'))
        e.departure_date = t('errors.departureMustBeAfter')
    } else if (index === 5) {
      if (!uploaded.passport) docError = t('errors.passportRequired')
      else if (!uploaded.passport_photograph) docError = t('errors.passportPhotoRequired')
    } else if (index === 6) {
      need('criminal_record', t('validation.answerRequired'))
      need('previous_visa_issues', t('validation.answerRequired'))
      if (v('criminal_record') === 'Yes')
        need('criminal_record_details', t('errors.criminalRecordDetailsRequired'))
      if (v('previous_visa_issues') === 'Yes')
        need('previous_visa_issues_details', t('errors.visaIssuesDetailsRequired'))
    } else if (index === 7 && v('travelling_with_companion') === 'Yes') {
      ;[
        'companion_name',
        'companion_relationship',
        'companion_passport_number',
        'companion_passport_expiry',
      ].forEach((f) => need(f))
      if (v('companion_passport_number') && !PASSPORT.test(v('companion_passport_number').trim()))
        e.companion_passport_number = t('validation.passportNumberInvalid')
    }
    setErrors(e)
    setStepError(docError)
    return Object.keys(e).length === 0 && !docError
  }

  async function submit() {
    if (!validateStep(7)) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await apiPost(`/api/patient/cases/${visa.caseId}/visa`, form)
      drafts.clear(draftName)
      toast({ title: t('toasts.appSubmitted'), tone: 'good' })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors)
        setStep(Math.min(...Object.keys(err.fieldErrors).map((f) => FIELD_STEP[f] ?? 7)))
      } else {
        setSubmitError(err)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <section className="card stack narrow success-card">
        <h1>{t('submittedTitle')}</h1>
        <p>{t('submittedBody')}</p>
        <Link className="button" to={`/patient/cases/${visa.caseId}`}>
          {tPay('backToCase')}
        </Link>
      </section>
    )
  }

  const text = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} error={errors[name]}>
      <input value={v(name)} onChange={(e) => set(name, e.target.value)} {...props} />
    </Field>
  )
  const area = (name: string, label: string, placeholder?: string) => (
    <Field label={label} error={errors[name]}>
      <textarea
        rows={3}
        value={v(name)}
        placeholder={placeholder}
        onChange={(e) => set(name, e.target.value)}
      />
    </Field>
  )
  const yesNo = (name: string, label: string) => (
    <Field label={label} error={errors[name]}>
      <span className="radio-row">
        {(['Yes', 'No'] as const).map((answer) => (
          <label key={answer} className="check-row">
            <input
              type="radio"
              name={name}
              checked={v(name) === answer}
              onChange={() => set(name, answer)}
            />
            {t(answer === 'Yes' ? 'yes' : 'no')}
          </label>
        ))}
      </span>
    </Field>
  )
  const doc = (category: string) => (
    <DocumentSlot
      key={category}
      caseId={visa.caseId}
      category={category}
      current={uploaded[category]}
      onUploaded={onDocumentsChanged}
    />
  )

  const steps: ReactNode[] = [
    <div className="grid-2" key="0">
      {text('first_name', t('fields.firstName'), { placeholder: t('fields.firstNamePlaceholder') })}
      {text('last_name', t('fields.lastName'), { placeholder: t('fields.lastNamePlaceholder') })}
      <Field label={t('fields.gender')} error={errors.gender}>
        <select value={v('gender')} onChange={(e) => set('gender', e.target.value)}>
          <option value="">{t('fields.genderPlaceholder')}</option>
          {(['male', 'female', 'other', 'prefer_not_to_say'] as const).map((g) => (
            <option key={g} value={g}>
              {tp(`genders.${g}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('fields.nationality')} error={errors.nationality}>
        <select value={v('nationality')} onChange={(e) => set('nationality', e.target.value)}>
          <option value="">{t('fields.nationalityPlaceholder')}</option>
          {countryList.map((c) => (
            <option key={c.code} value={c.name}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {text('date_of_birth', t('fields.dateOfBirth'), { type: 'date' })}
      {text('passport_number', t('fields.passportNumber'), {
        placeholder: t('fields.passportNumberPlaceholder'),
      })}
      {text('passport_expiry', t('fields.passportExpiry'), { type: 'date' })}
      {text('email', t('fields.email'), {
        type: 'email',
        placeholder: t('fields.emailPlaceholder'),
      })}
      {text('phone', t('fields.phone'), { type: 'tel', placeholder: '+86 138 1234 5678' })}
      {text('australian_provider_details', t('fields.australianProviderDetails'), {
        placeholder: t('fields.australianProviderDetailsPlaceholder'),
      })}
    </div>,
    <div className="stack" key="1">
      {area(
        'condition_summary',
        t('fields.conditionSummary'),
        t('fields.conditionSummaryPlaceholder'),
      )}
      {yesNo('has_medical_conditions', t('fields.hasMedicalConditions'))}
      {v('has_medical_conditions') === 'Yes' &&
        area(
          'medical_conditions_details',
          t('fields.medicalConditionsDetails'),
          t('fields.medicalConditionsDetailsPlaceholder'),
        )}
      {yesNo('health_examination_completed', t('fields.healthExamCompleted'))}
    </div>,
    <div className="grid-2" key="2">
      {text('provider_name', t('fields.providerName'), {
        placeholder: t('fields.providerNamePlaceholder'),
      })}
      {text('provider_organization', t('fields.organization'), {
        placeholder: t('fields.organizationPlaceholder'),
      })}
      {text('provider_address', t('fields.address'), {
        placeholder: t('fields.addressPlaceholder'),
      })}
      {text('provider_contact', t('fields.contact'), {
        type: 'tel',
        placeholder: '+61 2 9123 4567',
      })}
    </div>,
    <div className="stack" key="3">
      <Field label={t('fields.sourceOfFunds')} error={errors.source_of_funds}>
        <select
          value={v('source_of_funds')}
          onChange={(e) => set('source_of_funds', e.target.value)}
        >
          <option value="">{t('fields.sourceOfFundsPlaceholder')}</option>
          {FUNDS.map(([value, key]) => (
            <option key={value} value={value}>
              {t(`fields.${key}`)}
            </option>
          ))}
        </select>
      </Field>
      {v('source_of_funds') === 'Self-Funded' && (
        <>
          {text('bank_balance', t('fields.bankBalance'), {
            placeholder: t('fields.bankBalancePlaceholder'),
          })}
          <p className="muted small">{t('fundingHints.selfFunded')}</p>
          {doc('bank_statement')}
        </>
      )}
      {(v('source_of_funds') === 'Employer Sponsored' ||
        v('source_of_funds') === 'Family Sponsored') && (
        <>
          <div className="grid-2">
            {text('sponsor_name', t('fields.sponsorName'), {
              placeholder: t('fields.sponsorNamePlaceholder'),
            })}
            {text('sponsor_relationship', t('fields.relationship'), {
              placeholder: t('fields.relationshipPlaceholder'),
            })}
            {text('sponsor_contact', t('fields.contactNumber'), { type: 'tel' })}
          </div>
          <p className="muted small">
            {t(
              v('source_of_funds') === 'Family Sponsored'
                ? 'fundingHints.family'
                : 'fundingHints.employer',
            )}
          </p>
          {doc('sponsorship_letter')}
          {v('source_of_funds') === 'Employer Sponsored' && doc('employer_letter')}
        </>
      )}
      {v('source_of_funds') === 'Other' && (
        <>
          <p className="muted small">{t('fundingHints.other')}</p>
          {['bank_statement', 'sponsorship_letter', 'employer_letter'].map(doc)}
        </>
      )}
    </div>,
    <div className="grid-2" key="4">
      {text('arrival_date', t('fields.intendedArrival'), { type: 'date' })}
      {text('departure_date', t('fields.intendedDeparture'), { type: 'date' })}
      {text('purpose_of_visit', t('fields.purposeOfVisit'), {
        placeholder: t('fields.purposeOfVisitPlaceholder'),
      })}
      {text('flight_booking', t('fields.flightBooking'), {
        placeholder: t('fields.flightBookingPlaceholder'),
      })}
      {text('accommodation', t('fields.accommodation'), {
        placeholder: t('fields.accommodationPlaceholder'),
      })}
    </div>,
    <div className="stack" key="5">
      <p className="muted">{t('visaDocsNote')}</p>
      {doc('passport')}
      {doc('passport_photograph')}
      <p className="notice small">{t('hospitalDocsNote')}</p>
    </div>,
    <div className="stack" key="6">
      {yesNo('criminal_record', t('fields.criminalRecord'))}
      {v('criminal_record') === 'Yes' &&
        area(
          'criminal_record_details',
          t('fields.provideDetails'),
          t('fields.provideDetailsPlaceholder'),
        )}
      {yesNo('previous_visa_issues', t('fields.previousVisaIssues'))}
      {v('previous_visa_issues') === 'Yes' &&
        area(
          'previous_visa_issues_details',
          t('fields.provideDetails'),
          t('fields.provideDetailsPlaceholder'),
        )}
    </div>,
    <div className="stack" key="7">
      {yesNo('travelling_with_companion', t('fields.companionQuestion'))}
      {v('travelling_with_companion') === 'Yes' && (
        <>
          <div className="grid-2">
            {text('companion_name', t('fields.companionName'), {
              placeholder: t('fields.companionNamePlaceholder'),
            })}
            {text('companion_relationship', t('fields.relationship'), {
              placeholder: t('fields.relationshipPlaceholder'),
            })}
            {text('companion_passport_number', t('fields.companionPassportNumber'), {
              placeholder: t('fields.companionPassportNumberPlaceholder'),
            })}
            {text('companion_passport_expiry', t('fields.companionPassportExpiry'), {
              type: 'date',
            })}
          </div>
          {doc('companion_passport')}
          {doc('companion_proof_of_relationship')}
        </>
      )}
    </div>,
  ]

  return (
    <section className="stack">
      <Link to={`/patient/cases/${visa.caseId}`} className="muted small">
        ← {visa.referenceNumber}
      </Link>
      <div>
        <h1>{t('pageTitle')}</h1>
        <p className="muted">{t('pageSubtitle')}</p>
      </div>
      <Stepper steps={STEPS.map((s) => t(`steps.${s}`))} current={step} />
      <div className="card stack">
        <div className="row-between">
          <h2>{t(`steps.${STEPS[step]}`)}</h2>
          <span className="muted small">
            {t('stepOf', { step: step + 1, total: STEPS.length })}
          </span>
        </div>
        {steps[step]}
        {stepError && <p className="form-error">{stepError}</p>}
        <FormError error={submitError} />
        <div className="row-between">
          <button
            type="button"
            className="button-secondary"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            {t('back')}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => validateStep(step) && setStep(step + 1)}>
              {t('next')}
            </button>
          ) : (
            <button type="button" disabled={submitting} onClick={submit}>
              {t('submitApplication')}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** One required/optional document: uploads immediately and shows what's on file. */
function DocumentSlot({
  caseId,
  category,
  current,
  onUploaded,
}: {
  caseId: string
  category: string
  current?: VisaDocument
  onUploaded: () => void
}) {
  const t = useT('visaForm')
  const td = useT('visaDetail.documents')
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return setError(td('fileTooLarge'))
    setPending(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('category', category)
      form.append('file', file)
      await apiPost(`/api/patient/cases/${caseId}/visa/documents`, form)
      toast({ title: t('toasts.fileUploaded', { name: file.name }), tone: 'good' })
      onUploaded()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'passport_photo_ratio'
          ? t('errors.invalidPhotoDimensions')
          : err instanceof ApiError
            ? err.message
            : t('errors.uploadFailed'),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="doc-slot">
      <div>
        <strong>{t(`docCategories.${category}`)}</strong>
        <p className="small muted">{current ? current.fileName : t('noFileUploaded')}</p>
        {error && <p className="field-error">{error}</p>}
      </div>
      <label className="button-secondary file-button">
        {pending ? '…' : current ? t('replaceFile') : t('uploadFile')}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={pending}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
    </div>
  )
}
