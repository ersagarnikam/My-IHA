import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Field, FormError, fieldError } from '../../../components/ui'
import { useLocale, useT } from '../../../i18n/I18nContext'
import { apiPut, authHeaders } from '../../../lib/api'
import { countries } from '../../../lib/countries'
import type { Profile } from '../../../lib/types'

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const
export const RELATIONSHIPS = [
  'Spouse',
  'Parent',
  'Child',
  'Sibling',
  'Grandparent',
  'Aunt / Uncle',
  'Cousin',
  'Friend',
  'Guardian',
  'Other',
]

type FormProps = {
  profile: Profile
  onSaved: (profile: Profile) => void
  submitLabel: string
  secondary?: ReactNode
}

function useSave(path: string, onSaved: (p: Profile) => void) {
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  async function save(body: unknown) {
    setPending(true)
    setError(null)
    try {
      onSaved(await apiPut<Profile>(path, body))
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }
  return { error, pending, save }
}

export function PersonalInfoForm({ profile, onSaved, submitLabel, secondary }: FormProps) {
  const t = useT('profile.personalDetails')
  const tp = useT('profile')
  const { locale } = useLocale()
  const countryList = useMemo(() => countries(locale), [locale])
  const { error, pending, save } = useSave('/api/patient/profile/personal-info', onSaved)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    void save({
      fullName: f.get('fullName'),
      dateOfBirth: f.get('dateOfBirth'),
      gender: f.get('gender'),
      nationality: f.get('nationality'),
      countryOfResidence: f.get('countryOfResidence'),
      phone: f.get('phone'),
      address: f.get('address'),
    })
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <AvatarUploader profile={profile} onSaved={onSaved} />
      <div className="grid-2">
        <Field label={t('fields.fullName')} error={fieldError(error, 'fullName')}>
          <input
            name="fullName"
            defaultValue={profile.fullName}
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </Field>
        <Field label={t('fields.email')}>
          <input value={profile.email} readOnly disabled />
        </Field>
        <Field label={t('fields.dateOfBirth')} error={fieldError(error, 'dateOfBirth')}>
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={profile.dateOfBirth ?? ''}
            required
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label={t('fields.gender')} error={fieldError(error, 'gender')}>
          <select name="gender" defaultValue={profile.gender ?? ''} required>
            <option value="" disabled>
              {tp('select')}
            </option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`genders.${g}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('fields.nationality')} error={fieldError(error, 'nationality')}>
          <CountrySelect
            name="nationality"
            value={profile.nationality}
            options={countryList}
            placeholder={tp('select')}
          />
        </Field>
        <Field
          label={t('fields.countryOfResidence')}
          error={fieldError(error, 'countryOfResidence')}
        >
          <CountrySelect
            name="countryOfResidence"
            value={profile.countryOfResidence}
            options={countryList}
            placeholder={tp('select')}
          />
        </Field>
        <Field label={t('fields.phone')} error={fieldError(error, 'phone')} hint="+61 412 345 678">
          <input
            name="phone"
            type="tel"
            defaultValue={profile.phone ?? ''}
            required
            autoComplete="tel"
            placeholder="+61"
          />
        </Field>
        <Field label={t('fields.address')} error={fieldError(error, 'address')} optional>
          <input
            name="address"
            defaultValue={profile.address ?? ''}
            placeholder={t('addressPlaceholder')}
            autoComplete="street-address"
          />
        </Field>
      </div>
      <FormError error={error} />
      <div className="row-end">
        {secondary}
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function CountrySelect({
  name,
  value,
  options,
  placeholder,
}: {
  name: string
  value: string | null
  options: { code: string; name: string; label: string }[]
  placeholder: string
}) {
  return (
    <select name={name} defaultValue={value ?? ''} required>
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((c) => (
        <option key={c.code} value={c.name}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

export function MedicalBackgroundForm({ profile, onSaved, submitLabel, secondary }: FormProps) {
  const t = useT('profile.medicalBackground')
  const tw = useT('profile.setupWizard')
  const [allergies, setAllergies] = useState(profile.allergies)
  const [medications, setMedications] = useState(profile.currentMedications)
  const { error, pending, save } = useSave('/api/patient/profile/medical-background', onSaved)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    void save({
      medicalHistory: f.get('medicalHistory'),
      allergies,
      currentMedications: medications,
      pastSurgeries: f.get('pastSurgeries'),
    })
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <p className="notice">{t('sharedWithHospitals')}</p>
      <Field label={t('fields.medicalHistory')} optional>
        <textarea
          name="medicalHistory"
          rows={4}
          defaultValue={profile.medicalHistory ?? ''}
          placeholder={tw('medicalHistoryPlaceholder')}
        />
      </Field>
      <Field label={t('fields.allergies')} error={fieldError(error, 'allergies')} optional>
        <TagInput value={allergies} onChange={setAllergies} placeholder={t('tagPlaceholder')} />
      </Field>
      <Field
        label={t('fields.currentMedications')}
        error={fieldError(error, 'currentMedications')}
        optional
      >
        <TagInput value={medications} onChange={setMedications} placeholder={t('tagPlaceholder')} />
      </Field>
      <Field label={t('fields.pastSurgeries')} optional>
        <textarea
          name="pastSurgeries"
          rows={3}
          defaultValue={profile.pastSurgeries ?? ''}
          placeholder={tw('pastSurgeriesPlaceholder')}
        />
      </Field>
      <FormError error={error} />
      <div className="row-end">
        {secondary}
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

export function EmergencyContactForm({ profile, onSaved, submitLabel, secondary }: FormProps) {
  const t = useT('profile.emergencyContact')
  const tw = useT('profile.setupWizard')
  const { error, pending, save } = useSave('/api/patient/profile/emergency-contact', onSaved)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    void save({ name: f.get('name'), relationship: f.get('relationship'), phone: f.get('phone') })
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <Field label={t('fields.contactName')} error={fieldError(error, 'name')}>
        <input
          name="name"
          defaultValue={profile.emergencyContactName ?? ''}
          required
          maxLength={100}
        />
      </Field>
      <Field label={t('fields.relationship')} error={fieldError(error, 'relationship')}>
        <select
          name="relationship"
          defaultValue={profile.emergencyContactRelationship ?? ''}
          required
        >
          <option value="" disabled>
            {tw('selectRelationship')}
          </option>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {t(`relationships.${r}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={t('fields.phoneNumber')}
        error={fieldError(error, 'phone')}
        hint="+61 412 345 678"
      >
        <input
          name="phone"
          type="tel"
          defaultValue={profile.emergencyContactPhone ?? ''}
          required
          placeholder="+61"
        />
      </Field>
      <FormError error={error} />
      <div className="row-end">
        {secondary}
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

/** Chips: Enter or comma adds, Backspace on empty removes the last; at most 20. */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const tag = draft.trim().slice(0, 100)
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag])
    setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span key={tag} className="tag">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={placeholder}
      />
    </div>
  )
}

/** Profile picture (stored privately; fetched with the bearer token). */
function AvatarUploader({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const t = useT('profile.personalDetails')
  const tw = useT('profile.setupWizard')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [version, setVersion] = useState(0)
  const src = useAvatarUrl(profile.hasAvatar, version)

  async function upload(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError(t('uploadPhotoError'))
    if (file.size > 5 * 1024 * 1024) return setError(t('photoTooLarge'))
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      onSaved(await apiPut<Profile>('/api/patient/profile/avatar', form))
      setVersion((v) => v + 1)
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="avatar-upload">
      <label className="avatar-large">
        {src ? <img src={src} alt="" /> : <span>{profile.fullName.slice(0, 1).toUpperCase()}</span>}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      <span className="small muted">
        {uploading ? tw('uploadingPhoto') : tw('clickToUploadPhoto')}
      </span>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

export function useAvatarUrl(hasAvatar: boolean, version = 0) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!hasAvatar) {
      setUrl(null)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    fetch(`/api/patient/profile/avatar?v=${version}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [hasAvatar, version])
  return url
}
