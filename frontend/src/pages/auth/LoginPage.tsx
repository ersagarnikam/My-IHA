import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ROLE_HOME, useAuth } from '../../auth/AuthContext'
import { Field, FormError } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError } from '../../lib/api'
import { AuthShell } from './AuthShell'

export function LoginPage() {
  const t = useT('auth')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    setPending(true)
    setError(null)
    try {
      const user = await login(email, String(form.get('password')))
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith(`/${user.role.toLowerCase()}`) ? from : ROLE_HOME[user.role], {
        replace: true,
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        navigate(`/verify?email=${encodeURIComponent(email)}`)
        return
      }
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell title={t('loginTitle')} subtitle={t('loginSubtitle')}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label={t('email')}>
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t('password')}>
          <input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Link to="/forgot-password" className="small align-end">
          {t('forgotPassword')}
        </Link>
        <FormError error={error} />
        <button type="submit" disabled={pending}>
          {pending ? t('signingIn') : t('signIn')}
        </button>
      </form>
      <p className="muted">
        {t('newPatient')} <Link to="/register">{t('createAccount')}</Link>
        <br />
        {t('areYouDoctor')} <Link to="/register/doctor">{t('registerAsDoctor')}</Link>
        <br />
        {t('areYouHospital')} <Link to="/register/hospital">{t('registerHospital')}</Link>
        <br />
        {t('areYouLawyer')} <Link to="/register/lawyer">{t('registerLawyer')}</Link>
      </p>
    </AuthShell>
  )
}
