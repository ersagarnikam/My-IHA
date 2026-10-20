'use client'

import { LoginForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { signInWithEmail, signInWithOAuth } from '@/lib/actions/auth'

export function LoginPageClient() {
  const router = useRouter()

  return (
    <LoginForm
      onSubmit={async (values) => {
        const result = await signInWithEmail(values)
        if (result.data) {
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
