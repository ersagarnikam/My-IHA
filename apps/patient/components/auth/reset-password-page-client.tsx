'use client'

import { ResetPasswordForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resetPassword, signOut } from '@/lib/actions/auth'
import { toast } from 'sonner'

export function ResetPasswordPageClient() {
  const router = useRouter()
  const t = useTranslations('authToasts')

  return (
    <ResetPasswordForm
      onBackToLogin={signOut}
      onSubmit={async (values) => {
        const result = await resetPassword(values)
        if (result.data) {
          toast.success(t('resetPasswordSuccess'))
          router.push(result.data.redirectTo)
          router.refresh()
          return {}
        }
        return { error: result.error ?? undefined }
      }}
    />
  )
}
