'use server'

import { createClient } from '@iha/db/server'
import type { Result } from '@iha/validations'
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type OAuthProvider,
  type ResetPasswordInput,
  type VerifyOtpInput,
} from '@iha/validations/auth'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import { GENERIC_AUTH_ERROR, INVALID_CREDENTIALS_MESSAGE } from '@/lib/auth/constants'
import { getAccountForUser } from '@/lib/auth/account'
import { findOtherRoleAccount } from '@iha/db/account-lookup'

const logger = createLogger('doctor:auth')

/**
 * Where a signed-in user lands, based on their hospitals/doctors row (if
 * any). This app only serves doctors — a hospital account reaching this
 * point must be signed out (not just redirected to /login) before
 * returning, otherwise the shared auth middleware's "authenticated user on
 * /login" rule bounces them straight back to postAuthPath ('/dashboard'),
 * which the (dashboard) layout's role guard bounces right back to /login —
 * an infinite loop instead of a clear error.
 */
export async function postAuthRedirect(userId: string): Promise<string> {
  const account = await getAccountForUser(userId)
  if (!account) return '/register'
  if (account.role !== 'doctor') {
    const supabase = await createClient()
    await supabase.auth.signOut()
    return '/login'
  }
  if (account.status !== 'approved') return '/pending-approval'
  if (!account.registrationFeePaidAt) return '/registration-fee'
  return '/dashboard'
}

const AUDIT_APP = 'doctor'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3004'
}

function validationError(): Result<never> {
  return { data: null, error: 'Please check your details and try again.' }
}

export async function signInWithEmail(
  values: LoginInput,
): Promise<Result<{ redirectTo: string }>> {
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
    return { data: null, error: INVALID_CREDENTIALS_MESSAGE }
  }

  // Auth is shared across every portal, so a valid credential doesn't imply
  // a doctor account — only a `doctors` row does. Checked here (not just
  // left to postAuthRedirect) so another role's account gets an inline form
  // error instead of a login -> dashboard -> login redirect flash. Matches
  // the generic invalid-credentials message (not a distinguishing one) so
  // this doesn't reveal that the email is registered under a different role.
  const account = await getAccountForUser(data.user.id)
  // No row in *this* app's tables is ambiguous on its own — a hospital
  // account is caught above via account.role, but a patient/lawyer account
  // also has no hospitals/doctors row and would otherwise fall through to
  // postAuthRedirect's /register (mid-registration) path. Positively check
  // the other role tables to tell the two cases apart.
  const otherRole = !account
    ? await findOtherRoleAccount(supabase, data.user.id, ['hospital', 'doctor'])
    : null
  if ((account && account.role !== 'doctor') || otherRole) {
    await supabase.auth.signOut()
    await logAuditEvent({
      app: AUDIT_APP,
      action: 'auth.login_failed',
      metadata: { email: parsed.data.email, reason: 'no_doctor_account' },
    })
    return { data: null, error: INVALID_CREDENTIALS_MESSAGE }
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.login_succeeded',
    entityType: 'user',
    entityId: data.user.id,
  })

  return { data: { redirectTo: await postAuthRedirect(data.user.id) }, error: null }
}

export async function verifyOtp(values: VerifyOtpInput): Promise<Result<{ redirectTo: string }>> {
  const parsed = verifyOtpSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.otp,
    type: 'email',
  })

  if (error || !data.user) return { data: null, error: 'Invalid or expired code. Please try again.' }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.email_verified',
    metadata: { email: parsed.data.email },
  })

  return { data: { redirectTo: await postAuthRedirect(data.user.id) }, error: null }
}

export async function resendVerificationOtp(
  email: string,
): Promise<Result<{ sent: true }> & { rateLimited?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.data.email })

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return { data: null, error: GENERIC_AUTH_ERROR, rateLimited: true }
    }
    logger.error({ err: error, email: parsed.data.email }, 'resendVerificationOtp resend call failed')
    return { data: null, error: GENERIC_AUTH_ERROR }
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

  return { data: { success: true }, error: null }
}

export async function resetPassword(
  values: ResetPasswordInput,
): Promise<Result<{ redirectTo: string }>> {
  const parsed = resetPasswordSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { data: null, error: 'Unable to reset password. Request a new link and try again.' }
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
    options: { redirectTo: `${appUrl()}/auth/callback` },
  })

  if (error || !data.url) redirect('/login?error=oauth')
  redirect(data.url)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await logAuditEvent({ app: AUDIT_APP, action: 'auth.logout' })
  await supabase.auth.signOut()
  redirect('/login')
}
