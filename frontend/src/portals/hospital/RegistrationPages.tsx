import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Clock, FileText, Upload, X, XCircle } from 'lucide-react'
import { Field, FormError, fieldError, Stepper } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError, apiPost, apiPut } from '../../lib/api'
import type { Specialty } from '../../lib/cases'
import { guessAustralianZone } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { AuthShell } from '../../pages/auth/AuthShell'
import { FilePicker, Group } from '../doctor/registration/RegistrationForm'
import { GateShell } from '../doctor/registration/RegistrationPages'
import { TimeZoneSelect } from '../doctor/shared'
import { useHospitalAccount } from './HospitalContext'
import { HOSPITAL_TYPES, type HospitalProfile } from './types'
import '../doctor/doctor.css'
import './hospital.css'

/** Step 1 for hospitals: the login. Verification and the registration wizard follow. */
export function HospitalSignUpPage() {
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
      const { email } = await apiPost<{ email: string }>('/api/auth/register/hospital', {
        email: form.get('email'),
        password,
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
      title="Register a hospital"
      subtitle="Create your login, then tell us about your hospital."
    >
      <form className="stack" onSubmit={onSubmit}>
        <Field
          label={t('email')}
          error={fieldError(error, 'email')}
          hint="This becomes the hospital's contact email."
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

export function HospitalRegisterPage() {
  const { setAccount } = useHospitalAccount()
  const navigate = useNavigate()
  return (
    <GateShell
      title="Hospital Registration"
      subtitle="Tell us about your hospital. MTA reviews every registration before doctors can work with you."
    >
      <HospitalRegistrationForm
        hospital={null}
        onDone={(hospital) => {
          setAccount({ registered: true, hospital })
          navigate('/hospital/pending-approval', { replace: true })
        }}
      />
    </GateShell>
  )
}

export function HospitalPendingApprovalPage() {
  const { account, setAccount } = useHospitalAccount()
  const hospital = account.hospital!
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <GateShell
        title="Update your registration"
        subtitle="Make the changes MTA asked for, then resubmit."
      >
        <HospitalRegistrationForm
          hospital={hospital}
          onDone={(saved) => {
            setAccount({ registered: true, hospital: saved })
            setEditing(false)
          }}
        />
        <button type="button" className="button-link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </GateShell>
    )

  const rejected = hospital.status === 'rejected'
  const moreInfo = hospital.status === 'more_info_requested'
  return (
    <GateShell title={hospital.name}>
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
            {(hospital.rejectionReason || hospital.moreInfoMessage) && (
              <div
                className={`dr-banner${rejected ? ' bad' : ''}`}
                style={{ alignSelf: 'stretch' }}
              >
                {hospital.rejectionReason ?? hospital.moreInfoMessage}
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
            The MTA team is checking your hospital's details and documents. We'll email you when
            there's an outcome — usually within two business days.
          </p>
        )}
      </section>
    </GateShell>
  )
}

// ── The registration wizard ─────────────────────────────────────────────

type Values = {
  name: string
  registrationNumber: string
  abnNumber: string
  phone: string
  country: string
  city: string
  address: string
  zipCode: string
  timeZone: string
  registrationType: string
  specialties: string[]
  bedCount: string
  roomTypes: string[]
  licenseNumber: string
  accreditationBody: string
  accreditationExpiresOn: string
  licenceExpiresOn: string
}

type Files = {
  hospitalLicense: File | null
  registrationCertificate: File | null
  otherDocuments: File[]
}

const STEPS = ['Basic Information', 'Location', 'Hospital Details', 'Documents & Agreement']

const STEP_FIELDS: string[][] = [
  ['name', 'registrationNumber', 'abnNumber', 'phone'],
  ['country', 'city', 'address', 'zipCode', 'timeZone'],
  [
    'registrationType',
    'specialties',
    'bedCount',
    'roomTypes',
    'licenseNumber',
    'accreditationBody',
    'accreditationExpiresOn',
    'licenceExpiresOn',
  ],
  ['hospitalLicense', 'registrationCertificate', 'otherDocuments'],
]

/** Errors that belong to a step without a field name of their own. */
const CODE_STEP: Record<string, [number, string]> = {
  invalid_abn: [0, 'abnNumber'],
  invalid_registration_number: [0, 'registrationNumber'],
  invalid_license_number: [2, 'licenseNumber'],
  invalid_hospital_type: [2, 'registrationType'],
  invalid_bed_count: [2, 'bedCount'],
  room_types_required: [2, 'roomTypes'],
  invalid_accreditation_expiry: [2, 'accreditationExpiresOn'],
  invalid_licence_expiry: [2, 'licenceExpiresOn'],
  documents_required: [3, 'hospitalLicense'],
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

function initialValues(h: HospitalProfile | null): Values {
  return {
    name: h?.name ?? '',
    registrationNumber: h?.registrationNumber ?? '',
    abnNumber: h?.abnNumber ?? '',
    phone: h?.phone ?? '',
    country: h?.country ?? 'Australia',
    city: h?.city ?? '',
    address: h?.address ?? '',
    zipCode: h?.zipCode ?? '',
    timeZone: h?.timeZone ?? guessAustralianZone(),
    registrationType: h?.registrationType ?? '',
    specialties: h?.specialties ?? [],
    bedCount: h?.bedCount != null ? String(h.bedCount) : '',
    roomTypes: h?.roomTypes ?? [],
    licenseNumber: h?.licenseNumber ?? '',
    accreditationBody: h?.accreditationBody ?? '',
    accreditationExpiresOn: h?.accreditationExpiresOn ?? '',
    licenceExpiresOn: h?.licenceExpiresOn ?? '',
  }
}

function stepErrors(step: number, v: Values, f: Files, resubmit: boolean, agreed: boolean) {
  const e: Record<string, string> = {}
  if (step === 0) {
    if (v.name.trim().length < 2) e.name = 'Hospital name must be at least 2 characters'
    if (!IDENTIFIER.test(v.registrationNumber.trim()))
      e.registrationNumber = 'Registration number must be 4–20 letters, numbers or hyphens'
    if (!isValidAbn(v.abnNumber)) e.abnNumber = 'Enter a valid ABN (11 digits)'
    if (!/^\+?[\d\s()-]{8,20}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number.'
  }
  if (step === 1) {
    if (!v.country.trim()) e.country = 'Country is required'
    if (!v.city.trim()) e.city = 'State/City is required'
    if (!v.address.trim()) e.address = 'Full address is required'
    if (!v.zipCode.trim()) e.zipCode = 'Zip code is required'
  }
  if (step === 2) {
    if (!v.registrationType) e.registrationType = 'Select a hospital type'
    if (v.specialties.length === 0) e.specialties = 'Select at least one specialty'
    const beds = Number(v.bedCount)
    if (!Number.isInteger(beds) || beds < 1) e.bedCount = 'Number of beds must be greater than 0'
    if (v.roomTypes.length === 0) e.roomTypes = 'Add at least one room type'
    if (!IDENTIFIER.test(v.licenseNumber.trim()))
      e.licenseNumber = 'License number must be 4–20 letters, numbers or hyphens'
    if (!v.accreditationBody.trim()) e.accreditationBody = 'Accreditation body is required'
    const today = new Date().toISOString().slice(0, 10)
    if (!v.accreditationExpiresOn || v.accreditationExpiresOn < today)
      e.accreditationExpiresOn = 'Enter the expiry date of a current accreditation certificate'
    if (!v.licenceExpiresOn || v.licenceExpiresOn < today)
      e.licenceExpiresOn = 'Enter the expiry date of a current hospital licence'
  }
  if (step === 3) {
    if (!resubmit && !f.hospitalLicense) e.hospitalLicense = 'Upload the hospital license'
    if (!resubmit && !f.registrationCertificate)
      e.registrationCertificate = 'Upload the registration certificate'
    if (!agreed) e.agreement = 'Please confirm to continue'
  }
  return e
}

/**
 * The hospital registration wizard (old HospitalRegistrationWizard, steps 3–7). With
 * `hospital`, it resubmits after MTA rejected the registration or asked for more
 * information: fields start filled in and earlier documents are kept unless replaced.
 */
export function HospitalRegistrationForm({
  hospital,
  onDone,
}: {
  hospital: HospitalProfile | null
  onDone: (hospital: HospitalProfile) => void
}) {
  const resubmit = hospital !== null
  const specialties = useApi<Specialty[]>('/api/specialties')
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Values>(() => initialValues(hospital))
  const [files, setFiles] = useState<Files>({
    hospitalLicense: null,
    registrationCertificate: null,
    otherDocuments: [],
  })
  const [roomDraft, setRoomDraft] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const err = (field: string) => errors[field] ?? fieldError(error, field)

  function addRoom() {
    const room = roomDraft.trim()
    if (room && !values.roomTypes.includes(room)) set('roomTypes', [...values.roomTypes, room])
    setRoomDraft('')
  }

  function pickFile(key: 'hospitalLicense' | 'registrationCertificate', file: File | undefined) {
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
    const e = stepErrors(3, values, files, resubmit, agreed)
    setErrors(e)
    if (Object.keys(e).length) return
    const form = new FormData()
    for (const key of [
      'name',
      'registrationNumber',
      'abnNumber',
      'phone',
      'country',
      'city',
      'address',
      'zipCode',
      'timeZone',
      'registrationType',
      'bedCount',
      'licenseNumber',
      'accreditationBody',
      'accreditationExpiresOn',
      'licenceExpiresOn',
    ] as const) {
      form.set(key, values[key].trim())
    }
    values.specialties.forEach((s) => form.append('specialties', s))
    values.roomTypes.forEach((r) => form.append('roomTypes', r))
    if (files.hospitalLicense) form.set('hospitalLicense', files.hospitalLicense)
    if (files.registrationCertificate)
      form.set('registrationCertificate', files.registrationCertificate)
    files.otherDocuments.forEach((f) => form.append('otherDocuments', f))
    setPending(true)
    setError(null)
    try {
      const saved = resubmit
        ? await apiPut<HospitalProfile>('/api/hospital/registration', form)
        : await apiPost<HospitalProfile>('/api/hospital/registration', form)
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
          <h2 className="dr-subtitle">Basic Information</h2>
          <Field label="Hospital name" error={err('name')}>
            <input value={values.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="dr-grid-2">
            <Field
              label="Registration number"
              error={err('registrationNumber')}
              hint="4–20 letters, numbers or hyphens"
            >
              <input
                value={values.registrationNumber}
                style={{ textTransform: 'uppercase' }}
                onChange={(e) => set('registrationNumber', e.target.value)}
              />
            </Field>
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
          </div>
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
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="dr-subtitle">Location</h2>
          <div className="dr-grid-2">
            <Field label="Country" error={err('country')}>
              <input
                value={values.country}
                autoComplete="country-name"
                onChange={(e) => set('country', e.target.value)}
              />
            </Field>
            <Field label="State / City" error={err('city')}>
              <input value={values.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
          </div>
          <Field label="Full address" error={err('address')}>
            <input
              value={values.address}
              autoComplete="street-address"
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
          <Field label="Zip / postcode" error={err('zipCode')}>
            <input
              value={values.zipCode}
              autoComplete="postal-code"
              onChange={(e) => set('zipCode', e.target.value)}
            />
          </Field>
          <Field
            label="Time zone"
            error={err('timeZone')}
            hint="Dates on your letters and in your portal use this zone."
          >
            <TimeZoneSelect value={values.timeZone} onChange={(z) => set('timeZone', z)} />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="dr-subtitle">Hospital Details</h2>
          <Group label="Hospital type" error={err('registrationType')}>
            <div className="dr-radios">
              {Object.entries(HOSPITAL_TYPES).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="registrationType"
                    checked={values.registrationType === value}
                    onChange={() => set('registrationType', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Group>
          <Group label="Specialties" error={err('specialties')}>
            <div className="dr-multi">
              {specialties.data?.map((s) => (
                <label key={s.name}>
                  <input
                    type="checkbox"
                    checked={values.specialties.includes(s.name)}
                    onChange={() =>
                      set(
                        'specialties',
                        values.specialties.includes(s.name)
                          ? values.specialties.filter((x) => x !== s.name)
                          : [...values.specialties, s.name],
                      )
                    }
                  />
                  {s.labelEn}
                </label>
              ))}
            </div>
          </Group>
          <div className="dr-grid-2">
            <Field label="Number of beds" error={err('bedCount')}>
              <input
                type="number"
                min={1}
                value={values.bedCount}
                onChange={(e) => set('bedCount', e.target.value)}
              />
            </Field>
            <Field
              label="License number"
              error={err('licenseNumber')}
              hint="4–20 letters, numbers or hyphens"
            >
              <input
                value={values.licenseNumber}
                style={{ textTransform: 'uppercase' }}
                onChange={(e) => set('licenseNumber', e.target.value)}
              />
            </Field>
          </div>
          <Group label="Room types" error={err('roomTypes')}>
            <div
              className="row-start"
              style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
            >
              {values.roomTypes.map((room) => (
                <span key={room} className="hp-tag">
                  {room}
                  <button
                    type="button"
                    aria-label={`Remove ${room}`}
                    onClick={() =>
                      set(
                        'roomTypes',
                        values.roomTypes.filter((r) => r !== room),
                      )
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="hp-add-row">
              <input
                value={roomDraft}
                placeholder="e.g. Private room, ICU"
                onChange={(e) => setRoomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRoom()
                  }
                }}
              />
              <button type="button" className="button-secondary" onClick={addRoom}>
                Add
              </button>
            </div>
          </Group>
          <Field label="Accreditation body" error={err('accreditationBody')}>
            <input
              value={values.accreditationBody}
              placeholder="e.g. Australian Council on Healthcare Standards"
              onChange={(e) => set('accreditationBody', e.target.value)}
            />
          </Field>
          <div className="dr-grid-2">
            <Field label="Accreditation certificate expires" error={err('accreditationExpiresOn')}>
              <input
                type="date"
                value={values.accreditationExpiresOn}
                onChange={(e) => set('accreditationExpiresOn', e.target.value)}
              />
            </Field>
            <Field label="Hospital licence expires" error={err('licenceExpiresOn')}>
              <input
                type="date"
                value={values.licenceExpiresOn}
                onChange={(e) => set('licenceExpiresOn', e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="dr-subtitle">Documents</h2>
          <p className="muted small" style={{ margin: 0 }}>
            PDF, JPG or PNG, up to 10 MB each.
            {resubmit && ' Your earlier documents are kept unless you upload a replacement.'}
          </p>
          {resubmit && hospital.documents.length > 0 && (
            <ul className="dr-files">
              {hospital.documents.map((d) => (
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
            label="Hospital license"
            optional={resubmit}
            file={files.hospitalLicense}
            error={err('hospitalLicense')}
            onPick={(f) => pickFile('hospitalLicense', f)}
            onClear={() => setFiles((x) => ({ ...x, hospitalLicense: null }))}
          />
          <FilePicker
            label="Registration certificate"
            optional={resubmit}
            file={files.registrationCertificate}
            error={err('registrationCertificate')}
            onPick={(f) => pickFile('registrationCertificate', f)}
            onClear={() => setFiles((x) => ({ ...x, registrationCertificate: null }))}
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
                I confirm the information above is accurate, that I am authorised to register this
                hospital, and I agree to MTA's terms for partner hospitals.
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

export const DOCUMENT_LABELS: Record<string, string> = {
  license: 'Hospital license',
  registration_certificate: 'Registration certificate',
  other: 'Other document',
}
