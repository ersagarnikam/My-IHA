'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@iha/ui'
import { VISA_STATUS_TRANSITIONS } from '@iha/db/visa-status'
import { updateVisaStatusAction } from '@/lib/actions/cases'
import { getVisaStatusLabel } from './visa-status-badge'

type Props = {
  caseId: string
  currentStatus: string
}

export function UpdateStatusDialog({ caseId, currentStatus }: Props) {
  const nextOptions = VISA_STATUS_TRANSITIONS[currentStatus] ?? []
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(nextOptions[0] ?? '')
  const [rejectionReason, setRejectionReason] = useState('')
  const [isPending, startTransition] = useTransition()

  if (nextOptions.length === 0) return null

  const isRejecting = status === 'rejected'
  const canSubmit = !!status && (!isRejecting || rejectionReason.trim().length > 0)

  function handleSubmit() {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await updateVisaStatusAction(caseId, status, isRejecting ? rejectionReason.trim() : undefined)
      if (!result.data) {
        toast.error(result.error ?? 'Something went wrong.')
        return
      }
      toast.success('Case status updated.')
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setStatus(nextOptions[0] ?? '')
          setRejectionReason('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">
          Change Status
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-sm rounded-xl bg-white p-6">
        <DialogCloseButton />
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Change case status</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {nextOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {getVisaStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isRejecting && (
            <div className="space-y-1.5">
              <Label>Rejection reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this visa application was rejected — the patient, hospital, and doctor will see this."
                rows={4}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !canSubmit}
              onClick={handleSubmit}
              className="bg-cyan-700 text-white hover:bg-cyan-800"
            >
              {isPending ? 'Updating…' : 'Update Status'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
