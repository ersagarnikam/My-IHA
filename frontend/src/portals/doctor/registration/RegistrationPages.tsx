import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Clock, LogOut, XCircle } from 'lucide-react'
import { useAuth } from '../../../auth/AuthContext'
import { Field, FormError, fieldError } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { ApiError, apiGet, apiPost } from '../../../lib/api'
import { useApi } from '../../../lib/useApi'
import { AuthShell } from '../../../pages/auth/AuthShell'
import { Checkout } from '../../patient/payments/Checkout'
import { DevDoctorPanel } from '../DevPanel'
import { useDoctorAccount } from '../DoctorContext'
import { money } from '../shared'
import { RegistrationForm } from './RegistrationForm'
import '../doctor.css'

/** Step 1 for doctors: the login. Verification and the profile wizard follow. */
export function DoctorSignUpPage() {
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
      const { email } = await apiPost<{ email: string }>('/api/auth/register/doctor', {
        email: form.get('email'),
        password,
      })
      navigate(`/verify?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="Register as a doctor"
      subtitle="Create your login, then tell us about your practice."
    >
      <form className="stack" onSubmit={onSubmit}>
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

/** Header-only page frame for the registration gate (no portal navigation until active). */
export function GateShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { signOut } = useAuth()
  return (
    <div className="dr-register">
      <div className="dr-register-head">
        <img src="/logo.png" alt="MTA" />
        <button type="button" className="button-secondary" onClick={signOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
      <div>
        <h1 className="dr-title">{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function DoctorRegisterPage() {
  const { setAccount } = useDoctorAccount()
  const navigate = useNavigate()
  return (
    <GateShell
      title="Doctor Registration"
      subtitle="Tell us about your practice. MTA reviews every registration before cases are shared with you."
    >
      <RegistrationForm
        doctor={null}
        onDone={(doctor) => {
          setAccount({ registered: true, doctor })
          navigate('/doctor/pending-approval', { replace: true })
        }}
      />
    </GateShell>
  )
}

export function PendingApprovalPage() {
  const { account, setAccount, reload } = useDoctorAccount()
  const doctor = account.doctor!
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <GateShell
        title="Update your registration"
        subtitle="Make the changes MTA asked for, then resubmit."
      >
        <RegistrationForm
          doctor={doctor}
          onDone={(saved) => {
            setAccount({ registered: true, doctor: saved })
            setEditing(false)
          }}
        />
        <button type="button" className="button-link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </GateShell>
    )

  const rejected = doctor.status === 'rejected'
  const moreInfo = doctor.status === 'more_info_requested'
  return (
    <GateShell title={`Thanks, ${doctor.fullName}`}>
      <section className="dr-card stack" style={{ alignItems: 'flex-start' }}>
        {rejected ? (
          <XCircle size={36} color="var(--danger)" />
        ) : moreInfo ? (
          <Clock size={36} color="var(--warn-fg)" />
        ) : (
          <CheckCircle2 size={36} color="var(--primary)" />
        )}
        <h2 className="dr-subtitle">
          {rejected
            ? 'Your registration was not approved'
            : moreInfo
              ? 'MTA needs more information'
              : 'Your registration is under review'}
        </h2>
        {rejected || moreInfo ? (
          <>
            {(doctor.rejectionReason || doctor.moreInfoMessage) && (
              <div
                className={`dr-banner${rejected ? ' bad' : ''}`}
                style={{ alignSelf: 'stretch' }}
              >
                {doctor.rejectionReason ?? doctor.moreInfoMessage}
              </div>
            )}
            <p className="muted" style={{ margin: 0 }}>
              Update your details or documents and resubmit for review.
            </p>
            <button type="button" onClick={() => setEditing(true)}>
              Update and resubmit
            </button>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            The MTA team is checking your details and documents. We'll email you when there's an
            outcome — usually within two business days.
          </p>
        )}
      </section>
      <DevDoctorPanel
        actions={
          doctor.status === 'pending'
            ? [
                { label: 'Approve my registration (admin)', path: '/api/dev/doctor/approve' },
                {
                  label: 'Ask me for more information (admin)',
                  path: '/api/dev/doctor/request-more-info',
                },
              ]
            : []
        }
        onChanged={reload}
      />
    </GateShell>
  )
}

export function RegistrationFeePage() {
  const { reload } = useDoctorAccount()
  const fees = useApi<{ registrationFeeAud: number; annualFeeAud: number }>(
    '/api/doctor/billing/fees',
  )
  const navigate = useNavigate()
  return (
    <GateShell
      title="Registration fee"
      subtitle="Your registration has been approved. Pay the one-time registration fee to unlock your dashboard."
    >
      <section className="dr-card stack">
        {fees.data && (
          <div className="row-between">
            <span>One-time registration fee</span>
            <strong>{money(fees.data.registrationFeeAud)}</strong>
          </div>
        )}
        {fees.data && (
          <p className="muted small" style={{ margin: 0 }}>
            An annual renewal fee of {money(fees.data.annualFeeAud)} falls due one year after
            payment.
          </p>
        )}
        <Checkout
          checkoutPath="/api/doctor/billing/checkout"
          body={{ feeType: 'registration' }}
          simulatePath={(intentId) => `/api/doctor/billing/simulate/${intentId}`}
          onPaid={async () => {
            // With Stripe the webhook can land a moment after the card confirms.
            for (let i = 0; i < 10 && !(await feePaid()); i++) {
              await new Promise((r) => setTimeout(r, 1000))
            }
            await reload()
            navigate('/doctor/dashboard', { replace: true })
          }}
        />
      </section>
    </GateShell>
  )
}

async function feePaid() {
  try {
    const account = await apiGet<{ doctor: { registrationFeePaidAt: string | null } | null }>(
      '/api/doctor/account',
    )
    return !!account.doctor?.registrationFeePaidAt
  } catch {
    return false
  }
}
