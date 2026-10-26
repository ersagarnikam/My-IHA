import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  Bell,
  Camera,
  Clock,
  CreditCard,
  Download,
  FileText,
  Pencil,
  Shield,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react'
import { useToast } from '../../../components/Toasts'
import { Empty, ErrorState, Field, FormError, fieldError, Loading } from '../../../components/ui'
import { ApiError, apiPut, openFile } from '../../../lib/api'
import type { Specialty } from '../../../lib/cases'
import { useApi } from '../../../lib/useApi'
import { Checkout } from '../../patient/payments/Checkout'
import { useDoctor } from '../DoctorContext'
import { initial } from '../DoctorLayout'
import { formatDate, money, TimeZoneSelect, zoneTimeLabel } from '../shared'
import {
  GENDER_LABELS,
  LANGUAGE_OPTIONS,
  ROLE_LABELS,
  type AvailabilityDay,
  type Billing,
  type DoctorProfile,
  type HospitalChoice,
} from '../types'
import { useDoctorPhoto } from './useDoctorPhoto'

type Tab =
  | 'profile'
  | 'availability'
  | 'indemnity'
  | 'billing'
  | 'invoices'
  | 'security'
  | 'notifications'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'availability', label: 'Availability', icon: Clock },
  { id: 'indemnity', label: 'Indemnity', icon: ShieldCheck },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

export function AccountSettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'profile') as Tab
  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Account &amp; Settings</h1>
        <p className="muted">Manage your profile, availability, and preferences.</p>
      </div>
      <div className="dr-settings">
        <nav className="dr-settings-nav" aria-label="Settings">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setParams(id === 'profile' ? {} : { tab: id }, { replace: true })}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="dr-settings-body">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'availability' && (
            <>
              <TimeZoneCard />
              <AvailabilityTab />
            </>
          )}
          {tab === 'indemnity' && <IndemnityTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'invoices' && <InvoicesTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </div>
  )
}

// ── Profile ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const doctor = useDoctor()
  const hospitals = useApi<HospitalChoice[]>('/api/doctor/hospitals')
  const [editing, setEditing] = useState<'personal' | 'professional' | null>(null)
  const hospitalNames = doctor.hospitalIds
    .map((id) => hospitals.data?.find((h) => h.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <section className="dr-card stack">
        <div className="row-between">
          <div className="row-start" style={{ alignItems: 'center' }}>
            <PhotoButton />
            <h2 className="dr-subtitle">Personal Details</h2>
          </div>
          {editing !== 'personal' && (
            <button type="button" className="button-link" onClick={() => setEditing('personal')}>
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
        {editing === 'personal' ? (
          <PersonalForm onDone={() => setEditing(null)} />
        ) : (
          <div className="dr-kv">
            <KV label="Full Name" value={doctor.fullName} />
            <KV label="Email" value={doctor.contactEmail} />
            <KV label="Phone Number" value={doctor.contactPhone} />
            <KV
              label="Date of Birth"
              value={doctor.dateOfBirth ? formatDate(doctor.dateOfBirth) : null}
            />
            <KV label="Gender" value={doctor.gender ? GENDER_LABELS[doctor.gender] : null} />
          </div>
        )}
      </section>

      <section className="dr-card stack">
        <div className="row-between">
          <h2 className="dr-subtitle">Professional Details</h2>
          {editing !== 'professional' && (
            <button
              type="button"
              className="button-link"
              onClick={() => setEditing('professional')}
            >
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
        {editing === 'professional' ? (
          <ProfessionalForm hospitals={hospitals.data ?? []} onDone={() => setEditing(null)} />
        ) : (
          <div className="dr-kv">
            <KV label="Specialization" value={doctor.specialties.join(', ')} />
            <KV label="Qualification" value={doctor.qualifications} />
            <KV label="Experience (Years)" value={doctor.yearsOfExperience} />
            <KV label="License Number" value={doctor.licenseNumber} />
            <KV label="Department" value={doctor.department} />
            <KV label="Role" value={doctor.role ? ROLE_LABELS[doctor.role] : null} />
            <KV
              label="Languages Spoken"
              value={doctor.languagesSpoken.join(', ')}
              className="full"
            />
            <KV label="Hospital Affiliations" value={hospitalNames} className="full" />
            <KV label="Bio" value={doctor.bio} className="full" />
          </div>
        )}
      </section>
    </>
  )
}

export function KV({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="dr-fact-label">{label}</p>
      <p className="dr-fact-value prewrap">
        {value === null || value === undefined || value === '' ? '—' : value}
      </p>
    </div>
  )
}

function PhotoButton() {
  const doctor = useDoctor()
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const photo = useDoctorPhoto(doctor.hasPhoto, version)
  const [pending, setPending] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    const form = new FormData()
    form.set('file', file)
    setPending(true)
    try {
      doctor.update(await apiPut<DoctorProfile>('/api/doctor/profile/photo', form))
      setVersion((v) => v + 1)
      toast({ title: 'Profile photo updated.', tone: 'good' })
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not upload the photo.',
        tone: 'bad',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <label
      className="avatar-upload"
      title="Change photo"
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      {photo ? (
        <img src={photo} alt="" className="avatar" style={{ width: 44, height: 44 }} />
      ) : (
        <span className="avatar" style={{ width: 44, height: 44 }}>
          {initial(doctor.fullName)}
        </span>
      )}
      <Camera size={12} style={{ position: 'absolute', right: -2, bottom: -2 }} />
      <input
        type="file"
        hidden
        disabled={pending}
        accept=".jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          void upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </label>
  )
}

function PersonalForm({ onDone }: { onDone: () => void }) {
  const doctor = useDoctor()
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      doctor.update(
        await apiPut<DoctorProfile>('/api/doctor/profile/personal', {
          fullName: f.get('fullName'),
          contactPhone: f.get('contactPhone'),
          dateOfBirth: f.get('dateOfBirth') || null,
          gender: f.get('gender'),
        }),
      )
      toast({ title: 'Profile updated.', tone: 'good' })
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="dr-grid-2">
        <Field label="Full Name" error={fieldError(error, 'fullName')}>
          <input name="fullName" defaultValue={doctor.fullName} required minLength={2} />
        </Field>
        <Field label="Email" hint="Your sign-in email can't be changed here.">
          <input value={doctor.contactEmail ?? ''} disabled readOnly />
        </Field>
        <Field label="Phone Number" error={fieldError(error, 'contactPhone')}>
          <input name="contactPhone" type="tel" defaultValue={doctor.contactPhone ?? ''} required />
        </Field>
        <Field label="Date of Birth" error={fieldError(error, 'dateOfBirth')}>
          <input name="dateOfBirth" type="date" defaultValue={doctor.dateOfBirth ?? ''} required />
        </Field>
        <Field label="Gender" error={fieldError(error, 'gender')}>
          <select name="gender" defaultValue={doctor.gender ?? ''} required>
            <option value="" disabled>
              Select
            </option>
            {Object.entries(GENDER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FormError error={error} />
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function ProfessionalForm({
  hospitals,
  onDone,
}: {
  hospitals: HospitalChoice[]
  onDone: () => void
}) {
  const doctor = useDoctor()
  const toast = useToast()
  const specialties = useApi<Specialty[]>('/api/specialties')
  const [chosen, setChosen] = useState({
    specialties: doctor.specialties,
    languagesSpoken: doctor.languagesSpoken,
    hospitalIds: doctor.hospitalIds,
  })
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const toggle = (key: keyof typeof chosen, item: string) =>
    setChosen((c) => ({
      ...c,
      [key]: c[key].includes(item) ? c[key].filter((x) => x !== item) : [...c[key], item],
    }))
  const languages = Array.from(new Set([...LANGUAGE_OPTIONS, ...doctor.languagesSpoken]))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      doctor.update(
        await apiPut<DoctorProfile>('/api/doctor/profile/professional', {
          ...chosen,
          qualifications: f.get('qualifications'),
          yearsOfExperience: Number(f.get('yearsOfExperience')),
          licenseNumber: f.get('licenseNumber'),
          bio: f.get('bio'),
          department: f.get('department'),
          role: f.get('role'),
        }),
      )
      toast({ title: 'Professional details updated.', tone: 'good' })
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field" role="group">
        <span className="field-label">Specialization</span>
        <div className="dr-multi">
          {specialties.data?.map((s) => (
            <label key={s.name}>
              <input
                type="checkbox"
                checked={chosen.specialties.includes(s.name)}
                onChange={() => toggle('specialties', s.name)}
              />
              {s.labelEn}
            </label>
          ))}
        </div>
        {fieldError(error, 'specialties') && (
          <span className="field-error">{fieldError(error, 'specialties')}</span>
        )}
      </div>
      <div className="dr-grid-2">
        <Field label="Qualification" error={fieldError(error, 'qualifications')}>
          <input name="qualifications" defaultValue={doctor.qualifications ?? ''} required />
        </Field>
        <Field label="Experience (Years)" error={fieldError(error, 'yearsOfExperience')}>
          <input
            name="yearsOfExperience"
            type="number"
            min={0}
            max={70}
            defaultValue={doctor.yearsOfExperience ?? 0}
            required
          />
        </Field>
        <Field
          label="License Number"
          error={fieldError(error, 'licenseNumber')}
          hint="e.g. MED0001234567"
        >
          <input name="licenseNumber" defaultValue={doctor.licenseNumber ?? ''} required />
        </Field>
        <Field label="Department" error={fieldError(error, 'department')}>
          <input name="department" defaultValue={doctor.department ?? ''} required />
        </Field>
        <Field label="Role" error={fieldError(error, 'role')}>
          <select name="role" defaultValue={doctor.role ?? ''} required>
            <option value="" disabled>
              Select
            </option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field" role="group">
        <span className="field-label">Languages Spoken</span>
        <div className="dr-multi">
          {languages.map((l) => (
            <label key={l}>
              <input
                type="checkbox"
                checked={chosen.languagesSpoken.includes(l)}
                onChange={() => toggle('languagesSpoken', l)}
              />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="field" role="group">
        <span className="field-label">Hospital Affiliations</span>
        <div className="dr-multi">
          {hospitals.map((h) => (
            <label key={h.id}>
              <input
                type="checkbox"
                checked={chosen.hospitalIds.includes(h.id)}
                onChange={() => toggle('hospitalIds', h.id)}
              />
              {h.name} — {h.city}
            </label>
          ))}
        </div>
      </div>
      <Field label="Bio" error={fieldError(error, 'bio')}>
        <textarea name="bio" rows={4} maxLength={2000} defaultValue={doctor.bio ?? ''} required />
      </Field>
      <FormError error={error} />
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// ── Availability ────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 ? '30' : '00'
  return {
    value: `${String(h).padStart(2, '0')}:${m}`,
    label: `${String(h % 12 || 12).padStart(2, '0')}:${m} ${h < 12 ? 'AM' : 'PM'}`,
  }
})

function TimeZoneCard() {
  const doctor = useDoctor()
  const toast = useToast()
  const [zone, setZone] = useState(doctor.timeZone)
  const [pending, setPending] = useState(false)

  async function save() {
    setPending(true)
    try {
      doctor.update(
        await apiPut<DoctorProfile>('/api/doctor/profile/time-zone', { timeZone: zone }),
      )
      toast({ title: 'Time zone updated.', tone: 'good' })
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Could not save.', tone: 'bad' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">Time zone</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Consultation times you propose, and the times you see, are in this zone. Patients also see
          their own local time.
        </p>
      </div>
      <div className="row-start" style={{ gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <TimeZoneSelect value={zone} onChange={setZone} />
        <button type="button" disabled={pending || zone === doctor.timeZone} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

// ── Indemnity ───────────────────────────────────────────────────────────

/** Wording for MTA's lawyer to confirm before launch. */
function IndemnityTab() {
  const doctor = useDoctor()
  const toast = useToast()
  const current = doctor.indemnity
  const [insurer, setInsurer] = useState(current?.insurer ?? '')
  const [policyNumber, setPolicyNumber] = useState(current?.policyNumber ?? '')
  const [expiresOn, setExpiresOn] = useState(current?.expiresOn ?? '')
  const [coversOverseas, setCoversOverseas] = useState(current?.coversOverseas ?? false)
  const [ack, setAck] = useState(current?.telehealthGuidelinesAck ?? false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      doctor.update(
        await apiPut<DoctorProfile>('/api/doctor/profile/indemnity', {
          insurer,
          policyNumber,
          expiresOn: expiresOn || null,
          coversOverseas,
          telehealthGuidelinesAck: ack,
        }),
      )
      toast({ title: 'Indemnity declaration saved.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="dr-card stack" onSubmit={save}>
      <div>
        <h2 className="dr-subtitle">Professional indemnity &amp; telehealth</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Zoom consultations with patients overseas need professional indemnity insurance that
          covers patients located outside Australia. You can offer consultation times once this is
          declared and current.
        </p>
      </div>
      {current && (
        <p
          className={`dr-banner${doctor.indemnityStatus === 'valid' ? ' info' : ' bad'}`}
          style={{ margin: 0 }}
        >
          {doctor.indemnityStatus === 'valid'
            ? `Declared ${formatDate(current.declaredAt)}; cover runs until ${formatDate(current.expiresOn)}.`
            : `Your cover expired on ${formatDate(current.expiresOn)}. Enter your renewed policy.`}
        </p>
      )}
      <div className="dr-grid-2">
        <Field label="Insurer (MDO)" error={fieldError(error, 'insurer')}>
          <input
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            placeholder="e.g. Avant, MDA National, MIGA, Tego"
            maxLength={120}
          />
        </Field>
        <Field label="Policy or membership number" error={fieldError(error, 'policyNumber')}>
          <input
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
            maxLength={60}
          />
        </Field>
        <Field label="Cover expires on" error={fieldError(error, 'expiresOn')}>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </Field>
      </div>
      <label className="dr-check-row">
        <input
          type="checkbox"
          checked={coversOverseas}
          onChange={(e) => setCoversOverseas(e.target.checked)}
        />
        <span>
          I confirm my indemnity insurance covers consultations with patients located outside
          Australia, including by video.
        </span>
      </label>
      <label className="dr-check-row">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>
          I have read and will follow the Medical Board of Australia&apos;s{' '}
          <a
            href="https://www.medicalboard.gov.au/Codes-Guidelines-Policies/Telehealth-consultations-with-patients.aspx"
            target="_blank"
            rel="noreferrer"
          >
            guidelines for telehealth consultations with patients
          </a>
          , and I hold the registration needed to consult patients in their location where it
          applies.
        </span>
      </label>
      <FormError error={error} />
      <div className="row-end">
        <button type="submit" disabled={pending || !insurer || !policyNumber || !expiresOn}>
          {pending ? 'Saving…' : current ? 'Update declaration' : 'Save declaration'}
        </button>
      </div>
    </form>
  )
}

function AvailabilityTab() {
  const doctor = useDoctor()
  const toast = useToast()
  const [days, setDays] = useState<AvailabilityDay[]>(doctor.availability)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const update = (i: number, patch: Partial<AvailabilityDay>) =>
    setDays((d) => d.map((day, j) => (j === i ? { ...day, ...patch } : day)))

  async function save() {
    setPending(true)
    setError(null)
    try {
      doctor.update(await apiPut<DoctorProfile>('/api/doctor/profile/availability', days))
      toast({ title: 'Availability updated.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">Availability</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Set the hours you're available each day of the week ({zoneTimeLabel()}).
        </p>
      </div>
      <div>
        {days.map((d, i) => (
          <div key={d.day} className="dr-day">
            <span className="capitalize" style={{ fontWeight: 500 }}>
              {d.day}
            </span>
            <label className="toggle-row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                aria-label={`Working on ${d.day}`}
                checked={d.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
            </label>
            {d.enabled ? (
              <div className="dr-day-hours">
                <select
                  aria-label={`${d.day} start`}
                  value={d.start_time}
                  onChange={(e) => update(i, { start_time: e.target.value })}
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
                <span className="muted">–</span>
                <select
                  aria-label={`${d.day} end`}
                  value={d.end_time}
                  onChange={(e) => update(i, { end_time: e.target.value })}
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="muted small">Not Working On this Day</span>
            )}
          </div>
        ))}
      </div>
      <FormError error={error} />
      <div className="row-end">
        <button type="button" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save Availability'}
        </button>
      </div>
    </section>
  )
}

// ── Billing and invoices ────────────────────────────────────────────────

function BillingTab() {
  const doctor = useDoctor()
  const billing = useApi<Billing>('/api/doctor/billing')
  const [paying, setPaying] = useState(false)
  if (billing.error) return <ErrorState error={billing.error} onRetry={billing.reload} />
  if (!billing.data) return <Loading />
  const b = billing.data
  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">Billing</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Your annual renewal fee.
        </p>
      </div>
      <div className="panel row-between">
        <div>
          <strong>Annual renewal fee — {money(b.annualFeeAud)}</strong>
          <p className="muted small" style={{ margin: 0 }}>
            {b.annualFeeNextDueAt
              ? `Next due ${formatDate(b.annualFeeNextDueAt)}`
              : 'No renewal date set yet.'}
          </p>
        </div>
        {b.annualFeeDue && !paying && (
          <button type="button" onClick={() => setPaying(true)}>
            Pay now
          </button>
        )}
      </div>
      {paying && (
        <Checkout
          checkoutPath="/api/doctor/billing/checkout"
          body={{ feeType: 'annual' }}
          simulatePath={(intentId) => `/api/doctor/billing/simulate/${intentId}`}
          onPaid={() => {
            setPaying(false)
            void billing.reload()
            void doctor.reload()
          }}
        />
      )}
    </section>
  )
}

function InvoicesTab() {
  const toast = useToast()
  const billing = useApi<Billing>('/api/doctor/billing')
  if (billing.error) return <ErrorState error={billing.error} onRetry={billing.reload} />
  if (!billing.data) return <Loading />
  const paid = billing.data.payments.filter((p) => p.paidAt !== null)
  if (paid.length === 0)
    return (
      <Empty title="No invoices yet">
        <p className="muted">Your payment history will appear here once you've been charged.</p>
      </Empty>
    )
  return (
    <section className="dr-card">
      <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
        Invoices
      </h2>
      <div className="dr-table-wrap">
        <table className="dr-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.paidAt)}</td>
                <td>{p.feeType === 'registration' ? 'Registration Fee' : 'Annual Renewal Fee'}</td>
                <td>
                  {money(p.amountAud)}
                  {p.refundedAud > 0 && (
                    <div className="muted small">{money(p.refundedAud)} refunded</div>
                  )}
                </td>
                <td>
                  {p.status === 'refunded' ? (
                    <span className="badge badge-sm badge-muted">Refunded</span>
                  ) : p.refundedAud > 0 ? (
                    <span className="badge badge-sm badge-warn">Partly refunded</span>
                  ) : (
                    <span className="badge badge-sm badge-good">Paid</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="dr-icon-button"
                    aria-label="Download invoice"
                    onClick={() =>
                      openFile(
                        `/api/doctor/billing/payments/${p.id}/invoice`,
                        `MTA-invoice-${p.id.slice(0, 8)}.pdf`,
                      ).catch(() =>
                        toast({ title: 'Could not download the invoice.', tone: 'bad' }),
                      )
                    }
                  >
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Security and notifications ──────────────────────────────────────────

export function SecurityTab() {
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const f = new FormData(form)
    if (f.get('newPassword') !== f.get('confirmPassword')) {
      setError(new ApiError(400, 'validation_failed', 'Passwords do not match.'))
      return
    }
    setPending(true)
    setError(null)
    try {
      await apiPut('/api/auth/password', {
        currentPassword: f.get('currentPassword'),
        newPassword: f.get('newPassword'),
      })
      form.reset()
      toast({ title: 'Password updated.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card">
      <form className="stack narrow" onSubmit={submit}>
        <h2 className="dr-subtitle">Change Password</h2>
        <Field label="Current password">
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <Field
          label="New password"
          error={fieldError(error, 'newPassword')}
          hint="At least 8 characters, with an uppercase letter and a number."
        >
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label="Confirm new password">
          <input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
        <FormError error={error} />
        <div className="row-end">
          <button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Update Password'}
          </button>
        </div>
      </form>
    </section>
  )
}

function NotificationsTab() {
  const doctor = useDoctor()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  async function save(
    patch: Partial<{ emailNotificationsEnabled: boolean; smsNotificationsEnabled: boolean }>,
  ) {
    setPending(true)
    try {
      doctor.update(
        await apiPut<DoctorProfile>('/api/doctor/profile/notification-preferences', {
          emailNotificationsEnabled: doctor.emailNotificationsEnabled,
          smsNotificationsEnabled: doctor.smsNotificationsEnabled,
          ...patch,
        }),
      )
      toast({ title: 'Notification preferences updated.', tone: 'good' })
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Could not save.', tone: 'bad' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <h2 className="dr-subtitle">Notification Preferences</h2>
      <Toggle
        title="Email notifications"
        description="Receive emails for case updates, treatment plans, and messages from MTA."
        checked={doctor.emailNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ emailNotificationsEnabled: v })}
      />
      <Toggle
        title="SMS notifications"
        description="Receive text messages for time-sensitive updates like consultation requests."
        checked={doctor.smsNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ smsNotificationsEnabled: v })}
      />
    </section>
  )
}

export function Toggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong className="block">{title}</strong>
        <span className="muted small">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
