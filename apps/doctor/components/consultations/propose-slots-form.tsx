'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import { proposeConsultationSlotsAction } from '@/lib/actions/consultations'
import { SlotRowsFields, createEmptySlotRow, type SlotRow } from './slot-rows-fields'

type Props = { requestId: string; caseId: string; isRepropose: boolean; treatmentStartDate: string | null }

export function ProposeSlotsForm({ requestId, caseId, isRepropose, treatmentStartDate }: Props) {
  const router = useRouter()
  const [slots, setSlots] = useState<SlotRow[]>([createEmptySlotRow()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit() {
    setFormError(null)
    setIsSubmitting(true)
    const { error } = await proposeConsultationSlotsAction(requestId, caseId, slots)
    setIsSubmitting(false)
    if (error) {
      setFormError(typeof error === 'string' ? error : 'Failed to propose slots.')
      return
    }
    toast.success(isRepropose ? 'Updated the proposed times.' : 'Proposed times sent to the patient.')
    setSlots([createEmptySlotRow()])
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isRepropose ? 'Update Proposed Times' : 'Propose Consultation Times'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SlotRowsFields slots={slots} onChange={setSlots} maxDate={treatmentStartDate} />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <Button
          type="button"
          onClick={handleSubmit}
          loading={isSubmitting}
          className="bg-cyan-600 text-white hover:bg-cyan-700"
        >
          {isSubmitting ? 'Sending…' : isRepropose ? 'Update Times' : 'Send to Patient'}
        </Button>
      </CardContent>
    </Card>
  )
}
