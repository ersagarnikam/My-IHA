'use server'

import { createClient } from '@iha/db/server'
import { confirmTreatmentOption } from '@iha/db/treatments'
import { dispatchCaseStatusAlerts } from '@iha/db/cases'
import { upsertPendingPayment } from '@iha/db/payments'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'
import { fetchTreatmentOptionsForCurrentCase } from '@/lib/repositories/treatments'
import { fetchPatientByUserId } from '@/lib/repositories/patients'

const logger = createLogger('patient:treatments')

export async function selectTreatmentOption(
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

  // Confirm via RPC — validates ownership, status, and performs atomic update
  const { error } = await confirmTreatmentOption(treatmentOptionId)
  if (error) {
    if (error.includes('case_not_in_treatment_plan_status')) {
      return { data: null, error: t('treatments.alreadyConfirmed') }
    }
    if (error.includes('treatment_option_not_found')) {
      return { data: null, error: t('common.treatmentOptionNotFound') }
    }
    if (error.includes('unauthorized')) {
      return { data: null, error: t('treatments.notAuthorisedToSelect') }
    }
    logger.error({ err: error }, 'selectTreatmentOption failed')
    return { data: null, error: t('treatments.confirmSelectionFailed') }
  }

  // In-portal notification is handled by the cases_notify_status_change DB
  // trigger fired by confirmTreatmentOption's status update; only dispatch
  // email/SMS here.
  await dispatchCaseStatusAlerts(supabase, caseId, 'case_status_updated')

  const patient = await fetchPatientByUserId(user.id)
  if (patient) {
    const options = await fetchTreatmentOptionsForCurrentCase(caseId)
    const selected = options.find((o) => o.id === treatmentOptionId)
    if (selected) {
      // Create the pending treatment-payment row now, so it's visible on
      // /payments as soon as the plan is confirmed rather than only after the
      // patient opens the payment page (which is what actually creates the
      // Stripe PaymentIntent, filled in on this same row later) — mirrors
      // what chooseConsultationSlot already does for consultation fees.
      await upsertPendingPayment({
        caseId,
        treatmentOptionId,
        patientId: patient.id,
        amountAud: selected.cost_breakdown.total,
      })
    }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'treatment_option.selected',
    entityType: 'case',
    entityId: caseId,
    metadata: { treatment_option_id: treatmentOptionId },
  })

  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/treatments')
  revalidatePath('/payments')

  return { data: { success: true }, error: null }
}
