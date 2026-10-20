'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { registerSchema, type RegisterInput } from '@iha/validations/auth'
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
import { PasswordInput } from '../password-input'
import { AuthDivider } from './auth-divider'
import { AuthLogo } from './auth-logo'
import { SocialAuthButtons, type SocialAuthButtonsProps } from './social-auth-buttons'

export type RegisterFormProps = {
  onSubmit: (values: RegisterInput) => Promise<{ error?: string; redirectTo?: string }>
  onOAuthSignIn: SocialAuthButtonsProps['onOAuthClick']
  loginHref?: string
}

const authButtonClass =
  'h-11 w-full rounded-lg bg-[#6d96a6] text-base font-medium text-white hover:bg-[#5d8696]'

export function RegisterForm({
  onSubmit,
  onOAuthSignIn,
  loginHref = '/login',
}: RegisterFormProps) {
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function handleSubmit(values: RegisterInput) {
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
        <h1 className="text-2xl font-bold text-foreground">Register</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Your full name" autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...field}
                  />
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

          <Button type="submit" className={authButtonClass} disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Register'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={loginHref} className="font-medium text-[#3b82c4] hover:underline">
          Log In
        </Link>
      </p>

      <AuthDivider />
      <SocialAuthButtons onOAuthClick={onOAuthSignIn} disabled={isSubmitting} />
    </div>
  )
}
