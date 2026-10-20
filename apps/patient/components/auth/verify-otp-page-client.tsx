'use client'

import { VerifyOtpForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resendVerificationOtp, verifyOtp } from '@/lib/actions/auth'
import { toast } from 'sonner'

export type VerifyOtpPageClientProps = {
  email: string
}

export function VerifyOtpPageClient({ email }: VerifyOtpPageClientProps) {
  const router = useRouter()
  const t = useTranslations('authToasts')

  return (
    <VerifyOtpForm
      email={email}
      onSubmit={async (values) => {
        const result = await verifyOtp(values)
        if (result.data) {
          toast.success(t('verifySuccess'))
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
