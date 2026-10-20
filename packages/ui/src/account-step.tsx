'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Button } from './button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form'
import { Input } from './input'
import { PasswordInput } from './password-input'
import {
  registrationAccountStepSchema,
  type RegistrationAccountInput,
} from '@iha/validations/provider-registration'

type Props = {
  onSubmit: (values: RegistrationAccountInput) => Promise<{ error?: string }>
}

/**
 * Step 1 of both wizards. Runs signUp() on submit so the rest of the wizard —
 * including certificate/photo uploads — has a real authenticated session.
 */
export function AccountStep({ onSubmit }: Props) {
  const form = useForm<RegistrationAccountInput>({
    resolver: zodResolver(registrationAccountStepSchema),
    defaultValues: { loginEmail: '', password: '', confirmPassword: '' },
  })

  async function handleSubmit(values: RegistrationAccountInput) {
    const result = await onSubmit(values)
    if (result.error) form.setError('root', { message: result.error })
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Create your account</h2>
        <FormField
          control={form.control}
          name="loginEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Login Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
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
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
        >
          {isSubmitting ? 'Creating account…' : 'Continue'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#3b82c4] hover:underline">
            Log In
          </Link>
        </p>
      </form>
    </Form>
  )
}
