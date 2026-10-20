'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { insertNotification } from '@iha/db/cases'
import { updateVisaSubmissionStatusRpc, fetchCaseProviderUserIds, VISA_STATUS_TRANSITIONS } from '@iha/db/visa'
import { caseNoteBodySchema, type Result } from '@iha/validations'
import { createLogger } from '@iha/logger'
import { fetchPatientUserIdForCase, type CaseNote } from '@/lib/data/cases'
import { getAccountForUser } from '@/lib/auth/account'

const logger = createLogger('visa:cases')

function statusNotificationForPatient(status: string, rejectionReason?: string): { title: string; message: string } | null {
  switch (status) {
    case 'under_review':
      return {
        title: 'Your visa lawyer is reviewing your application',
        message: 'Your visa lawyer has started reviewing your visa application.',
      }
    case 'application_submitted':
      return {
        title: 'Visa application submitted',
        message: 'Your visa application has been submitted to the immigration authorities.',
      }
    case 'processing':
      return {
        title: 'Visa application processing',
        message: 'Your visa application is being processed by the immigration authorities.',
      }
    case 'approved':
      return {
        title: 'Visa approved',
        message: 'Your visa application has been approved.',
      }
    case 'rejected':
      return {
        title: 'Visa application rejected',
        message: `Your visa application was not approved. Reason: ${rejectionReason}`,
      }
    default:
      return null
  }
}

// Hospital/doctor notification copy only exists for the two terminal
// outcomes they actually need to act or follow up on — the intermediate
// lawyer-review statuses (under_review, processing, ...) aren't
// hospital/doctor-actionable, so they stay patient-only.
function statusNotificationForProvider(status: string, rejectionReason?: string): { title: string; message: string } | null {
  switch (status) {
    case 'approved':
      return {
        title: "Patient's visa approved",
        message: "Your patient's visa application has been approved.",
      }
    case 'rejected':
      return {
        title: "Patient's visa rejected",
        message: `Your patient's visa application was not approved. Reason: ${rejectionReason}`,
      }
    default:
      return null
  }
}

export async function updateVisaStatusAction(
  caseId: string,
  status: string,
  rejectionReason?: string,
): Promise<Result<{ success: true }>> {
  const isValidTarget = Object.values(VISA_STATUS_TRANSITIONS).some((targets) => targets.includes(status))
  if (!isValidTarget) return { data: null, error: 'Invalid status.' }

  const trimmedReason = rejectionReason?.trim()
  if (status === 'rejected' && !trimmedReason) {
    return { data: null, error: 'A rejection reason is required.' }
  }

  const { error } = await updateVisaSubmissionStatusRpc(caseId, status, trimmedReason)
  if (error) {
    logger.error({ err: error, caseId, status }, 'updateVisaStatusAction RPC failed')
    return { data: null, error: 'Something went wrong. Please try again.' }
  }

  const patientNotif = statusNotificationForPatient(status, trimmedReason)
  if (patientNotif) {
    const { data: patientUserId, error: patientLookupError } = await fetchPatientUserIdForCase(caseId)
    if (patientLookupError || !patientUserId) {
      logger.error({ err: patientLookupError, caseId }, 'updateVisaStatusAction patient lookup failed')
    } else {
      const { error: notifyError } = await insertNotification({
        user_id: patientUserId,
        type: 'visa_status_updated',
        title: patientNotif.title,
        message: patientNotif.message,
        case_id: caseId,
      })
      if (notifyError) logger.error({ err: notifyError, caseId }, 'updateVisaStatusAction insertNotification failed')
    }
  }

  // Notify the linked hospital/doctor on approval/rejection too. Admin is
  // deliberately not notified here — there's no admin_users table or
  // role/identity model in the schema yet to attach a notification to (see
  // migration comment).
  const providerNotif = statusNotificationForProvider(status, trimmedReason)
  if (providerNotif) {
    const { data: providerUserIds, error: providerLookupError } = await fetchCaseProviderUserIds(caseId)
    if (providerLookupError) {
      logger.error({ err: providerLookupError, caseId }, 'updateVisaStatusAction provider lookup failed')
    } else {
      for (const userId of [providerUserIds.hospitalUserId, providerUserIds.doctorUserId]) {
        if (!userId) continue
        const { error: notifyError } = await insertNotification({
          user_id: userId,
          type: 'visa_status_updated',
          title: providerNotif.title,
          message: providerNotif.message,
          case_id: caseId,
        })
        if (notifyError) logger.error({ err: notifyError, caseId, userId }, 'updateVisaStatusAction provider insertNotification failed')
      }
    }
  }

  revalidatePath(`/visa-cases/${caseId}`)
  return { data: { success: true }, error: null }
}

// Supabase TypeScript generics resolve .insert() params as `never` for this
// table in strict TS projects. Bypass with a manually-typed SimpleClient —
// same pattern used in @iha/db/visa (insertVisaDocument) and chat.ts.
type InsertCaseNoteClient = {
  from: (table: 'visa_case_notes') => {
    insert: (payload: { case_id: string; lawyer_id: string; body: string }) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string; body: string; created_at: string } | null
          error: { message: string } | null
        }>
      }
    }
  }
}

/**
 * Adds a confidential, timestamped note to a case's internal log — visible
 * only to the assigned lawyer (RLS on visa_case_notes, 20260903000000).
 * Never surfaced to the patient, unlike the old dead lawyer_notes column
 * this replaces.
 */
export async function addCaseNoteAction(caseId: string, body: string): Promise<Result<CaseNote>> {
  const parsed = caseNoteBodySchema.safeParse({ body })
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid note.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const account = await getAccountForUser(user.id)
  if (!account) return { data: null, error: 'Unauthenticated.' }

  const db = supabase as unknown as InsertCaseNoteClient
  const { data, error } = await db
    .from('visa_case_notes')
    .insert({ case_id: caseId, lawyer_id: account.id, body: parsed.data.body })
    .select('id, body, created_at')
    .single()

  if (error || !data) {
    logger.error({ err: error, caseId }, 'addCaseNoteAction failed')
    return { data: null, error: 'Something went wrong. Please try again.' }
  }

  revalidatePath(`/visa-cases/${caseId}`)
  return { data: { id: data.id, body: data.body, createdAt: data.created_at }, error: null }
}
