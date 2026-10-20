'use client'

import { RegisterForm } from '@iha/ui/auth'
import { useRouter } from 'next/navigation'
import { signInWithOAuth, signUpWithEmail } from '@/lib/actions/auth'

export function RegisterPageClient() {
  const router = useRouter()

  return (
    <RegisterForm
      onSubmit={async (values) => {
        const result = await signUpWithEmail(values)
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
