'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { resetPasswordSchema, type ResetPasswordInput } from '@iha/validations/auth'
import { Button } from '../button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../form'
import { PasswordInput } from '../password-input'
import { AuthLogo } from './auth-logo'

export type ResetPasswordFormProps = {
  onSubmit: (values: ResetPasswordInput) => Promise<{ error?: string; redirectTo?: string }>
  /**
   * Signs out the recovery session and redirects to /login. The code-exchange
   * step that lands a user on this page already authenticates them, so a plain
   * link to /login would leave that recovery session active and drop them
   * straight into the dashboard without ever setting a new password.
   */
  onBackToLogin: () => Promise<void>
}

const authButtonClass =
  'h-11 w-full rounded-lg bg-[#6d96a6] text-base font-medium text-white hover:bg-[#5d8696]'

export function ResetPasswordForm({
  onSubmit,
  onBackToLogin,
}: ResetPasswordFormProps) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function handleSubmit(values: ResetPasswordInput) {
    const result = await onSubmit(values)
    if (result.error) {
      form.setError('root', { message: result.error })
    }
    return result
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <div className="space-y-6">
      <AuthLogo />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter new password and confirm</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="******" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="******" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}

          <Button type="submit" className={authButtonClass} disabled={isSubmitting}>
            {isSubmitting ? 'Resetting…' : 'Reset Password'}
          </Button>
        </form>
      </Form>

      <form action={onBackToLogin} className="text-center">
        <button
          type="submit"
          className="text-sm font-medium text-[#3b82c4] hover:underline"
        >
          Back to Login
        </button>
      </form>
    </div>
  )
}
