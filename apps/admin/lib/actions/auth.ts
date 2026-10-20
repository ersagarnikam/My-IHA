'use server'

import { createClient } from '@iha/db/server'
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
import { GENERIC_AUTH_ERROR, INVALID_CREDENTIALS_MESSAGE } from '@/lib/auth/constants'

const AUDIT_APP = 'admin'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3003'
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
    return { data: null, error: INVALID_CREDENTIALS_MESSAGE }
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
  const parsed = registerSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  })

  if (error) return { data: null, error: GENERIC_AUTH_ERROR }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.signup',
    metadata: { email: parsed.data.email },
  })

  return {
    data: { redirectTo: `/verify?email=${encodeURIComponent(parsed.data.email)}` },
    error: null,
  }
}

export async function verifyOtp(values: VerifyOtpInput): Promise<Result<{ redirectTo: string }>> {
  const parsed = verifyOtpSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.otp,
    type: 'email',
  })

  if (error) return { data: null, error: 'Invalid or expired code. Please try again.' }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'auth.email_verified',
    metadata: { email: parsed.data.email },
  })

  return { data: { redirectTo: '/dashboard' }, error: null }
}

export async function resendVerificationOtp(email: string): Promise<Result<{ sent: true }>> {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.data.email })

  if (error) return { data: null, error: GENERIC_AUTH_ERROR }

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
