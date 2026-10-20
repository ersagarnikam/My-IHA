'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from './button'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from './dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form'
import { reopenRequestSchema, type ReopenRequestInput, type Result } from '@iha/validations'

type Props = {
  threadId: string
  onClose: () => void
  onSuccess: () => void
  requestReopenAction: (threadId: string, reason: string) => Promise<Result<{ success: true }>>
}

export function RequestReopenModal({ threadId, onClose, onSuccess, requestReopenAction }: Props) {
  const form = useForm<ReopenRequestInput>({
    resolver: zodResolver(reopenRequestSchema),
    defaultValues: { reason: '' },
  })

  async function onSubmit(data: ReopenRequestInput) {
    const { error } = await requestReopenAction(threadId, data.reason)
    if (error) {
      toast.error(error, { duration: 6000 })
      return
    }
    toast.success('Your request to reopen this conversation has been sent to MTA Admin.')
    onSuccess()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !form.formState.isSubmitting) onClose() }}>
      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <DialogTitle className="text-base font-semibold text-slate-900">Request chat with admin</DialogTitle>
        <p className="mt-1 text-sm text-slate-500">
          This conversation is closed. Tell MTA Admin why you&apos;d like it reopened.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={4}
                      placeholder="Describe why you'd like to reopen this conversation"
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
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={form.formState.isSubmitting} className="bg-cyan-600 text-white hover:bg-cyan-700">
                {form.formState.isSubmitting ? 'Sending...' : 'Send request'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
