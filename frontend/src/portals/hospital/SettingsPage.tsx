import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Bell, Building2, Lock, Pencil, X, type LucideIcon } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { Field, FormError, fieldError } from '../../components/ui'
import { ApiError, apiPut } from '../../lib/api'
import type { Specialty } from '../../lib/cases'
import { useApi } from '../../lib/useApi'
import { Group } from '../doctor/registration/RegistrationForm'
import { KV, SecurityTab, Toggle } from '../doctor/settings/AccountSettingsPage'
import { useHospital } from './HospitalContext'
import { HOSPITAL_TYPES, type HospitalProfile } from './types'

type Tab = 'profile' | 'security' | 'notifications'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Hospital Profile', icon: Building2 },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

export function HospitalSettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'profile') as Tab
  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Account &amp; Settings</h1>
        <p className="muted">Manage your hospital's profile, password and notifications.</p>
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
          {tab === 'profile' && (
            <>
              <BasicInfoCard />
              <DetailsCard />
            </>
          )}
          {tab === 'security' && <SecurityTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </div>
  )
}

function CardHead({
  title,
  editing,
  onEdit,
}: {
  title: string
  editing: boolean
  onEdit: () => void
}) {
  return (
    <div className="row-between">
      <h2 className="dr-subtitle">{title}</h2>
      {!editing && (
        <button type="button" className="button-secondary" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
      )}
    </div>
  )
}

function BasicInfoCard() {
  const hospital = useHospital()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      hospital.update(
        await apiPut<HospitalProfile>(
          '/api/hospital/profile/basic',
          Object.fromEntries(
            [
              'name',
              'registrationNumber',
              'abnNumber',
              'phone',
              'country',
              'city',
              'address',
              'zipCode',
            ].map((k) => [k, String(f.get(k) ?? '').trim()]),
          ),
        ),
      )
      setEditing(false)
      toast({ title: 'Hospital details updated.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  const fieldErr = (name: string, code?: string) =>
    fieldError(error, name) ??
    (error instanceof ApiError && error.code === code ? error.message : undefined)

  return (
    <section className="dr-card stack">
      <CardHead title="Basic information" editing={editing} onEdit={() => setEditing(true)} />
      {!editing ? (
        <div className="dr-kv">
          <KV label="Hospital name" value={hospital.name} />
          <KV label="Contact email" value={hospital.contactEmail} />
          <KV label="Registration number" value={hospital.registrationNumber} />
          <KV label="ABN" value={hospital.abnNumber} />
          <KV label="Phone" value={hospital.phone} />
          <KV label="Address" value={hospital.address} />
          <KV label="State / City" value={hospital.city} />
          <KV label="Country" value={hospital.country} />
          <KV label="Zip / postcode" value={hospital.zipCode} />
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label="Hospital name" error={fieldErr('name')}>
            <input name="name" defaultValue={hospital.name} required />
          </Field>
          <div className="dr-grid-2">
            <Field
              label="Registration number"
              error={fieldErr('registrationNumber', 'invalid_registration_number')}
            >
              <input name="registrationNumber" defaultValue={hospital.registrationNumber ?? ''} />
            </Field>
            <Field label="ABN" error={fieldErr('abnNumber', 'invalid_abn')}>
              <input name="abnNumber" defaultValue={hospital.abnNumber ?? ''} inputMode="numeric" />
            </Field>
            <Field label="Phone" error={fieldErr('phone')}>
              <input name="phone" type="tel" defaultValue={hospital.phone ?? ''} />
            </Field>
            <Field label="Country" error={fieldErr('country')}>
              <input name="country" defaultValue={hospital.country} />
            </Field>
            <Field label="State / City" error={fieldErr('city')}>
              <input name="city" defaultValue={hospital.city} />
            </Field>
            <Field label="Zip / postcode" error={fieldErr('zipCode')}>
              <input name="zipCode" defaultValue={hospital.zipCode ?? ''} />
            </Field>
          </div>
          <Field label="Full address" error={fieldErr('address')}>
            <input name="address" defaultValue={hospital.address ?? ''} />
          </Field>
          <p className="muted small" style={{ margin: 0 }}>
            The contact email is your login email: {hospital.contactEmail}.
          </p>
          <FormError error={error} />
          <div className="row-end">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function DetailsCard() {
  const hospital = useHospital()
  const toast = useToast()
  const specialties = useApi<Specialty[]>('/api/specialties')
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState(hospital.registrationType ?? '')
  const [chosen, setChosen] = useState<string[]>(hospital.specialties)
  const [rooms, setRooms] = useState<string[]>(hospital.roomTypes)
  const [roomDraft, setRoomDraft] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  function startEditing() {
    setType(hospital.registrationType ?? '')
    setChosen(hospital.specialties)
    setRooms(hospital.roomTypes)
    setEditing(true)
  }

  function addRoom() {
    const room = roomDraft.trim()
    if (room && !rooms.includes(room)) setRooms([...rooms, room])
    setRoomDraft('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      hospital.update(
        await apiPut<HospitalProfile>('/api/hospital/profile/details', {
          registrationType: type,
          specialties: chosen,
          bedCount: Number(f.get('bedCount')),
          roomTypes: rooms,
          licenseNumber: String(f.get('licenseNumber') ?? '').trim(),
          accreditationBody: String(f.get('accreditationBody') ?? '').trim(),
        }),
      )
      setEditing(false)
      toast({ title: 'Hospital details updated.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <CardHead title="Hospital details" editing={editing} onEdit={startEditing} />
      {!editing ? (
        <div className="dr-kv">
          <KV
            label="Hospital type"
            value={hospital.registrationType ? HOSPITAL_TYPES[hospital.registrationType] : null}
          />
          <KV label="Number of beds" value={hospital.bedCount} />
          <KV label="License number" value={hospital.licenseNumber} />
          <KV label="Accreditation body" value={hospital.accreditationBody} />
          <KV label="Specialties" value={hospital.specialties.join(', ')} className="full" />
          <KV label="Room types" value={hospital.roomTypes.join(', ')} className="full" />
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Group label="Hospital type" error={fieldError(error, 'registrationType')}>
            <div className="dr-radios">
              {Object.entries(HOSPITAL_TYPES).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" checked={type === value} onChange={() => setType(value)} />{' '}
                  {label}
                </label>
              ))}
            </div>
          </Group>
          <Group label="Specialties" error={fieldError(error, 'specialties')}>
            <div className="dr-multi">
              {specialties.data?.map((s) => (
                <label key={s.name}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(s.name)}
                    onChange={() =>
                      setChosen((c) =>
                        c.includes(s.name) ? c.filter((x) => x !== s.name) : [...c, s.name],
                      )
                    }
                  />
                  {s.labelEn}
                </label>
              ))}
            </div>
          </Group>
          <div className="dr-grid-2">
            <Field label="Number of beds" error={fieldError(error, 'bedCount')}>
              <input name="bedCount" type="number" min={1} defaultValue={hospital.bedCount ?? ''} />
            </Field>
            <Field label="License number" error={fieldError(error, 'licenseNumber')}>
              <input name="licenseNumber" defaultValue={hospital.licenseNumber ?? ''} />
            </Field>
          </div>
          <Group label="Room types" error={fieldError(error, 'roomTypes')}>
            <div className="row-start" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              {rooms.map((room) => (
                <span key={room} className="hp-tag">
                  {room}
                  <button
                    type="button"
                    aria-label={`Remove ${room}`}
                    onClick={() => setRooms(rooms.filter((r) => r !== room))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="hp-add-row">
              <input
                value={roomDraft}
                placeholder="Add a room type"
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
          <Field label="Accreditation body" error={fieldError(error, 'accreditationBody')}>
            <input name="accreditationBody" defaultValue={hospital.accreditationBody ?? ''} />
          </Field>
          <FormError error={error} />
          <div className="row-end">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function NotificationsTab() {
  const hospital = useHospital()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  async function save(
    patch: Partial<{ emailNotificationsEnabled: boolean; smsNotificationsEnabled: boolean }>,
  ) {
    setPending(true)
    try {
      hospital.update(
        await apiPut<HospitalProfile>('/api/hospital/profile/notification-preferences', {
          emailNotificationsEnabled: hospital.emailNotificationsEnabled,
          smsNotificationsEnabled: hospital.smsNotificationsEnabled,
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
        description="Emails when a doctor names your hospital in a plan, when a patient pays for treatment, and for MTA messages."
        checked={hospital.emailNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ emailNotificationsEnabled: v })}
      />
      <Toggle
        title="SMS notifications"
        description="Text messages for time-sensitive updates."
        checked={hospital.smsNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ smsNotificationsEnabled: v })}
      />
    </section>
  )
}
