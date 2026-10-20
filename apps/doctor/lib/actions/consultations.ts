'use server'

import { createClient } from '@iha/db/server'
import { proposeConsultationSlots, cancelConsultation, fetchConsultationRequestById } from '@iha/db/consultations'
import { dispatchCaseStatusAlerts } from '@iha/db/cases'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@iha/logger'
import { zonedWallTimeToUtcIso } from '@/lib/timezone'
import type { SlotRow } from '@/components/consultations/slot-rows-fields'

const logger = createLogger('doctor:consultations')

type SlotPayload = { slot_time: string; slot_end_time: string }

function buildSlotPayload(
  slots: SlotRow[],
  treatmentStartDate: string | null,
): { data: SlotPayload[] | null; error: string | null } {
  if (slots.length < 1 || slots.length > 3) {
    return { data: null, error: 'Propose between 1 and 3 time slots.' }
  }

  const payload: SlotPayload[] = []
  for (const slot of slots) {
    if (!slot.date || !slot.startTime || !slot.endTime) {
      return { data: null, error: 'Fill in a date, start time, and end time for every slot.' }
    }
    if (treatmentStartDate && slot.date > treatmentStartDate) {
      return { data: null, error: 'Slot dates cannot be after the treatment start date.' }
    }
    const slot_time = zonedWallTimeToUtcIso(slot.date, slot.startTime)
    const slot_end_time = zonedWallTimeToUtcIso(slot.date, slot.endTime)
    if (new Date(slot_time) <= new Date()) {
      return { data: null, error: 'Slot times must be in the future.' }
    }
    if (new Date(slot_end_time) <= new Date(slot_time)) {
      return { data: null, error: "Each slot's end time must be after its start time." }
    }
    payload.push({ slot_time, slot_end_time })
  }
  return { data: payload, error: null }
}

const SLOT_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to update this consultation.',
  consultation_request_not_found: 'Consultation request not found.',
  invalid_transition: 'This consultation is no longer in the right stage for that action.',
  invalid_slot_count: 'Propose between 1 and 3 time slots.',
}

export async function proposeConsultationSlotsAction(
  requestId: string,
  caseId: string,
  slots: SlotRow[],
): Promise<Result<{ success: true }>> {
  const { data: request } = await fetchConsultationRequestById(requestId)
  const { data: payload, error: validationError } = buildSlotPayload(
    slots,
    request?.treatment_option?.treatment_start_date ?? null,
  )
  if (!payload) return { data: null, error: validationError ?? 'Invalid slots.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await proposeConsultationSlots(requestId, payload)
  if (error) {
    const mapped = Object.entries(SLOT_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'proposeConsultationSlotsAction failed')
    return { data: null, error: 'Failed to propose slots. Please try again.' }
  }

  // Patient's in-portal notification is handled by the
  // consultation_requests_notify_status_change DB trigger fired by this
  // status update; only dispatch email/SMS here.
  await dispatchCaseStatusAlerts(supabase, caseId, 'consultation_status_updated')

  await logAuditEvent({
    app: 'doctor',
    action: 'consultation.slots_proposed',
    entityType: 'case',
    entityId: caseId,
    metadata: { consultation_request_id: requestId },
  })

  revalidatePath('/consultations')
  revalidatePath(`/consultations/${requestId}`)

  return { data: { success: true }, error: null }
}

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to update this consultation.',
  consultation_request_not_found: 'Consultation request not found.',
  already_cancelled: 'This consultation has already been cancelled.',
  already_scheduled: 'This consultation is already scheduled and paid for, and can no longer be cancelled from here.',
  reason_required: 'Please provide a reason for cancelling.',
}

export async function cancelConsultationAction(
  requestId: string,
  caseId: string,
  reason: string,
): Promise<Result<{ success: true }>> {
  const trimmed = reason.trim()
  if (trimmed.length < 5) {
    return { data: null, error: 'Please provide a brief reason for cancelling (min. 5 characters).' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await cancelConsultation(requestId, trimmed)
  if (error) {
    const mapped = Object.entries(CANCEL_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'cancelConsultationAction failed')
    return { data: null, error: 'Failed to cancel this consultation. Please try again.' }
  }

  await dispatchCaseStatusAlerts(supabase, caseId, 'consultation_status_updated')

  await logAuditEvent({
    app: 'doctor',
    action: 'consultation.cancelled',
    entityType: 'case',
    entityId: caseId,
    metadata: { consultation_request_id: requestId },
  })

  revalidatePath('/consultations')
  revalidatePath(`/consultations/${requestId}`)

  return { data: { success: true }, error: null }
}
