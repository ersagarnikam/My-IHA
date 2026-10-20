'use client'

import { LoginForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { signInWithEmail, signInWithOAuth } from '@/lib/actions/auth'
import { EMAIL_NOT_CONFIRMED_MESSAGE } from '@/lib/auth/constants'

export function LoginPageClient() {
  const router = useRouter()

  return (
    <LoginForm
      onSubmit={async (values) => {
        const result = await signInWithEmail(values)
        if (result.data) {
          if (result.data.redirectTo.startsWith('/verify')) {
            toast.error(EMAIL_NOT_CONFIRMED_MESSAGE)
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
