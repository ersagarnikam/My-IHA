'use server'

import { createClient } from '@iha/db/server'
import {
  requestOnlineConsultation,
  selectConsultationSlot,
  dispatchConsultationRequestAlertsToDoctor,
  CONSULTATION_FEE_AUD,
} from '@iha/db/consultations'
import { upsertPendingConsultationPayment } from '@iha/db/payments'
import { insertNotification, fetchCaseById, dispatchCaseStatusAlerts } from '@iha/db/cases'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:consultations')

export async function requestConsultation(
  treatmentOptionId: string,
  caseId: string,
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  if (!treatmentOptionId || !caseId) {
    return { data: null, error: t('common.invalidRequest') }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const { error } = await requestOnlineConsultation(treatmentOptionId)
  if (error) {
    if (error.includes('consultation_already_requested')) {
      return { data: null, error: t('consultations.alreadyRequested') }
    }
    if (error.includes('case_not_in_treatment_plan_status')) {
      return { data: null, error: t('consultations.caseNotAcceptingRequests') }
    }
    if (error.includes('treatment_option_not_found')) {
      return { data: null, error: t('common.treatmentOptionNotFound') }
    }
    if (error.includes('unauthorized')) {
      return { data: null, error: t('consultations.notAuthorisedToRequest') }
    }
    logger.error({ err: error }, 'requestConsultation failed')
    return { data: null, error: t('consultations.requestFailed') }
  }

  const { data: caseRow } = await fetchCaseById(caseId)

  await insertNotification({
    user_id: user.id,
    type: 'consultation_requested',
    title: 'Online consultation requested',
    message: caseRow
      ? `Your online consultation request for case ${caseRow.reference_number} has been sent to the doctor.`
      : 'Your online consultation request has been sent to the doctor.',
    case_id: caseId,
  })

  // In-portal notification for the doctor is handled by the
  // consultation_requests_notify_doctor DB trigger fired by
  // requestOnlineConsultation's insert; only dispatch email/SMS here.
  await dispatchConsultationRequestAlertsToDoctor(caseId)

  await logAuditEvent({
    app: 'patient',
    action: 'consultation.requested',
    entityType: 'case',
    entityId: caseId,
    metadata: { treatment_option_id: treatmentOptionId },
  })

  revalidatePath(`/cases/${caseId}`)

  return { data: { success: true }, error: null }
}

export async function chooseConsultationSlot(
  requestId: string,
  slotId: string,
  caseId: string,
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  if (!requestId || !slotId || !caseId) {
    return { data: null, error: t('common.invalidRequest') }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const { error } = await selectConsultationSlot(requestId, slotId)
  if (error) {
    if (error.includes('consultation_not_awaiting_slot_selection')) {
      return { data: null, error: t('consultations.notAwaitingSlotSelection') }
    }
    if (error.includes('slot_not_found')) {
      return { data: null, error: t('consultations.slotNotFound') }
    }
    if (error.includes('unauthorized')) {
      return { data: null, error: t('consultations.notAuthorisedToUpdate') }
    }
    logger.error({ err: error }, 'chooseConsultationSlot failed')
    return { data: null, error: t('consultations.confirmSlotFailed') }
  }

  // In-portal notification is handled by the consultation_requests_notify_status_change
  // DB trigger fired by selectConsultationSlot's status update; only dispatch
  // email/SMS here.
  await dispatchCaseStatusAlerts(supabase, caseId, 'consultation_status_updated')

  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (patient) {
    // Create the pending consultation-fee payment row now, so it's visible
    // on /payments as soon as the slot is confirmed rather than only after
    // the patient opens the payment page (which is what actually creates
    // the Stripe PaymentIntent, filled in on this same row later).
    await upsertPendingConsultationPayment({
      caseId,
      consultationRequestId: requestId,
      patientId: (patient as { id: string }).id,
      amountAud: CONSULTATION_FEE_AUD,
    })
  }

  await logAuditEvent({
    app: 'patient',
    action: 'consultation.slot_selected',
    entityType: 'case',
    entityId: caseId,
    metadata: { consultation_request_id: requestId, slot_id: slotId },
  })

  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/payments')

  return { data: { success: true }, error: null }
}
