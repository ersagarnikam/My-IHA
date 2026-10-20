'use server'

import { createClient } from '@iha/db/server'
import {
  respondToCaseAssignment,
  requestCaseAdditionalInfo,
  startCaseEvaluation,
  markCaseCompleted,
} from '@iha/db/case-assignments'
import { dispatchCaseStatusAlerts } from '@iha/db/cases'
import { logAuditEvent } from '@iha/db/audit'
import { additionalInfoRequestSchema, declineReasonSchema } from '@iha/validations'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@iha/logger'

const logger = createLogger('hospital:cases')

const ASSIGNMENT_ERROR_MESSAGES: Record<string, string> = {
  invalid_status: 'Invalid response.',
  unauthorized: 'You are not authorised to respond to this case.',
  assignment_not_found: 'This case assignment could not be found.',
  invalid_transition: 'This case has already been responded to.',
}

export async function respondToCaseAssignmentAction(
  assignmentId: string,
  status: 'accepted' | 'declined' | 'withdrawn',
  caseId: string,
  declineReason?: string,
): Promise<Result<{ success: true }>> {
  if (!assignmentId || !caseId) {
    return { data: null, error: 'Invalid request.' }
  }

  const parsedReason = declineReasonSchema.safeParse({ reason: declineReason })
  if (!parsedReason.success) {
    return { data: null, error: 'Please check your decline reason and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await respondToCaseAssignment(assignmentId, status, parsedReason.data.reason)
  if (error) {
    const mapped = Object.entries(ASSIGNMENT_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'respondToCaseAssignmentAction failed')
    return { data: null, error: 'Failed to respond to this case. Please try again.' }
  }

  const auditAction =
    status === 'accepted'
      ? 'case_assignment.accepted'
      : status === 'declined'
        ? 'case_assignment.declined'
        : 'case_assignment.withdrawn'

  await logAuditEvent({
    app: 'hospital',
    action: auditAction,
    entityType: 'case',
    entityId: caseId,
    metadata: { assignment_id: assignmentId },
  })

  revalidatePath('/cases')
  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/dashboard')

  return { data: { success: true }, error: null }
}

const ADDITIONAL_INFO_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to request information on this case.',
  case_not_assigned: 'You must accept this case before requesting more information.',
  case_not_found: 'Case not found.',
  case_not_in_evaluation: 'This action is only available while the case is in evaluation.',
}

export async function requestAdditionalInfoAction(
  caseId: string,
  message: string,
): Promise<Result<{ success: true }>> {
  const parsed = additionalInfoRequestSchema.safeParse({ message })
  if (!parsed.success) {
    return { data: null, error: 'Please check your message and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await requestCaseAdditionalInfo(caseId, parsed.data.message)
  if (error) {
    const mapped = Object.entries(ADDITIONAL_INFO_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'requestAdditionalInfoAction failed')
    return { data: null, error: 'Failed to send your request. Please try again.' }
  }

  // requestCaseAdditionalInfo already wrote the in-portal notification row;
  // this reads it back and fans out to email/SMS per the patient's
  // notification preferences (same pattern as case status change alerts).
  await dispatchCaseStatusAlerts(supabase, caseId, 'additional_info_requested')

  await logAuditEvent({
    app: 'hospital',
    action: 'case.additional_info_requested',
    entityType: 'case',
    entityId: caseId,
  })

  revalidatePath(`/cases/${caseId}`)

  return { data: { success: true }, error: null }
}

const WORKFLOW_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to update this case.',
  invalid_transition: 'This case is no longer in the right stage for that action.',
}

export async function startCaseEvaluationAction(caseId: string): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await startCaseEvaluation(caseId)
  if (error) {
    const mapped = Object.entries(WORKFLOW_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'startCaseEvaluationAction failed')
    return { data: null, error: 'Failed to start evaluation. Please try again.' }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'case.evaluation_started',
    entityType: 'case',
    entityId: caseId,
  })

  revalidatePath('/cases')
  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/dashboard')

  return { data: { success: true }, error: null }
}

export async function markCaseCompletedAction(caseId: string): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { error } = await markCaseCompleted(caseId)
  if (error) {
    const mapped = Object.entries(WORKFLOW_ERROR_MESSAGES).find(([code]) => error.includes(code))
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error }, 'markCaseCompletedAction failed')
    return { data: null, error: 'Failed to mark this case as completed. Please try again.' }
  }

  // mark_case_completed already wrote the in-portal notification row (via
  // notify_case_status_change); this reads it back and fans out to
  // email/SMS per the patient's notification preferences.
  await dispatchCaseStatusAlerts(supabase, caseId, 'case_status_updated')

  await logAuditEvent({
    app: 'hospital',
    action: 'case.marked_completed',
    entityType: 'case',
    entityId: caseId,
  })

  revalidatePath('/cases')
  revalidatePath(`/cases/${caseId}`)
  revalidatePath('/dashboard')

  return { data: { success: true }, error: null }
}

