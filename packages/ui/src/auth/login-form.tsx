'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { loginSchema, type LoginFormValues, type LoginInput } from '@iha/validations/auth'
import { Button } from '../button'
import { Checkbox } from '../checkbox'
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

export type LoginFormProps = {
  onSubmit: (values: LoginInput) => Promise<{ error?: string; redirectTo?: string }>
  onOAuthSignIn: SocialAuthButtonsProps['onOAuthClick']
  registerHref?: string
  forgotPasswordHref?: string
}

const authButtonClass =
  'h-11 w-full rounded-lg bg-[#6d96a6] text-base font-medium text-white hover:bg-[#5d8696]'

export function LoginForm({
  onSubmit,
  onOAuthSignIn,
  registerHref = '/register',
  forgotPasswordHref = '/forgot-password',
}: LoginFormProps) {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  })

  async function handleSubmit(values: LoginFormValues) {
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) return
    const result = await onSubmit(parsed.data)
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
        <h1 className="text-2xl font-bold text-foreground">Log In</h1>
      </div>

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
                    placeholder="sam@gmail.com"
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
                  <PasswordInput placeholder="******" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-between gap-2">
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer font-normal text-sm">
                    Remember me?
                  </FormLabel>
                </FormItem>
              )}
            />
            <Link
              href={forgotPasswordHref}
              className="text-sm font-medium text-[#3b82c4] hover:underline"
            >
              Forgot Password?
            </Link>
          </div>

          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}

          <Button type="submit" className={authButtonClass} disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Log In'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href={registerHref} className="font-medium text-[#3b82c4] hover:underline">
          Register
        </Link>
      </p>

      <AuthDivider />
      <SocialAuthButtons onOAuthClick={onOAuthSignIn} disabled={isSubmitting} />
    </div>
  )
}
