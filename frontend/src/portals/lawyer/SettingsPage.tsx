import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Bell, Briefcase, Lock, Pencil, X, type LucideIcon } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { Field, FormError, fieldError } from '../../components/ui'
import { ApiError, apiPut } from '../../lib/api'
import { AU_TIME_ZONES } from '../../lib/format'
import { Group } from '../doctor/registration/RegistrationForm'
import { KV, SecurityTab, Toggle } from '../doctor/settings/AccountSettingsPage'
import { formatDate, TimeZoneSelect } from '../doctor/shared'
import { useLawyer } from './LawyerContext'
import { CREDENTIALS, LAWYER_TYPES, STATES, type LawyerProfile } from './types'

type Tab = 'profile' | 'security' | 'notifications'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: Briefcase },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

export function LawyerSettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'profile') as Tab
  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Account &amp; Settings</h1>
        <p className="muted">Manage your practice details, registration, password and alerts.</p>
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
              <ProfileCard />
              <CredentialCard />
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

function SaveRow({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="row-end">
      <button type="button" className="button-secondary" onClick={onCancel} disabled={pending}>
        <X size={14} /> Cancel
      </button>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function codeErr(error: unknown, name: string, code?: string) {
  return (
    fieldError(error, name) ??
    (error instanceof ApiError && error.code === code ? error.message : undefined)
  )
}

function ProfileCard() {
  const lawyer = useLawyer()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState(lawyer.lawyerType)
  const [zone, setZone] = useState(lawyer.timeZone)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      lawyer.update(
        await apiPut<LawyerProfile>('/api/lawyer/profile', {
          lawyerType: type,
          timeZone: zone,
          ...Object.fromEntries(
            ['name', 'abnNumber', 'phone', 'address', 'city', 'zipCode', 'experience'].map((k) => [
              k,
              String(f.get(k) ?? '').trim(),
            ]),
          ),
        }),
      )
      setEditing(false)
      toast({ title: 'Profile updated.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <CardHead title="Practice details" editing={editing} onEdit={() => setEditing(true)} />
      {!editing ? (
        <div className="dr-kv">
          <KV label="Name" value={lawyer.name} />
          <KV label="Registered as" value={LAWYER_TYPES[lawyer.lawyerType]} />
          <KV label="Contact email" value={lawyer.contactEmail} />
          <KV label="ABN" value={lawyer.abnNumber} />
          <KV label="Phone" value={lawyer.phone} />
          <KV label="Address" value={lawyer.address} />
          <KV label="City / State" value={lawyer.city} />
          <KV label="Postcode" value={lawyer.zipCode} />
          <KV
            label="Time zone"
            value={AU_TIME_ZONES.find((z) => z.id === lawyer.timeZone)?.label}
          />
          <KV label="Immigration law experience" value={lawyer.experience} className="full" />
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Group label="Registered as" error={codeErr(error, 'lawyerType', 'invalid_lawyer_type')}>
            <div className="dr-radios">
              {Object.entries(LAWYER_TYPES).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    checked={type === value}
                    onChange={() => setType(value as LawyerProfile['lawyerType'])}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          </Group>
          <div className="dr-grid-2">
            <Field label="Name" error={codeErr(error, 'name')}>
              <input name="name" defaultValue={lawyer.name} required />
            </Field>
            <Field label="ABN" error={codeErr(error, 'abnNumber', 'invalid_abn')}>
              <input name="abnNumber" defaultValue={lawyer.abnNumber ?? ''} inputMode="numeric" />
            </Field>
            <Field label="Phone" error={codeErr(error, 'phone')}>
              <input name="phone" type="tel" defaultValue={lawyer.phone ?? ''} />
            </Field>
            <Field label="City / State" error={codeErr(error, 'city')}>
              <input name="city" defaultValue={lawyer.city ?? ''} />
            </Field>
            <Field label="Address" error={codeErr(error, 'address')}>
              <input name="address" defaultValue={lawyer.address ?? ''} />
            </Field>
            <Field label="Postcode" error={codeErr(error, 'zipCode')}>
              <input name="zipCode" defaultValue={lawyer.zipCode ?? ''} />
            </Field>
          </div>
          <Field label="Immigration law experience" error={codeErr(error, 'experience')} optional>
            <textarea
              name="experience"
              rows={3}
              maxLength={1000}
              defaultValue={lawyer.experience ?? ''}
            />
          </Field>
          <Field label="Time zone">
            <TimeZoneSelect value={zone} onChange={setZone} />
          </Field>
          <FormError error={error} />
          <SaveRow pending={pending} onCancel={() => setEditing(false)} />
        </form>
      )}
    </section>
  )
}

function CredentialCard() {
  const lawyer = useLawyer()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState(lawyer.credentialType ?? 'marn')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      lawyer.update(
        await apiPut<LawyerProfile>('/api/lawyer/profile/credential', {
          credentialType: type,
          credentialNumber: String(f.get('credentialNumber') ?? '').trim(),
          practisingState: type === 'practising_certificate' ? f.get('practisingState') : null,
          credentialExpiresOn: String(f.get('credentialExpiresOn') ?? '') || null,
        }),
      )
      setEditing(false)
      toast({ title: 'Registration updated. MTA will re-check it.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <CardHead title="Registration" editing={editing} onEdit={() => setEditing(true)} />
      {!editing ? (
        <div className="dr-kv">
          <KV
            label="Credential"
            value={lawyer.credentialType ? CREDENTIALS[lawyer.credentialType] : null}
          />
          <KV
            label={lawyer.credentialType === 'marn' ? 'MARN' : 'Certificate number'}
            value={lawyer.credentialNumber}
          />
          {lawyer.credentialType === 'practising_certificate' && (
            <KV label="Issued in" value={lawyer.practisingState} />
          )}
          <KV label="Expires" value={formatDate(lawyer.credentialExpiresOn)} />
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted small" style={{ margin: 0 }}>
            Update this when you renew. MTA checks the public register again.
          </p>
          <Group
            label="Credential"
            error={codeErr(error, 'credentialType', 'invalid_credential_type')}
          >
            <div className="dr-radios lw-stack-radios">
              {Object.entries(CREDENTIALS).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    checked={type === value}
                    onChange={() => setType(value as 'marn' | 'practising_certificate')}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          </Group>
          <div className="dr-grid-2">
            <Field
              label={type === 'marn' ? 'MARN' : 'Certificate number'}
              error={
                codeErr(error, 'credentialNumber', 'invalid_marn') ??
                codeErr(error, 'credentialNumber', 'invalid_practising_certificate')
              }
            >
              <input name="credentialNumber" defaultValue={lawyer.credentialNumber ?? ''} />
            </Field>
            {type === 'practising_certificate' && (
              <Field
                label="Issued in"
                error={codeErr(error, 'practisingState', 'invalid_practising_state')}
              >
                <select name="practisingState" defaultValue={lawyer.practisingState ?? ''}>
                  <option value="">Choose…</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Expires on"
              error={codeErr(error, 'credentialExpiresOn', 'invalid_credential_expiry')}
            >
              <input
                name="credentialExpiresOn"
                type="date"
                defaultValue={lawyer.credentialExpiresOn ?? ''}
              />
            </Field>
          </div>
          <FormError error={error} />
          <SaveRow pending={pending} onCancel={() => setEditing(false)} />
        </form>
      )}
    </section>
  )
}

function NotificationsTab() {
  const lawyer = useLawyer()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  async function save(
    patch: Partial<{ emailNotificationsEnabled: boolean; smsNotificationsEnabled: boolean }>,
  ) {
    setPending(true)
    try {
      lawyer.update(
        await apiPut<LawyerProfile>('/api/lawyer/profile/notification-preferences', {
          emailNotificationsEnabled: lawyer.emailNotificationsEnabled,
          smsNotificationsEnabled: lawyer.smsNotificationsEnabled,
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
        description="Emails when MTA assigns you a case, when a patient uploads a document, and for MTA messages."
        checked={lawyer.emailNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ emailNotificationsEnabled: v })}
      />
      <Toggle
        title="SMS notifications"
        description="Text messages for time-sensitive updates."
        checked={lawyer.smsNotificationsEnabled}
        disabled={pending}
        onChange={(v) => save({ smsNotificationsEnabled: v })}
      />
    </section>
  )
}
