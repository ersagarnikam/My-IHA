'use server'

import { createClient } from '@iha/db/server'
import { saveDraftTreatmentPlan, submitTreatmentPlan, type SaveDraftTreatmentPlanInput } from '@iha/db/treatment-plans'
import { logAuditEvent } from '@iha/db/audit'
import { treatmentPlanDraftSchema } from '@iha/validations'
import type { Result } from '@iha/validations'
import { getAccountForUser } from '@/lib/auth/account'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@iha/logger'

const logger = createLogger('doctor:treatment-plans')

export async function saveDraftTreatmentPlanAction(
  caseId: string,
  values: Record<string, unknown>,
): Promise<Result<{ id: string }>> {
  const parsed = treatmentPlanDraftSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check the form and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const account = await getAccountForUser(user.id)
  if (!account || account.role !== 'doctor') {
    return { data: null, error: 'You are not authorised to build a treatment plan for this case.' }
  }

  const { specialists, cost_items, aftercare, ...rest } = parsed.data
  const input: SaveDraftTreatmentPlanInput = {
    ...rest,
    case_id: caseId,
    cost_items,
    specialists,
    // The form edits this as a newline-per-item textarea, which can include
    // blank lines mid-edit (e.g. the line just started after pressing
    // Enter) — clean those up before persisting.
    aftercare: aftercare?.map((line) => line.trim()).filter(Boolean),
  }

  const { data, error } = await saveDraftTreatmentPlan(input)
  if (error || !data) {
    logger.error({ err: error }, 'saveDraftTreatmentPlanAction failed')
    return { data: null, error: 'Failed to save the draft. Please try again.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'treatment_plan.draft_saved',
    entityType: 'treatment_plan',
    entityId: data.id,
    metadata: { case_id: caseId },
  })

  revalidatePath(`/cases/${caseId}/treatment-plan`)

  return { data, error: null }
}

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to submit this treatment plan.',
  plan_not_found: 'This treatment plan could not be found.',
  invalid_transition: 'This plan has already been submitted.',
  missing_required_fields: 'Please complete all required fields before submitting.',
}

export async function submitTreatmentPlanAction(caseId: string, planId: string): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await submitTreatmentPlan(planId)
  if (error) {
    const mapped = Object.entries(SUBMIT_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'submitTreatmentPlanAction failed')
    return { data: null, error: 'Failed to submit the treatment plan. Please try again.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'treatment_plan.submitted',
    entityType: 'treatment_plan',
    entityId: planId,
    metadata: { case_id: caseId },
  })

  revalidatePath('/cases')
  revalidatePath(`/cases/${caseId}`)
  revalidatePath(`/cases/${caseId}/treatment-plan`)
  revalidatePath('/dashboard')

  return { data: { success: true }, error: null }
}
