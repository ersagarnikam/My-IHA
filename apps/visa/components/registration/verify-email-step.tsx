'use client'

import { VerifyOtpForm } from '@iha/ui/auth'
import { resendVerificationOtp, verifyOtp } from '@/lib/actions/auth'

type Props = {
  email: string
  onNext: () => void
}

/**
 * Runs right after the Account step. Establishes the real Supabase session
 * that every later step needs (document uploads and the final
 * register_lawyer RPC both require auth.uid() to be set) — signUp() alone
 * doesn't set one while email confirmation is required. redirectTo from
 * verifyOtp() is ignored here: this is a mid-wizard step, not a full
 * navigation, so success just advances to the next step.
 */
export function VerifyEmailStep({ email, onNext }: Props) {
  return (
    <VerifyOtpForm
      email={email}
      showLogo={false}
      onSubmit={async (values) => {
        const result = await verifyOtp(values)
        if (!result.data) return { error: result.error ?? undefined }
        onNext()
        return {}
      }}
      onResend={async (emailAddress) => {
        const result = await resendVerificationOtp(emailAddress)
        return { error: result.error ?? undefined, rateLimited: result.rateLimited }
      }}
    />
  )
}
