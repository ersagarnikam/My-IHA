'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban } from 'lucide-react'
import { Button, Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@iha/ui'
import { cancelConsultationAction } from '@/lib/actions/consultations'

export function CancelConsultationDialog({ requestId, caseId }: { requestId: string; caseId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setReason('')
    setFormError(null)
  }

  async function handleSubmit() {
    if (reason.trim().length < 5) {
      setFormError('Please provide a brief reason for cancelling (min. 5 characters).')
      return
    }
    setFormError(null)
    setIsSubmitting(true)
    const { error } = await cancelConsultationAction(requestId, caseId, reason)
    setIsSubmitting(false)
    if (error) {
      setFormError(typeof error === 'string' ? error : 'Failed to cancel this consultation.')
      return
    }
    toast.success('Consultation cancelled. The patient has been notified.')
    reset()
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSubmitting) reset()
        setOpen(next)
      }}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
      >
        <Ban className="h-3.5 w-3.5" />
        Cancel Consultation
      </Button>

      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <DialogTitle className="text-base font-semibold text-slate-900">Cancel Consultation</DialogTitle>

        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            This will notify the patient by email and SMS. Please provide a reason.
          </p>
          <div>
            <label htmlFor="cancel-reason" className="text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Type here..."
              maxLength={900}
              className="mt-2 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              loading={isSubmitting}
              onClick={handleSubmit}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
