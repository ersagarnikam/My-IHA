import { useState, type FormEvent, type ReactNode } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { Field, FormError, fieldError, Stepper } from '../../../components/ui'
import { ApiError, apiPost, apiPut } from '../../../lib/api'
import type { Specialty } from '../../../lib/cases'
import { guessAustralianZone } from '../../../lib/format'
import { useApi } from '../../../lib/useApi'
import { money, TimeZoneSelect } from '../shared'
import {
  LANGUAGE_OPTIONS,
  ROLE_LABELS,
  WORKING_DAYS,
  type DoctorProfile,
  type HospitalChoice,
} from '../types'

type Values = {
  fullName: string
  contactPhone: string
  specialties: string[]
  qualifications: string
  yearsOfExperience: string
  licenseNumber: string
  bio: string
  languagesSpoken: string[]
  department: string
  role: string
  hospitalIds: string[]
  workingDays: string[]
  timeZone: string
}

type Files = {
  photo: File | null
  medicalLicense: File | null
  degreeCertificate: File | null
  otherDocuments: File[]
}

const STEPS = ['Basic Information', 'Professional Details', 'Hospital & Availability', 'Documents']

const STEP_FIELDS: (keyof Values | keyof Files)[][] = [
  ['fullName', 'contactPhone', 'photo'],
  ['specialties', 'qualifications', 'yearsOfExperience', 'licenseNumber', 'bio', 'languagesSpoken'],
  ['department', 'role', 'hospitalIds', 'workingDays'],
  ['medicalLicense', 'degreeCertificate', 'otherDocuments'],
]

const MAX_BYTES = 10 * 1024 * 1024

function initialValues(doctor: DoctorProfile | null): Values {
  return {
    fullName: doctor?.fullName ?? '',
    contactPhone: doctor?.contactPhone ?? '',
    specialties: doctor?.specialties ?? [],
    qualifications: doctor?.qualifications ?? '',
    yearsOfExperience: doctor?.yearsOfExperience != null ? String(doctor.yearsOfExperience) : '',
    licenseNumber: doctor?.licenseNumber ?? '',
    bio: doctor?.bio ?? '',
    languagesSpoken: doctor?.languagesSpoken ?? ['English'],
    department: doctor?.department ?? '',
    role: doctor?.role ?? '',
    hospitalIds: doctor?.hospitalIds ?? [],
    workingDays: doctor?.workingDays.length
      ? doctor.workingDays
      : ['mon', 'tue', 'wed', 'thu', 'fri'],
    timeZone: doctor?.timeZone ?? guessAustralianZone(),
  }
}

/** Client-side checks per step (the API re-validates everything). */
function stepErrors(step: number, v: Values, f: Files, resubmit: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  if (step === 0) {
    if (v.fullName.trim().length < 2) e.fullName = 'Full name must be at least 2 characters'
    if (!/^\+?[\d\s()-]{8,20}$/.test(v.contactPhone.trim()))
      e.contactPhone = 'Enter a valid phone number.'
  }
  if (step === 1) {
    if (v.specialties.length === 0) e.specialties = 'Select at least one specialty'
    if (!v.qualifications.trim()) e.qualifications = 'Qualifications are required'
    const years = Number(v.yearsOfExperience)
    if (v.yearsOfExperience === '' || !Number.isInteger(years) || years < 0 || years > 70)
      e.yearsOfExperience = 'Enter your years of experience (0–70)'
    if (!/^[A-Za-z]{3}\d{10}$/.test(v.licenseNumber.trim()))
      e.licenseNumber =
        'Enter a valid AHPRA number (3 letters followed by 10 digits, e.g. MED0001234567)'
    if (!v.bio.trim()) e.bio = 'A short professional bio is required'
    if (v.languagesSpoken.length === 0) e.languagesSpoken = 'Select at least one language'
  }
  if (step === 2) {
    if (!v.department.trim()) e.department = 'Department is required'
    if (!v.role) e.role = 'Select a role'
    if (v.workingDays.length === 0) e.workingDays = 'Select at least one working day'
  }
  if (step === 3 && !resubmit) {
    if (!f.medicalLicense) e.medicalLicense = 'Upload your medical license'
    if (!f.degreeCertificate) e.degreeCertificate = 'Upload your degree certificate'
  }
  return e
}

/**
 * The registration wizard (old DoctorRegistrationWizard). With `doctor`, it
 * resubmits after MTA rejected the registration or asked for more information:
 * the fields start filled in and earlier documents are kept unless replaced.
 */
export function RegistrationForm({
  doctor,
  onDone,
}: {
  doctor: DoctorProfile | null
  onDone: (doctor: DoctorProfile) => void
}) {
  const resubmit = doctor !== null
  const specialties = useApi<Specialty[]>('/api/specialties')
  const hospitals = useApi<HospitalChoice[]>('/api/doctor/hospitals')
  const fees = useApi<{ registrationFeeAud: number; annualFeeAud: number }>(
    '/api/doctor/billing/fees',
  )
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Values>(() => initialValues(doctor))
  const [files, setFiles] = useState<Files>({
    photo: null,
    medicalLicense: null,
    degreeCertificate: null,
    otherDocuments: [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const toggle = (
    key: 'specialties' | 'languagesSpoken' | 'hospitalIds' | 'workingDays',
    item: string,
  ) =>
    setValues((v) => ({
      ...v,
      [key]: v[key].includes(item) ? v[key].filter((x) => x !== item) : [...v[key], item],
    }))
  const err = (field: string) => errors[field] ?? fieldError(error, field)

  function pickFile(key: 'photo' | 'medicalLicense' | 'degreeCertificate', file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, [key]: 'Files must be 10 MB or smaller.' }))
      return
    }
    setErrors(({ [key]: _, ...rest }) => rest)
    setFiles((f) => ({ ...f, [key]: file }))
  }

  function next() {
    const e = stepErrors(step, values, files, resubmit)
    setErrors(e)
    if (Object.keys(e).length === 0) setStep((s) => s + 1)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const e = stepErrors(3, values, files, resubmit)
    setErrors(e)
    if (Object.keys(e).length) return
    const form = new FormData()
    form.set('fullName', values.fullName.trim())
    form.set('contactPhone', values.contactPhone.trim())
    values.specialties.forEach((s) => form.append('specialties', s))
    form.set('qualifications', values.qualifications.trim())
    form.set('yearsOfExperience', values.yearsOfExperience)
    form.set('licenseNumber', values.licenseNumber.trim())
    form.set('bio', values.bio.trim())
    values.languagesSpoken.forEach((l) => form.append('languagesSpoken', l))
    form.set('department', values.department.trim())
    form.set('role', values.role)
    values.hospitalIds.forEach((h) => form.append('hospitalIds', h))
    values.workingDays.forEach((d) => form.append('workingDays', d))
    form.set('timeZone', values.timeZone)
    if (files.photo) form.set('photo', files.photo)
    if (files.medicalLicense) form.set('medicalLicense', files.medicalLicense)
    if (files.degreeCertificate) form.set('degreeCertificate', files.degreeCertificate)
    files.otherDocuments.forEach((f) => form.append('otherDocuments', f))
    setPending(true)
    setError(null)
    try {
      const saved = resubmit
        ? await apiPut<DoctorProfile>('/api/doctor/registration', form)
        : await apiPost<DoctorProfile>('/api/doctor/registration', form)
      onDone(saved)
    } catch (err) {
      setError(err)
      // Jump back to the first step with a field error the API reported.
      if (err instanceof ApiError) {
        const bad = STEP_FIELDS.findIndex((fields) => fields.some((f) => err.fieldErrors[f]))
        if (bad >= 0) setStep(bad)
        else if (err.code === 'invalid_license_number') {
          setErrors({ licenseNumber: err.message })
          setStep(1)
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
          <Field label="Full name" error={err('fullName')}>
            <input
              value={values.fullName}
              autoComplete="name"
              onChange={(e) => set('fullName', e.target.value)}
            />
          </Field>
          <Field
            label="Phone number"
            error={err('contactPhone')}
            hint="Include your country code, e.g. +61 4…"
          >
            <input
              value={values.contactPhone}
              type="tel"
              autoComplete="tel"
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </Field>
          <FilePicker
            label="Profile photo"
            optional
            accept=".jpg,.jpeg,.png,.webp"
            file={files.photo}
            existing={
              resubmit && doctor.hasPhoto
                ? 'Current photo kept unless you choose a new one.'
                : undefined
            }
            error={err('photo')}
            onPick={(f) => pickFile('photo', f)}
            onClear={() => setFiles((x) => ({ ...x, photo: null }))}
          />
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="dr-subtitle">Professional Details</h2>
          <Group label="Specialties" error={err('specialties')}>
            <div className="dr-multi">
              {specialties.data?.map((s) => (
                <label key={s.name}>
                  <input
                    type="checkbox"
                    checked={values.specialties.includes(s.name)}
                    onChange={() => toggle('specialties', s.name)}
                  />
                  {s.labelEn}
                </label>
              ))}
            </div>
          </Group>
          <div className="dr-grid-2">
            <Field label="Qualifications" error={err('qualifications')}>
              <input
                value={values.qualifications}
                placeholder="e.g. MBBS, FRACS"
                onChange={(e) => set('qualifications', e.target.value)}
              />
            </Field>
            <Field label="Years of experience" error={err('yearsOfExperience')}>
              <input
                type="number"
                min={0}
                max={70}
                value={values.yearsOfExperience}
                onChange={(e) => set('yearsOfExperience', e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="AHPRA registration number"
            error={err('licenseNumber')}
            hint="e.g. MED0001234567"
          >
            <input
              value={values.licenseNumber}
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => set('licenseNumber', e.target.value)}
            />
          </Field>
          <Group label="Languages spoken" error={err('languagesSpoken')}>
            <div className="dr-multi">
              {LANGUAGE_OPTIONS.map((l) => (
                <label key={l}>
                  <input
                    type="checkbox"
                    checked={values.languagesSpoken.includes(l)}
                    onChange={() => toggle('languagesSpoken', l)}
                  />
                  {l}
                </label>
              ))}
            </div>
          </Group>
          <Field label="Professional bio" error={err('bio')}>
            <textarea
              rows={4}
              maxLength={2000}
              value={values.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="dr-subtitle">Hospital Details &amp; Availability</h2>
          <div className="dr-grid-2">
            <Field label="Department" error={err('department')}>
              <input
                value={values.department}
                placeholder="e.g. Cardiology"
                onChange={(e) => set('department', e.target.value)}
              />
            </Field>
            <Group label="Role" error={err('role')}>
              <div className="dr-radios">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="role"
                      checked={values.role === value}
                      onChange={() => set('role', value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Group>
          </div>
          <Group label="Hospital affiliations" error={err('hospitalIds')} optional>
            {hospitals.data?.length === 0 ? (
              <p className="muted small">
                No hospitals are registered yet — you can add affiliations later.
              </p>
            ) : (
              <div className="dr-multi">
                {hospitals.data?.map((h) => (
                  <label key={h.id}>
                    <input
                      type="checkbox"
                      checked={values.hospitalIds.includes(h.id)}
                      onChange={() => toggle('hospitalIds', h.id)}
                    />
                    {h.name} — {h.city}
                  </label>
                ))}
              </div>
            )}
          </Group>
          <Field
            label="Time zone"
            error={err('timeZone')}
            hint="Consultation times are entered and shown in this zone."
          >
            <TimeZoneSelect value={values.timeZone} onChange={(z) => set('timeZone', z)} />
          </Field>
          <Group label="Working days" error={err('workingDays')}>
            <div className="dr-pills">
              {WORKING_DAYS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={values.workingDays.includes(code) ? 'dr-pill active' : 'dr-pill'}
                  aria-pressed={values.workingDays.includes(code)}
                  onClick={() => toggle('workingDays', code)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Group>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="dr-subtitle">Documents</h2>
          <p className="muted small" style={{ margin: 0 }}>
            PDF, JPG or PNG, up to 10 MB each.
            {resubmit && ' Your earlier documents are kept unless you upload a replacement.'}
          </p>
          {resubmit && doctor.documents.length > 0 && (
            <ul className="dr-files">
              {doctor.documents.map((d) => (
                <li key={d.index} className="dr-file">
                  <span className="dr-file-icon pdf">
                    <FileText size={16} />
                  </span>
                  <div className="dr-file-body">
                    <p className="dr-file-name">{d.fileName}</p>
                    <p className="muted small" style={{ margin: 0 }}>
                      {CATEGORY_LABELS[d.category]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <FilePicker
            label="Medical license"
            optional={resubmit}
            file={files.medicalLicense}
            error={err('medicalLicense')}
            onPick={(f) => pickFile('medicalLicense', f)}
            onClear={() => setFiles((x) => ({ ...x, medicalLicense: null }))}
          />
          <FilePicker
            label="Degree certificate"
            optional={resubmit}
            file={files.degreeCertificate}
            error={err('degreeCertificate')}
            onPick={(f) => pickFile('degreeCertificate', f)}
            onClear={() => setFiles((x) => ({ ...x, degreeCertificate: null }))}
          />
          <Group label="Other certificates" optional>
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
          {fees.data && (
            <div className="dr-banner info">
              Once MTA approves your registration, a one-time registration fee of{' '}
              <strong>{money(fees.data.registrationFeeAud)}</strong> unlocks your account, followed
              by an annual renewal of <strong>{money(fees.data.annualFeeAud)}</strong>.
            </div>
          )}
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

const CATEGORY_LABELS: Record<string, string> = {
  medical_license: 'Medical license',
  degree_certificate: 'Degree certificate',
  other: 'Other certificate',
}

export function Group({
  label,
  error,
  optional,
  children,
}: {
  label: ReactNode
  error?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div className="field" role="group">
      <span className="field-label">
        {label}
        {optional && <span className="muted small"> (optional)</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

export function FilePicker({
  label,
  file,
  error,
  optional,
  existing,
  accept = '.pdf,.jpg,.jpeg,.png',
  onPick,
  onClear,
}: {
  label: string
  file: File | null
  error?: string
  optional?: boolean
  existing?: string
  accept?: string
  onPick: (file: File | undefined) => void
  onClear: () => void
}) {
  return (
    <Group label={label} error={error} optional={optional}>
      <div className="row-start" style={{ alignItems: 'center' }}>
        <label className="button-secondary file-button">
          <Upload size={14} /> {file ? 'Replace' : 'Choose file'}
          <input
            type="file"
            hidden
            accept={accept}
            onChange={(e) => {
              onPick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {file ? (
          <span className="small">
            {file.name}{' '}
            <button
              type="button"
              className="dr-icon-button"
              aria-label={`Remove ${file.name}`}
              onClick={onClear}
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          existing && <span className="muted small">{existing}</span>
        )}
      </div>
    </Group>
  )
}
