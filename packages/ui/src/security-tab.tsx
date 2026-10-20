'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from './button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form'
import { Input } from './input'
import { createClient } from '@iha/db/client'

type FormInput = {
  current_password: string
  new_password: string
  confirm_password: string
}

const schema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export function SecurityTab() {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  async function onSubmit(data: FormInput) {
    setIsLoading(true)
    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: (await supabase.auth.getUser()).data.user?.email ?? '',
      password: data.current_password,
    })

    if (signInError) {
      setIsLoading(false)
      form.setError('current_password', { message: 'Current password is incorrect.' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: data.new_password })
    setIsLoading(false)

    if (error) {
      toast.error('Failed to update password. Please try again.', { duration: Infinity })
      return
    }

    toast.success('Password updated successfully.')
    form.reset()
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a strong password you don&apos;t use elsewhere.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="current_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="new_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="sm" loading={isLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            Update Password
          </Button>
        </form>
      </Form>
    </div>
  )
}
