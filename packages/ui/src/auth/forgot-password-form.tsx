'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@iha/validations/auth'
import { Button } from '../button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../form'
import { Input } from '../input'
import { AuthLogo } from './auth-logo'

export type ForgotPasswordFormProps = {
  onSubmit: (values: ForgotPasswordInput) => Promise<{ error?: string; success?: boolean }>
  loginHref?: string
}

const authButtonClass =
  'h-11 w-full rounded-lg bg-[#6d96a6] text-base font-medium text-white hover:bg-[#5d8696]'

export function ForgotPasswordForm({
  onSubmit,
  loginHref = '/login',
}: ForgotPasswordFormProps) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const [sent, setSent] = React.useState(false)

  async function handleSubmit(values: ForgotPasswordInput) {
    const result = await onSubmit(values)
    if (result.error) {
      form.setError('root', { message: result.error })
      return
    }
    if (result.success) {
      setSent(true)
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <div className="space-y-6">
      <AuthLogo />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Forgot Password?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter registered email or mobile to receive a password reset link or OTP
        </p>
      </div>

      {sent ? (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          If an account exists for that email, we&apos;ve sent reset instructions. Check your
          inbox.
        </p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter Email"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}

            <Button type="submit" className={authButtonClass} disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send Reset Link'}
            </Button>
          </form>
        </Form>
      )}

      <p className="text-center">
        <Link href={loginHref} className="text-sm font-medium text-[#3b82c4] hover:underline">
          Back to Login
        </Link>
      </p>
    </div>
  )
}
