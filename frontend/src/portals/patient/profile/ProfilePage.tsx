import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../../auth/AuthContext'
import { useToast } from '../../../components/Toasts'
import { Field, FormError, fieldError, Tabs } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { ApiError, apiDelete, apiPut } from '../../../lib/api'
import { drafts, useFormat } from '../../../lib/format'
import type { Profile } from '../../../lib/types'
import { usePatient } from '../PatientContext'
import { PaymentMethodsTab } from '../payments/PaymentMethodsTab'
import {
  EmergencyContactForm,
  MedicalBackgroundForm,
  PersonalInfoForm,
  useAvatarUrl,
} from './ProfileForms'

const TABS = ['personal', 'notifications', 'payment', 'security', 'deleteAccount'] as const
type Tab = (typeof TABS)[number]

export function ProfilePage() {
  const t = useT('profile')
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'personal'

  return (
    <section className="stack">
      <div>
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
      </div>
      <Tabs
        tabs={TABS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        active={tab}
        onChange={(id) => setParams({ tab: id })}
      />
      {tab === 'personal' && <PersonalTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'payment' && <PaymentMethodsTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'deleteAccount' && <DeleteAccountTab />}
    </section>
  )
}

function PersonalTab() {
  const t = useT('profile')
  const { profile, reloadProfile } = usePatient()
  const format = useFormat()
  const avatar = useAvatarUrl(profile.hasAvatar)
  const pd = (k: string) => t(`personalDetails.fields.${k}`)
  return (
    <div className="stack">
      <EditableCard
        title={t('personalDetails.title')}
        savedMessage={t('personalDetails.saved')}
        view={
          <div className="row-start">
            <span className="avatar-large">
              {avatar ? <img src={avatar} alt="" /> : profile.fullName.slice(0, 1)}
            </span>
            <dl className="details">
              <Detail label={pd('fullName')} value={profile.fullName} />
              <Detail label={pd('email')} value={profile.email} />
              <Detail label={pd('dateOfBirth')} value={format.date(profile.dateOfBirth)} />
              <Detail
                label={pd('gender')}
                value={profile.gender ? t(`personalDetails.genders.${profile.gender}`) : null}
              />
              <Detail label={pd('nationality')} value={profile.nationality} />
              <Detail label={pd('countryOfResidence')} value={profile.countryOfResidence} />
              <Detail label={pd('phone')} value={profile.phone} />
              <Detail label={pd('address')} value={profile.address} />
            </dl>
          </div>
        }
        form={(done) => (
          <PersonalInfoForm
            profile={profile}
            onSaved={() => done(reloadProfile)}
            submitLabel={t('save')}
          />
        )}
      />
      <EditableCard
        title={t('medicalBackground.title')}
        savedMessage={t('medicalBackground.saved')}
        view={
          <dl className="details">
            <Detail
              label={t('medicalBackground.fields.medicalHistory')}
              value={profile.medicalHistory}
            />
            <Detail
              label={t('medicalBackground.fields.allergies')}
              value={profile.allergies.join(', ')}
            />
            <Detail
              label={t('medicalBackground.fields.currentMedications')}
              value={profile.currentMedications.join(', ')}
            />
            <Detail
              label={t('medicalBackground.fields.pastSurgeries')}
              value={profile.pastSurgeries}
            />
          </dl>
        }
        form={(done) => (
          <MedicalBackgroundForm
            profile={profile}
            onSaved={() => done(reloadProfile)}
            submitLabel={t('save')}
          />
        )}
      />
      <EditableCard
        title={t('emergencyContact.title')}
        savedMessage={t('emergencyContact.saved')}
        view={
          <dl className="details">
            <Detail
              label={t('emergencyContact.fields.name')}
              value={profile.emergencyContactName}
            />
            <Detail
              label={t('emergencyContact.fields.relationship')}
              value={
                profile.emergencyContactRelationship &&
                t(`emergencyContact.relationships.${profile.emergencyContactRelationship}`)
              }
            />
            <Detail
              label={t('emergencyContact.fields.phone')}
              value={profile.emergencyContactPhone}
            />
          </dl>
        }
        form={(done) => (
          <EmergencyContactForm
            profile={profile}
            onSaved={() => done(reloadProfile)}
            submitLabel={t('save')}
          />
        )}
      />
    </div>
  )
}

function EditableCard({
  title,
  savedMessage,
  view,
  form,
}: {
  title: string
  savedMessage: string
  view: ReactNode
  form: (done: (reload: () => Promise<void>) => void) => ReactNode
}) {
  const t = useT('profile')
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  return (
    <section className="card stack">
      <div className="row-between">
        <h2>{title}</h2>
        {editing ? (
          <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
            {t('cancel')}
          </button>
        ) : (
          <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
            {t('edit')}
          </button>
        )}
      </div>
      {editing
        ? form(async (reload) => {
            await reload()
            setEditing(false)
            toast({ title: savedMessage, tone: 'good' })
          })
        : view}
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="small muted">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

function NotificationsTab() {
  const t = useT('profile.notifications')
  const { profile, reloadProfile } = usePatient()
  const toast = useToast()
  const [prefs, setPrefs] = useState({
    email: profile.emailNotificationsEnabled,
    sms: profile.smsNotificationsEnabled,
  })

  async function toggle(key: 'email' | 'sms') {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try {
      await apiPut<Profile>('/api/patient/profile/notification-preferences', {
        emailNotificationsEnabled: next.email,
        smsNotificationsEnabled: next.sms,
      })
      await reloadProfile()
      toast({ title: t('saved'), tone: 'good' })
    } catch {
      setPrefs(prefs) // revert on error
    }
  }

  return (
    <section className="card stack">
      <h2>{t('title')}</h2>
      <p className="muted">{t('intro')}</p>
      {(['email', 'sms'] as const).map((key) => (
        <label key={key} className="toggle-row">
          <span>
            <strong>{t(`${key}.label`)}</strong>
            <span className="small muted block">{t(`${key}.description`)}</span>
          </span>
          <input type="checkbox" role="switch" checked={prefs[key]} onChange={() => toggle(key)} />
        </label>
      ))}
    </section>
  )
}

function SecurityTab() {
  const t = useT('profile.security')
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formEl = event.currentTarget
    const f = new FormData(formEl)
    if (f.get('newPassword') !== f.get('confirmPassword')) {
      setError(new ApiError(400, 'validation_failed', t('errors.noMatch')))
      return
    }
    setPending(true)
    setError(null)
    try {
      await apiPut('/api/auth/password', {
        currentPassword: f.get('currentPassword'),
        newPassword: f.get('newPassword'),
      })
      formEl.reset()
      toast({ title: t('toasts.success'), tone: 'good' })
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_current_password'
          ? new ApiError(400, err.code, t('errors.incorrect'))
          : err,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card stack narrow">
      <div>
        <h2>{t('title')}</h2>
        <p className="muted">{t('subtitle')}</p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('fields.currentPassword')}>
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <Field label={t('fields.newPassword')} error={fieldError(error, 'newPassword')}>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label={t('fields.confirmPassword')}>
          <input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {t('updatePassword')}
        </button>
      </form>
    </section>
  )
}

function DeleteAccountTab() {
  const t = useT('profile.deleteAccount')
  const { logout } = useAuth()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function remove() {
    setPending(true)
    setError(null)
    try {
      await apiDelete('/api/patient/account', { confirm })
      drafts.clearAll()
      logout()
    } catch (err) {
      setError(err)
      setPending(false)
    }
  }

  return (
    <section className="card stack narrow danger-card">
      <h2>{t('warningTitle')}</h2>
      <p className="muted">{t('warningBody')}</p>
      <Field
        label={
          <>
            {t('confirmInstruction')} <code>DELETE</code> {t('confirmSuffix')}
          </>
        }
      >
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Field>
      <FormError error={error} />
      <button
        type="button"
        className="button-danger"
        disabled={confirm !== 'DELETE' || pending}
        onClick={remove}
      >
        {t('deleteButton')}
      </button>
    </section>
  )
}
