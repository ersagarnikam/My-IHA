'use client'

import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@iha/ui'
import { getReopenRequestSchema, type ReopenRequestInput } from '@iha/validations'
import { requestThreadReopen } from '@/lib/actions/chat'

type Props = {
  threadId: string
  onClose: () => void
  onSuccess: () => void
}

export function RequestReopenModal({ threadId, onClose, onSuccess }: Props) {
  const t = useTranslations('messages.reopenModal')

  const reopenRequestSchema = useMemo(
    () =>
      getReopenRequestSchema({
        reasonMinLength: t('validation.reasonMinLength'),
        reasonMaxLength: t('validation.reasonMaxLength'),
      }),
    [t],
  )

  const form = useForm<ReopenRequestInput>({
    resolver: zodResolver(reopenRequestSchema),
    defaultValues: { reason: '' },
  })

  async function onSubmit(data: ReopenRequestInput) {
    const { error } = await requestThreadReopen(threadId, data.reason)
    if (error) {
      toast.error(error, { duration: 6000 })
      return
    }
    toast.success(t('successToast'))
    onSuccess()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !form.formState.isSubmitting) onClose() }}>
      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <DialogTitle className="text-base font-semibold text-slate-900">{t('title')}</DialogTitle>
        <p className="mt-1 text-sm text-slate-500">{t('description')}</p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reasonLabel')}</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={4}
                      placeholder={t('reasonPlaceholder')}
                      className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={form.formState.isSubmitting}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" size="sm" loading={form.formState.isSubmitting} className="bg-cyan-600 text-white hover:bg-cyan-700">
                {form.formState.isSubmitting ? t('submitting') : t('submit')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
