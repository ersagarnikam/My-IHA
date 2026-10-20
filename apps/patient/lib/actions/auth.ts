'use server'

import { createClient } from '@iha/db/server'
import { checkEmailAlreadyRegistered } from '@iha/db/auth-lookup'
import type { Result } from '@iha/validations'
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type OAuthProvider,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyOtpInput,
} from '@iha/validations/auth'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@iha/db/audit'
import { insertNotification } from '@iha/db/cases'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'
import { fetchPatientByUserId } from '@/lib/repositories/patients'

const logger = createLogger('patient:auth')

const AUDIT_APP = 'patient'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

async function validationError(): Promise<Result<never>> {
  const t = await getTranslations('actionErrors')
  return { data: null, error: t('common.tryAgainWithDetails') }
}

export async function signInWithEmail(
  values: LoginInput,
): Promise<Result<{ redirectTo: string }>> {
  const t = await getTranslations('actionErrors')
  const parsed = loginSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    await logAuditEvent({
      app: AUDIT_APP,
      action: 'auth.login_failed',
      metadata: { email: parsed.data.email },
    })
    if (error.code === 'email_not_confirmed') {
      return { data: { redirectTo: `/verify?email=${encodeURIComponent(parsed.data.email)}` }, error: null }
    }
    return { data: null, error: t('auth.invalidCredentials') }
  }

  // Auth is shared across the hospital/doctor/patient portals, so a valid
  // credential doesn't imply a patient account — only a `patients` row does.
  const patient = await fetchPatientByUserId(data.user.id)
  if (!patient) {
    await supabase.auth.signOut()
    await logAuditEvent({
      app: AUDIT_APP,
      action: 'auth.login_failed',
      metadata: { email: parsed.data.email, reason: 'no_patient_account' },
    })
    return { data: null, error: t('auth.invalidCredentials') }
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.login_succeeded',
    entityType: 'user',
    entityId: data.user.id,
  })

  return { data: { redirectTo: '/dashboard' }, error: null }
}

export async function signUpWithEmail(
  values: RegisterInput,
): Promise<Result<{ redirectTo: string }>> {
  const t = await getTranslations('actionErrors')
  const parsed = registerSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const { data: alreadyRegistered, error: lookupError } = await checkEmailAlreadyRegistered(
    parsed.data.email,
  )

  if (lookupError) {
    logger.error({ err: lookupError, email: parsed.data.email }, 'signUpWithEmail email_already_registered RPC failed')
    return { data: null, error: t('auth.genericError') }
  }

  if (alreadyRegistered) {
    return { data: null, error: t('auth.emailAlreadyRegistered') }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  })

  if (error) {
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return { data: null, error: t('auth.emailAlreadyRegistered') }
    }
    return { data: null, error: t('auth.genericError') }
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.signup',
    metadata: { email: parsed.data.email },
  })

  const redirectTo = `/verify?email=${encodeURIComponent(parsed.data.email)}`
  return { data: { redirectTo }, error: null }
}

export async function verifyOtp(values: VerifyOtpInput): Promise<Result<{ redirectTo: string }>> {
  const t = await getTranslations('actionErrors')
  const parsed = verifyOtpSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.otp,
    type: 'email',
  })

  if (error) {
    return { data: null, error: t('auth.invalidOrExpiredCode') }
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.email_verified',
    metadata: { email: parsed.data.email },
  })

  if (data.user) {
    await insertNotification({
      user_id: data.user.id,
      type: 'welcome',
      title: 'Welcome to MTA',
      message: 'Your email is verified. Welcome to MTA — let’s get your medical journey started.',
      case_id: null,
    })
  }

  return { data: { redirectTo: '/profile/setup' }, error: null }
}

export async function resendVerificationOtp(
  email: string,
): Promise<Result<{ sent: true }> & { rateLimited?: boolean }> {
  const t = await getTranslations('actionErrors')
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
  })

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return { data: null, error: t('auth.resendRateLimited'), rateLimited: true }
    }
    logger.error({ err: error, email: parsed.data.email }, 'resendVerificationOtp resend call failed')
    return { data: null, error: t('auth.genericError') }
  }

  return { data: { sent: true }, error: null }
}

export async function requestPasswordReset(
  values: ForgotPasswordInput,
): Promise<Result<{ success: true }>> {
  const parsed = forgotPasswordSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  })

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.password_reset_requested',
    metadata: { email: parsed.data.email },
  })

  // Always succeed from the user's perspective (do not reveal if email exists)
  return { data: { success: true }, error: null }
}

export async function resetPassword(
  values: ResetPasswordInput,
): Promise<Result<{ redirectTo: string }>> {
  const t = await getTranslations('actionErrors')
  const parsed = resetPasswordSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    return { data: null, error: t('auth.resetPasswordFailed') }
  }

  await logAuditEvent({ app: AUDIT_APP, action: 'auth.password_reset_completed' })

  // Sign out the recovery session so the user must log in with the new password
  await supabase.auth.signOut()

  return { data: { redirectTo: '/login' }, error: null }
}

export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?error=oauth')
  }

  redirect(data.url)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await logAuditEvent({ app: AUDIT_APP, action: 'auth.logout' })
  await supabase.auth.signOut()
  redirect('/login')
}
