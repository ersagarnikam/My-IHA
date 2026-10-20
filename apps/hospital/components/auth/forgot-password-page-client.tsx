'use client'

import { ForgotPasswordForm } from '@iha/ui/auth'
import { requestPasswordReset } from '@/lib/actions/auth'

export function ForgotPasswordPageClient() {
  return (
    <ForgotPasswordForm
      onSubmit={async (values) => {
        const result = await requestPasswordReset(values)
        if (result.error) {
          return { error: result.error }
        }
        return { success: true }
      }}
    />
  )
}
