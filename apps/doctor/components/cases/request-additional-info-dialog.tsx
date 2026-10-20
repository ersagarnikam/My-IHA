'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button, Checkbox, Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@iha/ui'
import { requestAdditionalInfoAction } from '@/lib/actions/cases'

const DOCUMENT_OPTIONS = ['Lab Report', 'MRI / CT Scan', 'X-Ray', 'Prescription', 'Medical History', 'Other'] as const

export function RequestAdditionalInfoDialog({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggle(option: string) {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]))
  }

  function reset() {
    setSelected([])
    setMessage('')
    setFormError(null)
  }

  async function handleSubmit() {
    const trimmedMessage = message.trim()
    if (selected.length === 0 && trimmedMessage.length < 10) {
      setFormError('Select at least one document or describe what you need (min. 10 characters).')
      return
    }
    setFormError(null)

    const parts: string[] = []
    if (selected.length > 0) parts.push(`Requested documents: ${selected.join(', ')}`)
    if (trimmedMessage) parts.push(trimmedMessage)
    const composedMessage = parts.join('\n\n')

    setIsSubmitting(true)
    const { error } = await requestAdditionalInfoAction(caseId, composedMessage)
    setIsSubmitting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to send your request.', { duration: 6000 })
      return
    }
    toast.success('The patient has been notified.')
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
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Request More Documents
      </Button>

      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <DialogTitle className="text-base font-semibold text-slate-900">
          Request Additional Documents
        </DialogTitle>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Select Required Documents</p>
            <div className="mt-2 space-y-2">
              {DOCUMENT_OPTIONS.map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={selected.includes(option)} onCheckedChange={() => toggle(option)} />
                  {option}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="additional-info-message" className="text-sm font-medium text-slate-700">
              Message (optional)
            </label>
            <textarea
              id="additional-info-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Type here..."
              maxLength={900}
              className="mt-2 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={isSubmitting}
              onClick={handleSubmit}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Send Request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
