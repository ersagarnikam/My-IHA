import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Field, FormError, fieldError } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { apiPost } from '../../lib/api'
import { AuthShell } from './AuthShell'

export function ForgotPasswordPage() {
  const t = useT('auth')
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email')).trim()
    setPending(true)
    setError(null)
    try {
      await apiPost('/api/auth/forgot-password', { email })
      navigate(`/reset-password?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('email')}>
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {pending ? t('sending') : t('sendCode')}
        </button>
      </form>
      <Link to="/login" className="small">
        {t('backToSignIn')}
      </Link>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const t = useT('auth')
  const [params] = useSearchParams()
  const email = params.get('email')
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  if (!email) return <Navigate to="/forgot-password" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      await apiPost('/api/auth/reset-password', {
        email,
        code: String(form.get('code')).trim(),
        password: form.get('password'),
      })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell title={t('resetTitle')} subtitle={t('resetSubtitle', { email })}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('verificationCode')} error={fieldError(error, 'code')}>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="code-input"
          />
        </Field>
        <Field
          label={t('newPassword')}
          error={fieldError(error, 'password')}
          hint={t('passwordHint')}
        >
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {pending ? t('resetting') : t('resetPassword')}
        </button>
      </form>
      <Link to="/login" className="small">
        {t('backToSignIn')}
      </Link>
    </AuthShell>
  )
}
