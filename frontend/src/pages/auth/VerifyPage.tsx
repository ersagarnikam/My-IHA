import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Field, FormError } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { apiPost } from '../../lib/api'
import { AuthShell } from './AuthShell'

export function VerifyPage() {
  const t = useT('auth')
  const [params] = useSearchParams()
  const email = params.get('email')
  const { verify } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)

  if (!email) return <Navigate to="/register" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const user = await verify(
        email!,
        String(new FormData(event.currentTarget).get('code')).trim(),
      )
      navigate(ROLE_HOME[user.role], { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await apiPost('/api/auth/resend-code', { email })
      setResent(true)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <AuthShell title={t('verifyTitle')} subtitle={t('verifySubtitle', { email })}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('verificationCode')}>
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
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {pending ? t('verifying') : t('verify')}
        </button>
      </form>
      <p className="muted">
        {resent ? (
          t('codeSent')
        ) : (
          <>
            {t('didntGetIt')}{' '}
            <button type="button" className="button-link" onClick={resend}>
              {t('sendNewCode')}
            </button>
          </>
        )}
      </p>
    </AuthShell>
  )
}
