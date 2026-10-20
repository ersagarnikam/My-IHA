'use client'

import { VerifyOtpForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { resendVerificationOtp, verifyOtp } from '@/lib/actions/auth'

export type VerifyOtpPageClientProps = {
  email: string
}

export function VerifyOtpPageClient({ email }: VerifyOtpPageClientProps) {
  const router = useRouter()

  return (
    <VerifyOtpForm
      email={email}
      onSubmit={async (values) => {
        const result = await verifyOtp(values)
        if (result.data) {
          router.push(result.data.redirectTo)
          router.refresh()
          return {}
        }
        return { error: result.error ?? undefined }
      }}
      onResend={async (emailAddress) => {
        const result = await resendVerificationOtp(emailAddress)
        return { error: result.error ?? undefined, rateLimited: result.rateLimited }
      }}
    />
  )
}
