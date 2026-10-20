'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from '@iha/ui'
import type { AssignmentStatus } from '@/types'
import { respondToCaseAssignmentAction } from '@/lib/actions/cases'

type Props = {
  assignmentId: string
  caseId: string
  status: AssignmentStatus
}

export function CaseAssignmentActions({ assignmentId, caseId, status }: Props) {
  const router = useRouter()
  const [isAccepting, setIsAccepting] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleAccept() {
    setIsAccepting(true)
    const { error } = await respondToCaseAssignmentAction(assignmentId, 'accepted', caseId)
    setIsAccepting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to accept this case.')
      return
    }
    toast.success('Case accepted.')
    router.refresh()
  }

  async function handleDecline() {
    setIsSubmitting(true)
    const { error } = await respondToCaseAssignmentAction(
      assignmentId,
      'declined',
      caseId,
      declineReason || undefined,
    )
    setIsSubmitting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to decline this case.')
      return
    }
    toast.success('Case declined.')
    setShowDecline(false)
    router.refresh()
  }

  if (status === 'invited') {
    return (
      <>
        <div className="flex gap-2">
          <Button
            onClick={handleAccept}
            loading={isAccepting}
            className="bg-cyan-600 text-white hover:bg-cyan-700"
          >
            Accept
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDecline(true)}
            disabled={isAccepting}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            Decline
          </Button>
        </div>

        <Dialog open={showDecline} onOpenChange={(open) => !isSubmitting && setShowDecline(open)}>
          <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
            <DialogCloseButton />
            <DialogTitle className="text-base font-semibold text-slate-900">Decline this case</DialogTitle>
            <p className="mt-1 text-sm text-slate-500">
              You can optionally let MTA Admin know why — this helps them route the case elsewhere.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={4}
              placeholder="Reason (optional)"
              maxLength={500}
              className="mt-4 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDecline(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={isSubmitting}
                onClick={handleDecline}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Decline Case
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return null
}
