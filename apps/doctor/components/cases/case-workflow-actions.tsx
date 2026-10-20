'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@iha/ui'
import { startCaseEvaluationAction, markCaseCompletedAction } from '@/lib/actions/cases'

type Props = {
  caseId: string
  caseStatus: string
  evaluationStartedAt: string | null
  planSubmittedAt: string | null
  treatmentEndDate: string | null
}

// Statuses where the patient has paid but treatment hasn't happened yet —
// the doctor is the one who knows it actually took place (possibly well
// after travel_ready, once the patient shows up), so completion is a manual
// doctor action rather than an automatic transition.
const COMPLETABLE_STATUSES = ['payment_confirmed', 'visa_processing', 'travel_ready']

// Manual, doctor-triggered steps in the case lifecycle that don't happen
// automatically: starting evaluation (doctor_assigned -> evaluation) and
// heading into the treatment-plan builder (submission itself now happens
// from within that page, once the plan's required fields are complete).
export function CaseWorkflowActions({
  caseId,
  caseStatus,
  evaluationStartedAt,
  planSubmittedAt,
  treatmentEndDate,
}: Props) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // Doctors can only mark a case completed once the planned treatment window
  // has actually passed — otherwise they could close out a case before the
  // patient has even had treatment.
  const canMarkCompleted = Boolean(treatmentEndDate) && new Date(treatmentEndDate!) <= new Date()

  async function handleStartEvaluation() {
    setIsSubmitting(true)
    const { error } = await startCaseEvaluationAction(caseId)
    setIsSubmitting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to start evaluation.')
      return
    }
    toast.success('Evaluation started.')
    router.refresh()
  }

  async function handleMarkCompleted() {
    setIsCompleting(true)
    const { error } = await markCaseCompletedAction(caseId)
    setIsCompleting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to mark this case as completed.')
      return
    }
    toast.success('Case marked as completed.')
    setShowComplete(false)
    router.refresh()
  }

  // The case-wide status only tells us evaluation has begun for *some*
  // doctor on this case (multiple doctors can be assigned and each
  // independently evaluates and proposes a plan — Admin decides which reach
  // the patient). Whether *this* doctor has started their own evaluation is
  // tracked on their own assignment row, so it must gate this button
  // instead of caseStatus alone — otherwise the first doctor to start would
  // lock every other assigned doctor out of starting theirs.
  if (!evaluationStartedAt && (caseStatus === 'doctor_assigned' || caseStatus === 'evaluation')) {
    return (
      <Button
        onClick={handleStartEvaluation}
        loading={isSubmitting}
        className="bg-cyan-600 text-white hover:bg-cyan-700"
      >
        Start Evaluation
      </Button>
    )
  }

  if (evaluationStartedAt && caseStatus === 'evaluation') {
    if (planSubmittedAt) {
      return (
        <Button asChild variant="outline">
          <Link href={`/cases/${caseId}/treatment-plan`}>Treatment Plan Sent — View</Link>
        </Button>
      )
    }
    return (
      <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
        <Link href={`/cases/${caseId}/treatment-plan`}>Build Treatment Plan</Link>
      </Button>
    )
  }

  // Past evaluation (treatment_plan, treatment_confirmed, payment_confirmed, ...)
  // the case has moved on, but the doctor should still be able to see the plan
  // they submitted — the treatment-plan page itself already renders read-only
  // once the plan is out of 'draft'. Once the patient has paid, the doctor can
  // also mark the case completed once treatment has actually happened.
  if (planSubmittedAt || COMPLETABLE_STATUSES.includes(caseStatus)) {
    return (
      <>
        {planSubmittedAt && (
          <Button asChild variant="outline">
            <Link href={`/cases/${caseId}/treatment-plan`}>View Treatment Plan</Link>
          </Button>
        )}
        {COMPLETABLE_STATUSES.includes(caseStatus) && canMarkCompleted && (
          <Button onClick={() => setShowComplete(true)} className="bg-cyan-600 text-white hover:bg-cyan-700">
            Mark as Completed
          </Button>
        )}

        <Dialog open={showComplete} onOpenChange={(open) => !isCompleting && setShowComplete(open)}>
          <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
            <DialogCloseButton />
            <DialogTitle className="text-base font-semibold text-slate-900">Mark case as completed</DialogTitle>
            <p className="mt-1 text-sm text-slate-500">
              Confirm the patient has undergone treatment. This updates the case status to Completed and notifies
              the patient — it can&apos;t be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowComplete(false)}
                disabled={isCompleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={isCompleting}
                onClick={handleMarkCompleted}
                className="bg-cyan-600 text-white hover:bg-cyan-700"
              >
                Mark as Completed
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return null
}
