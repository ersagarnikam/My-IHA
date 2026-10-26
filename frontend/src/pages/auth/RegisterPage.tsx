import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ConsentChecks, consentValues } from '../../components/ConsentChecks'
import { Field, FormError, fieldError } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError, apiPost } from '../../lib/api'
import { AuthShell } from './AuthShell'

/** Patient self-registration. Provider (doctor/hospital/lawyer) registration is ported with their portals. */
export function RegisterPage() {
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
      const { email } = await apiPost<{ email: string }>('/api/auth/register/patient', {
        fullName: form.get('fullName'),
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
    <AuthShell title={t('registerTitle')} subtitle={t('registerSubtitle')}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('fullName')} error={fieldError(error, 'fullName')}>
          <input name="fullName" autoComplete="name" required minLength={2} maxLength={100} />
        </Field>
        <Field label={t('email')} error={fieldError(error, 'email')}>
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
        <ConsentChecks patient />
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
