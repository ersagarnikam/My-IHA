import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Clock, FileText, Upload, X, XCircle } from 'lucide-react'
import { ConsentChecks, consentValues } from '../../components/ConsentChecks'
import { Field, FormError, fieldError, Stepper } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError, apiPost, apiPut } from '../../lib/api'
import { guessAustralianZone } from '../../lib/format'
import { AuthShell } from '../../pages/auth/AuthShell'
import { FilePicker, Group } from '../doctor/registration/RegistrationForm'
import { GateShell } from '../doctor/registration/RegistrationPages'
import { TimeZoneSelect } from '../doctor/shared'
import { useLawyerAccount } from './LawyerContext'
import { CREDENTIALS, DOCUMENT_LABELS, LAWYER_TYPES, STATES, type LawyerProfile } from './types'
import '../doctor/doctor.css'
import './lawyer.css'

/** Step 1 for visa lawyers: the login. Verification and the registration wizard follow. */
export function LawyerSignUpPage() {
  const t = useT('auth')
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== form.get('confirmPassword')) {
      setError(new ApiError(400, 'validation_failed', t('passwordsDontMatch')))
      return
    }
    setPending(true)
    setError(null)
    try {
      const { email } = await apiPost<{ email: string }>('/api/auth/register/lawyer', {
        email: form.get('email'),
        password,
        ...consentValues(form),
      })
      navigate(`/verify?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="Register as a visa lawyer"
      subtitle="Create your login, then tell us about your practice."
    >
      <form className="stack" onSubmit={onSubmit}>
        <Field
          label={t('email')}
          error={fieldError(error, 'email')}
          hint="This becomes your contact email."
        >
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t('password')} error={fieldError(error, 'password')} hint={t('passwordHint')}>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label={t('confirmPassword')}>
          <input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
        <ConsentChecks />
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {pending ? t('creatingAccount') : t('createAccount')}
        </button>
      </form>
      <p className="muted">
        {t('alreadyRegistered')} <Link to="/login">{t('signIn')}</Link>
      </p>
    </AuthShell>
  )
}

export function LawyerRegisterPage() {
  const { setAccount } = useLawyerAccount()
  const navigate = useNavigate()
  return (
    <GateShell
      title="Visa Lawyer Registration"
      subtitle="Tell us about your practice. MTA checks your registration before assigning visa cases."
    >
      <LawyerRegistrationForm
        lawyer={null}
        onDone={(lawyer) => {
          setAccount({ registered: true, lawyer })
          navigate('/lawyer/pending-approval', { replace: true })
        }}
      />
    </GateShell>
  )
}

export function LawyerPendingApprovalPage() {
  const { account, setAccount } = useLawyerAccount()
  const lawyer = account.lawyer!
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <GateShell
        title="Update your registration"
        subtitle="Make the changes MTA asked for, then resubmit."
      >
        <LawyerRegistrationForm
          lawyer={lawyer}
          onDone={(saved) => {
            setAccount({ registered: true, lawyer: saved })
            setEditing(false)
          }}
        />
        <button type="button" className="button-link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </GateShell>
    )

  const rejected = lawyer.status === 'rejected'
  const moreInfo = lawyer.status === 'more_info_requested'
  return (
    <GateShell title={lawyer.name}>
      <section className="dr-card stack" style={{ alignItems: 'flex-start' }}>
        {rejected ? (
          <XCircle size={36} color="var(--danger)" />
        ) : moreInfo ? (
          <Clock size={36} color="var(--warn-fg)" />
        ) : (
          <CheckCircle2 size={36} color="var(--primary)" />
        )}
        <h2 className="dr-subtitle">
          {rejected
            ? 'Your registration was not approved'
            : moreInfo
              ? 'MTA needs more information'
              : 'Your registration is under review'}
        </h2>
        {rejected || moreInfo ? (
          <>
            {(lawyer.rejectionReason || lawyer.moreInfoMessage) && (
              <div
                className={`dr-banner${rejected ? ' bad' : ''}`}
                style={{ alignSelf: 'stretch' }}
              >
                {lawyer.rejectionReason ?? lawyer.moreInfoMessage}
              </div>
            )}
            <p className="muted" style={{ margin: 0 }}>
              Update your details or documents and resubmit for review.
            </p>
            <button type="button" onClick={() => setEditing(true)}>
              Update and resubmit
            </button>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            The MTA team is checking your{' '}
            {lawyer.credentialType === 'marn'
              ? 'MARN on the OMARA register'
              : 'practising certificate with the law society'}{' '}
            and your documents. We&apos;ll email you when there&apos;s an outcome — usually within
            two business days.
          </p>
        )}
      </section>
    </GateShell>
  )
}

// ── The registration wizard ─────────────────────────────────────────────

type Values = {
  lawyerType: string
  name: string
  abnNumber: string
  phone: string
  address: string
  city: string
  zipCode: string
  experience: string
  timeZone: string
  credentialType: string
  credentialNumber: string
  practisingState: string
  credentialExpiresOn: string
}

type Files = {
  credentialCertificate: File | null
  indemnityInsurance: File | null
  otherDocuments: File[]
}

const STEPS = ['Your Practice', 'Registration', 'Documents & Agreement']

const STEP_FIELDS: string[][] = [
  [
    'lawyerType',
    'name',
    'abnNumber',
    'phone',
    'address',
    'city',
    'zipCode',
    'experience',
    'timeZone',
  ],
  ['credentialType', 'credentialNumber', 'practisingState', 'credentialExpiresOn'],
  ['credentialCertificate', 'indemnityInsurance', 'otherDocuments'],
]

/** Errors that belong to a step without a field name of their own. */
const CODE_STEP: Record<string, [number, string]> = {
  invalid_lawyer_type: [0, 'lawyerType'],
  invalid_abn: [0, 'abnNumber'],
  invalid_credential_type: [1, 'credentialType'],
  invalid_marn: [1, 'credentialNumber'],
  invalid_practising_certificate: [1, 'credentialNumber'],
  invalid_practising_state: [1, 'practisingState'],
  invalid_credential_expiry: [1, 'credentialExpiresOn'],
  documents_required: [2, 'credentialCertificate'],
}

const MAX_BYTES = 10 * 1024 * 1024
const IDENTIFIER = /^[A-Za-z0-9-]{4,20}$/

/** Australian Business Number checksum (weighted modulus 89). */
function isValidAbn(value: string) {
  const digits = value.replace(/\s/g, '')
  if (!/^\d{11}$/.test(digits)) return false
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const total = digits
    .split('')
    .reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i]!, 0)
  return total % 89 === 0
}

function initialValues(l: LawyerProfile | null): Values {
  return {
    lawyerType: l?.lawyerType ?? 'individual',
    name: l?.name ?? '',
    abnNumber: l?.abnNumber ?? '',
    phone: l?.phone ?? '',
    address: l?.address ?? '',
    city: l?.city ?? '',
    zipCode: l?.zipCode ?? '',
    experience: l?.experience ?? '',
    timeZone: l?.timeZone ?? guessAustralianZone(),
    credentialType: l?.credentialType ?? '',
    credentialNumber: l?.credentialNumber ?? '',
    practisingState: l?.practisingState ?? '',
    credentialExpiresOn: l?.credentialExpiresOn ?? '',
  }
}

function stepErrors(step: number, v: Values, f: Files, resubmit: boolean, agreed: boolean) {
  const e: Record<string, string> = {}
  if (step === 0) {
    if (v.name.trim().length < 2) e.name = 'Name must be at least 2 characters'
    if (!isValidAbn(v.abnNumber)) e.abnNumber = 'Enter a valid ABN (11 digits)'
    if (!/^\+?[\d\s()-]{8,20}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number.'
    if (!v.address.trim()) e.address = 'Address is required'
    if (!v.city.trim()) e.city = 'City/State is required'
    if (!v.zipCode.trim()) e.zipCode = 'Postcode is required'
  }
  if (step === 1) {
    if (!v.credentialType) e.credentialType = 'Choose your credential'
    const number = v.credentialNumber.replace(/\s/g, '')
    if (v.credentialType === 'marn' && !/^\d{7}$/.test(number))
      e.credentialNumber = 'A MARN is 7 digits'
    if (v.credentialType === 'practising_certificate') {
      if (!IDENTIFIER.test(number))
        e.credentialNumber = 'Certificate number must be 4–20 letters, numbers or hyphens'
      if (!v.practisingState) e.practisingState = 'Choose the issuing state or territory'
    }
    const today = new Date().toISOString().slice(0, 10)
    if (!v.credentialExpiresOn || v.credentialExpiresOn < today)
      e.credentialExpiresOn = 'Enter the expiry date of your current registration or certificate'
  }
  if (step === 2) {
    if (!resubmit && !f.credentialCertificate)
      e.credentialCertificate = 'Upload your MARN registration or practising certificate'
    if (!agreed) e.agreement = 'Please confirm to continue'
  }
  return e
}

/**
 * The lawyer registration wizard (old LawyerRegistrationWizard, steps 3–5). With
 * `lawyer`, it resubmits after MTA rejected the registration or asked for more
 * information: fields start filled in and earlier documents are kept unless replaced.
 */
export function LawyerRegistrationForm({
  lawyer,
  onDone,
}: {
  lawyer: LawyerProfile | null
  onDone: (lawyer: LawyerProfile) => void
}) {
  const resubmit = lawyer !== null
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Values>(() => initialValues(lawyer))
  const [files, setFiles] = useState<Files>({
    credentialCertificate: null,
    indemnityInsurance: null,
    otherDocuments: [],
  })
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const err = (field: string) => errors[field] ?? fieldError(error, field)

  function pickFile(key: 'credentialCertificate' | 'indemnityInsurance', file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, [key]: 'Files must be 10 MB or smaller.' }))
      return
    }
    setErrors(({ [key]: _, ...rest }) => rest)
    setFiles((f) => ({ ...f, [key]: file }))
  }

  function next() {
    const e = stepErrors(step, values, files, resubmit, agreed)
    setErrors(e)
    if (Object.keys(e).length === 0) setStep((s) => s + 1)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const e = stepErrors(2, values, files, resubmit, agreed)
    setErrors(e)
    if (Object.keys(e).length) return
    const form = new FormData()
    for (const [key, value] of Object.entries(values)) {
      if (key === 'practisingState' && values.credentialType !== 'practising_certificate') continue
      form.set(key, value.trim())
    }
    if (files.credentialCertificate) form.set('credentialCertificate', files.credentialCertificate)
    if (files.indemnityInsurance) form.set('indemnityInsurance', files.indemnityInsurance)
    files.otherDocuments.forEach((f) => form.append('otherDocuments', f))
    setPending(true)
    setError(null)
    try {
      const saved = resubmit
        ? await apiPut<LawyerProfile>('/api/lawyer/registration', form)
        : await apiPost<LawyerProfile>('/api/lawyer/registration', form)
      onDone(saved)
    } catch (err) {
      setError(err)
      // Jump back to the step the API complained about.
      if (err instanceof ApiError) {
        const bad = STEP_FIELDS.findIndex((fields) => fields.some((f) => err.fieldErrors[f]))
        if (bad >= 0) setStep(bad)
        else if (CODE_STEP[err.code]) {
          const [target, field] = CODE_STEP[err.code]!
          setErrors({ [field]: err.message })
          setStep(target)
        }
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="dr-card stack" onSubmit={submit} noValidate>
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <>
          <h2 className="dr-subtitle">Your Practice</h2>
          <Group label="Registering as" error={err('lawyerType')}>
            <div className="dr-radios">
              {Object.entries(LAWYER_TYPES).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="lawyerType"
                    checked={values.lawyerType === value}
                    onChange={() => set('lawyerType', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Group>
          <Field
            label={values.lawyerType === 'law_firm' ? 'Firm name' : 'Full name'}
            error={err('name')}
          >
            <input value={values.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="dr-grid-2">
            <Field
              label="ABN"
              error={err('abnNumber')}
              hint="Australian Business Number, 11 digits"
            >
              <input
                value={values.abnNumber}
                inputMode="numeric"
                onChange={(e) => set('abnNumber', e.target.value)}
              />
            </Field>
            <Field
              label="Phone number"
              error={err('phone')}
              hint="Include the country code, e.g. +61 2…"
            >
              <input
                value={values.phone}
                type="tel"
                autoComplete="tel"
                onChange={(e) => set('phone', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Office address" error={err('address')}>
            <input
              value={values.address}
              autoComplete="street-address"
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
          <div className="dr-grid-2">
            <Field label="City / State" error={err('city')}>
              <input value={values.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Postcode" error={err('zipCode')}>
              <input
                value={values.zipCode}
                autoComplete="postal-code"
                onChange={(e) => set('zipCode', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Immigration law experience" error={err('experience')} optional>
            <textarea
              rows={3}
              maxLength={1000}
              value={values.experience}
              placeholder="e.g. years of practice, visa subclasses you handle, accreditation"
              onChange={(e) => set('experience', e.target.value)}
            />
          </Field>
          <Field label="Time zone" error={err('timeZone')}>
            <TimeZoneSelect value={values.timeZone} onChange={(z) => set('timeZone', z)} />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="dr-subtitle">Registration</h2>
          <p className="muted small" style={{ margin: 0 }}>
            In Australia immigration assistance is given by registered migration agents (MARN) or by
            Australian legal practitioners with a current practising certificate. MTA checks the
            public register before approving you.
          </p>
          <Group label="I am a" error={err('credentialType')}>
            <div className="dr-radios lw-stack-radios">
              {Object.entries(CREDENTIALS).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="credentialType"
                    checked={values.credentialType === value}
                    onChange={() => set('credentialType', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Group>
          {values.credentialType && (
            <div className="dr-grid-2">
              <Field
                label={
                  values.credentialType === 'marn'
                    ? 'MARN (Migration Agent Registration Number)'
                    : 'Practising certificate number'
                }
                error={err('credentialNumber')}
                hint={values.credentialType === 'marn' ? '7 digits' : undefined}
              >
                <input
                  value={values.credentialNumber}
                  inputMode={values.credentialType === 'marn' ? 'numeric' : undefined}
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => set('credentialNumber', e.target.value)}
                />
              </Field>
              {values.credentialType === 'practising_certificate' && (
                <Field label="Issued in" error={err('practisingState')}>
                  <select
                    value={values.practisingState}
                    onChange={(e) => set('practisingState', e.target.value)}
                  >
                    <option value="">Choose state or territory…</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                label={
                  values.credentialType === 'marn'
                    ? 'Registration expires on'
                    : 'Certificate expires on'
                }
                error={err('credentialExpiresOn')}
              >
                <input
                  type="date"
                  value={values.credentialExpiresOn}
                  onChange={(e) => set('credentialExpiresOn', e.target.value)}
                />
              </Field>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="dr-subtitle">Documents</h2>
          <p className="muted small" style={{ margin: 0 }}>
            PDF, JPG or PNG, up to 10 MB each.
            {resubmit && ' Your earlier documents are kept unless you upload a replacement.'}
          </p>
          {resubmit && lawyer.documents.length > 0 && (
            <ul className="dr-files">
              {lawyer.documents.map((d) => (
                <li key={d.index} className="dr-file">
                  <span className="dr-file-icon pdf">
                    <FileText size={16} />
                  </span>
                  <div className="dr-file-body">
                    <p className="dr-file-name">{d.fileName}</p>
                    <p className="muted small" style={{ margin: 0 }}>
                      {DOCUMENT_LABELS[d.category] ?? d.category}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <FilePicker
            label={
              values.credentialType === 'marn'
                ? 'MARN registration certificate'
                : 'Practising certificate'
            }
            optional={resubmit}
            file={files.credentialCertificate}
            error={err('credentialCertificate')}
            onPick={(f) => pickFile('credentialCertificate', f)}
            onClear={() => setFiles((x) => ({ ...x, credentialCertificate: null }))}
          />
          <FilePicker
            label="Professional indemnity insurance"
            optional
            file={files.indemnityInsurance}
            error={err('indemnityInsurance')}
            onPick={(f) => pickFile('indemnityInsurance', f)}
            onClear={() => setFiles((x) => ({ ...x, indemnityInsurance: null }))}
          />
          <Group label="Other documents" optional>
            <label className="button-secondary file-button" style={{ alignSelf: 'flex-start' }}>
              <Upload size={14} /> Add files
              <input
                type="file"
                hidden
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_BYTES)
                  setFiles((x) => ({
                    ...x,
                    otherDocuments: [...x.otherDocuments, ...picked].slice(0, 5),
                  }))
                  e.target.value = ''
                }}
              />
            </label>
            {files.otherDocuments.map((f, i) => (
              <span key={i} className="row-start small" style={{ alignItems: 'center' }}>
                {f.name}
                <button
                  type="button"
                  className="dr-icon-button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() =>
                    setFiles((x) => ({
                      ...x,
                      otherDocuments: x.otherDocuments.filter((_, j) => j !== i),
                    }))
                  }
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </Group>
          <Group label="Agreement" error={err('agreement')}>
            <label className="row-start" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I confirm the information above is accurate, that I am entitled to give immigration
                assistance in Australia, and I agree to MTA&apos;s terms for partner visa lawyers.
              </span>
            </label>
          </Group>
        </>
      )}

      <FormError error={error} />
      <div className="row-between">
        {step > 0 ? (
          <button type="button" className="button-secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next}>
            Continue
          </button>
        ) : (
          <button type="submit" disabled={pending}>
            {pending ? 'Submitting…' : resubmit ? 'Resubmit Registration' : 'Submit Registration'}
          </button>
        )}
      </div>
    </form>
  )
}
