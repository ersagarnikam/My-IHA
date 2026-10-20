import { createClient, createServiceClient } from './server'
import { dispatchNotificationAlerts } from '@iha/notifications'
import type { Database, DoctorCaseAssignment } from '../types'

type CaseSummary = Pick<
  Database['public']['Tables']['cases']['Row'],
  'id' | 'reference_number' | 'specialty' | 'specialty_other' | 'status' | 'created_at'
> & { patients: { full_name: string } | null }

export type AssignmentWithCase = DoctorCaseAssignment & { cases: CaseSummary | null }

const ASSIGNMENT_WITH_CASE_SELECT =
  '*, cases(id, reference_number, specialty, specialty_other, status, created_at, patients(full_name))'

// Supabase TypeScript generics resolve .rpc() args as `never` for newly added
// functions in strict TS projects. Bypass with a manually-typed RpcClient —
// same pattern used in treatments.ts/cases.ts.
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>
}

export async function fetchAssignmentsForDoctor(
  doctorId: string,
): Promise<{ data: AssignmentWithCase[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctor_case_assignments')
    .select(ASSIGNMENT_WITH_CASE_SELECT)
    .eq('doctor_id', doctorId)
    .order('invited_at', { ascending: false })
  return { data: (data as unknown as AssignmentWithCase[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchAssignmentForCase(
  caseId: string,
  doctorId: string,
): Promise<{ data: DoctorCaseAssignment | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctor_case_assignments')
    .select('*')
    .eq('case_id', caseId)
    .eq('doctor_id', doctorId)
    .maybeSingle()
  return { data: (data as DoctorCaseAssignment | null) ?? null, error: error?.message ?? null }
}

export async function respondToCaseAssignment(
  assignmentId: string,
  status: 'accepted' | 'declined' | 'withdrawn',
  declineReason?: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('respond_to_case_assignment', {
    p_assignment_id: assignmentId,
    p_status: status,
    p_decline_reason: declineReason ?? null,
  })
  return { error: error?.message ?? null }
}

export async function requestCaseAdditionalInfo(
  caseId: string,
  message: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('request_case_additional_info', {
    p_case_id: caseId,
    p_message: message,
  })
  return { error: error?.message ?? null }
}

export async function startCaseEvaluation(caseId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('start_case_evaluation', { p_case_id: caseId })
  return { error: error?.message ?? null }
}

export async function markCaseCompleted(caseId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('mark_case_completed', { p_case_id: caseId })
  return { error: error?.message ?? null }
}

/**
 * Sends email/SMS alerts to the doctor when MTA Admin assigns them a case,
 * reusing the in-portal notification the doctor_case_assignments_notify_doctor
 * DB trigger already inserted (same pattern as
 * dispatchConsultationRequestAlertsToDoctor in consultations.ts). Dormant
 * until the Admin Portal's assignment action/RPC calls this right after
 * inserting the doctor_case_assignments row — that insert path doesn't exist
 * in this repo yet (see that table's creating migration).
 */
export async function dispatchCaseAssignmentAlertsToDoctor(
  caseId: string,
  doctorId: string,
): Promise<void> {
  const supabase = createServiceClient()
  const { data: doctorData } = await supabase
    .from('doctors')
    .select('user_id, contact_phone, email_notifications_enabled, sms_notifications_enabled')
    .eq('id', doctorId)
    .single()

  const doctor = doctorData as {
    user_id: string
    contact_phone: string | null
    email_notifications_enabled: boolean
    sms_notifications_enabled: boolean
  } | null
  if (!doctor) return

  const { data } = await supabase
    .from('notifications')
    .select('type, title, message')
    .eq('case_id', caseId)
    .eq('user_id', doctor.user_id)
    .eq('type', 'case_assigned_by_admin')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return

  const notification = data as { type: string; title: string; message: string }

  let email: string | null = null
  try {
    const { data: adminData } = await supabase.auth.admin.getUserById(doctor.user_id)
    email = adminData?.user?.email ?? null
  } catch {
    email = null
  }

  const doctorAppUrl = process.env.NEXT_PUBLIC_DOCTOR_APP_URL ?? 'http://localhost:3004'
  const ctaUrl = `${doctorAppUrl}/cases/${caseId}`

  await dispatchNotificationAlerts({
    type: notification.type,
    title: notification.title,
    message: notification.message,
    ctaUrl,
    appUrl: doctorAppUrl,
    email,
    phone: doctor.contact_phone,
    emailEnabled: doctor.email_notifications_enabled,
    smsEnabled: doctor.sms_notifications_enabled,
  })
}

export type AssignedCasesStats = {
  assigned: number
  pendingReview: number
  completed: number
  plansCreated: number
}

export async function fetchAssignedCasesStats(
  doctorId: string,
): Promise<{ data: AssignedCasesStats; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctor_case_assignments')
    .select('status, plan_submitted_at, cases(status)')
    .eq('doctor_id', doctorId)

  if (error)
    return {
      data: { assigned: 0, pendingReview: 0, completed: 0, plansCreated: 0 },
      error: error.message,
    }

  const rows = (data ?? []) as unknown as Array<{
    status: string
    plan_submitted_at: string | null
    cases: { status: string } | null
  }>

  const stats = rows.reduce(
    (acc, row) => {
      if (row.status === 'accepted') acc.assigned += 1
      if (row.status === 'invited') acc.pendingReview += 1
      if (row.status === 'accepted' && row.cases?.status === 'completed') acc.completed += 1
      if (row.plan_submitted_at) acc.plansCreated += 1
      return acc
    },
    { assigned: 0, pendingReview: 0, completed: 0, plansCreated: 0 },
  )

  return { data: stats, error: null }
}
