'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { verifyOtpSchema, type VerifyOtpInput } from '@iha/validations/auth'
import { Button } from '../button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '../form'
import { OtpInput } from '../otp-input'
import { AuthLogo } from './auth-logo'

export type VerifyOtpFormProps = {
  email: string
  onSubmit: (values: VerifyOtpInput) => Promise<{ error?: string; redirectTo?: string }>
  onResend: (email: string) => Promise<{ error?: string; rateLimited?: boolean }>
  /** Standalone /verify pages show the logo; embedded in a wizard (which has its own header) it's redundant. Defaults to true. */
  showLogo?: boolean
}

const authButtonClass =
  'h-11 w-full rounded-lg bg-[#6d96a6] text-base font-medium text-white hover:bg-[#5d8696]'

// Matches the email provider's resend cooldown, so the button disables itself
// before a click could ever hit that rate limit.
const RESEND_COOLDOWN_SECONDS = 60

export function VerifyOtpForm({ email, onSubmit, onResend, showLogo = true }: VerifyOtpFormProps) {
  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: {
      email,
      otp: '',
    },
  })

  const [resendMessage, setResendMessage] = React.useState<string | null>(null)
  // A code was just sent to land on this screen, so the cooldown starts
  // already running rather than at 0.
  const [resendCooldown, setResendCooldown] = React.useState(RESEND_COOLDOWN_SECONDS)

  React.useEffect(() => {
    if (resendCooldown <= 0) return
    const timeout = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timeout)
  }, [resendCooldown])

  async function handleSubmit(values: VerifyOtpInput) {
    const result = await onSubmit(values)
    if (result.error) {
      form.setError('root', { message: result.error })
    }
    return result
  }

  const isSubmitting = form.formState.isSubmitting

  async function handleResend() {
    setResendMessage(null)
    const result = await onResend(email)
    if (result.rateLimited) {
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      return
    }
    if (result.error) {
      setResendMessage(result.error)
      return
    }
    setResendMessage('A new code has been sent.')
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div className="space-y-6">
      {showLogo && <AuthLogo />}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">OTP Verification</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter OTP sent to email or mobile to verify the account
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <input type="hidden" {...form.register('email')} />

          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <OtpInput
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.formState.errors.root && (
            <p className="text-center text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}

          <Button type="submit" className={authButtonClass} disabled={isSubmitting}>
            {isSubmitting ? 'Verifying…' : 'Confirm'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t receive a code?{' '}
        <button
          type="button"
          className="font-medium text-[#3b82c4] hover:underline disabled:opacity-50"
          onClick={handleResend}
          disabled={isSubmitting || resendCooldown > 0}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
        </button>
      </p>
      {resendMessage && (
        <p className="text-center text-sm text-muted-foreground">{resendMessage}</p>
      )}
    </div>
  )
}
