'use client'

import { LoginForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signInWithEmail, signInWithOAuth } from '@/lib/actions/auth'
import { toast } from 'sonner'

export function LoginPageClient() {
  const router = useRouter()
  const t = useTranslations('authToasts')

  return (
    <LoginForm
      onSubmit={async (values) => {
        const result = await signInWithEmail(values)
        if (result.data) {
          if (result.data.redirectTo.startsWith('/verify')) {
            toast.error(t('emailNotConfirmed'))
          } else {
            toast.success(t('loginSuccess'))
          }
          router.push(result.data.redirectTo)
          router.refresh()
          return {}
        }
        return { error: result.error ?? undefined }
      }}
      onOAuthSignIn={signInWithOAuth}
    />
  )
}
