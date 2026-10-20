'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@iha/ui'
import { createClient } from '@iha/db/client'

type FormInput = {
  current_password: string
  new_password: string
  confirm_password: string
}

export function SecurityTab() {
  const t = useTranslations('profile.security')
  const [isLoading, setIsLoading] = useState(false)

  const schema = useMemo(
    () =>
      z
        .object({
          current_password: z.string().min(1, t('errors.currentRequired')),
          new_password: z.string().min(8, t('errors.minLength')),
          confirm_password: z.string().min(1, t('errors.confirmRequired')),
        })
        .refine((d) => d.new_password === d.confirm_password, {
          message: t('errors.noMatch'),
          path: ['confirm_password'],
        }),
    [t],
  )

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
      form.setError('current_password', { message: t('errors.incorrect') })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: data.new_password })
    setIsLoading(false)

    if (error) {
      toast.error(t('toasts.failed'), { duration: Infinity })
      return
    }

    toast.success(t('toasts.success'))
    form.reset()
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="current_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.currentPassword')}</FormLabel>
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
                <FormLabel>{t('fields.newPassword')}</FormLabel>
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
                <FormLabel>{t('fields.confirmPassword')}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            size="sm"
            loading={isLoading}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {t('updatePassword')}
          </Button>
        </form>
      </Form>
    </div>
  )
}
