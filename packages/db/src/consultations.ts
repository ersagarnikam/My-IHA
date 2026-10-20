import { createClient, createServiceClient } from './server'
import { dispatchNotificationAlerts } from '@iha/notifications'

export {
  CONSULTATION_FEE_AUD,
  type ConsultationStatus,
  type ConsultationSlot,
  type ConsultationRequest,
} from './consultations-shared'
import type { ConsultationSlot, ConsultationRequest } from './consultations-shared'

// Supabase TypeScript generics resolve .rpc() args as `never` for newly added
// functions in strict TS projects. Bypass with a manually-typed RpcClient —
// same pattern used in case-assignments.ts/cases.ts.
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>
}

const CONSULTATION_SLOTS_SELECT =
  'consultation_slots!consultation_slots_consultation_request_id_fkey(id, slot_time, slot_end_time)'

// treatment_options no longer carries doctor_id/procedure_name/description
// directly — 20260722000000_create_treatment_plans_tables.sql moved
// clinical/identity data onto treatment_plans (treatment_options is now a
// thin pricing/publish-state row referencing treatment_plan_id), the same
// join treatments.ts already uses. treatment_summary was never a real
// column — it's synthesized client-side there as `description ??
// procedure_name`, mirrored in TreatmentOptionSummary below.
type RawTreatmentOptionJoin = {
  treatment_plans: {
    doctor_id: string
    procedure_name: string | null
    description: string | null
    treatment_start_date: string | null
  } | null
} | null

export type TreatmentOptionSummary = {
  procedure_name: string | null
  description: string | null
  treatment_start_date: string | null
}

function parseConsultationRows(
  data: unknown,
): { data: ConsultationRequest[]; error: string | null } {
  const rows = (data ?? []) as unknown as Array<
    Omit<ConsultationRequest, 'slots'> & { consultation_slots: ConsultationSlot[] }
  >

  return {
    data: rows.map(({ consultation_slots, ...rest }) => ({
      ...rest,
      slots: [...(consultation_slots ?? [])].sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
    })),
    error: null,
  }
}

export async function fetchConsultationRequestsForCase(
  caseId: string,
): Promise<{ data: ConsultationRequest[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consultation_requests')
    .select(`*, ${CONSULTATION_SLOTS_SELECT}`)
    .eq('case_id', caseId)

  if (error) return { data: [], error: error.message }
  return parseConsultationRows(data)
}

export async function fetchConsultationRequestsForTreatmentOptions(
  treatmentOptionIds: string[],
): Promise<{ data: ConsultationRequest[]; error: string | null }> {
  if (treatmentOptionIds.length === 0) return { data: [], error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consultation_requests')
    .select(`*, ${CONSULTATION_SLOTS_SELECT}`)
    .in('treatment_option_id', treatmentOptionIds)

  if (error) return { data: [], error: error.message }
  return parseConsultationRows(data)
}

export type ConsultationRequestWithContext = ConsultationRequest & {
  treatment_option: TreatmentOptionSummary | null
  case_reference_number: string | null
  patient_name: string | null
}

const TREATMENT_OPTION_WITH_PLAN_SELECT =
  'treatment_plan_id, treatment_plans!inner(doctor_id, procedure_name, description, treatment_start_date)'

// Doctor-scoped list for /consultations. Deliberately *not* filtering with
// .eq('treatment_options.treatment_plans.doctor_id', doctorId) here — a
// two-level-deep embedded-filter path is unreliable via PostgREST/
// supabase-js (unlike the single-level case in treatments.ts's
// fetchAllTreatmentOptionsForPatient), and unnecessary anyway: the
// "Doctors can view consultation requests for their treatment options" RLS
// policy already scopes rows to the caller's own treatment options via the
// identical treatment_options -> treatment_plans -> doctors join, so this
// plain select only ever returns doctorId's own rows regardless.
export async function fetchConsultationRequestsForDoctor(
  doctorId: string,
): Promise<{ data: ConsultationRequestWithContext[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consultation_requests')
    .select(
      `*, ${CONSULTATION_SLOTS_SELECT}, treatment_options!inner(${TREATMENT_OPTION_WITH_PLAN_SELECT}), cases(reference_number, patients(full_name))`,
    )
    .order('requested_at', { ascending: false })

  if (error) return { data: [], error: error.message }

  const rows = (data ?? []) as unknown as Array<
    Omit<ConsultationRequest, 'slots'> & {
      consultation_slots: ConsultationSlot[]
      treatment_options: RawTreatmentOptionJoin
      cases: { reference_number: string; patients: { full_name: string } | null } | null
    }
  >

  return {
    data: rows.map(({ consultation_slots, treatment_options, cases, ...rest }) => ({
      ...rest,
      slots: [...(consultation_slots ?? [])].sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
      treatment_option: treatment_options?.treatment_plans ?? null,
      case_reference_number: cases?.reference_number ?? null,
      patient_name: cases?.patients?.full_name ?? null,
    })),
    error: null,
  }
}

export async function fetchConsultationRequestById(
  requestId: string,
): Promise<{ data: ConsultationRequestWithContext | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consultation_requests')
    .select(
      `*, ${CONSULTATION_SLOTS_SELECT}, treatment_options(${TREATMENT_OPTION_WITH_PLAN_SELECT}), cases(reference_number, patients(full_name))`,
    )
    .eq('id', requestId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }

  const { consultation_slots, treatment_options, cases, ...rest } = data as unknown as Omit<
    ConsultationRequest,
    'slots'
  > & {
    consultation_slots: ConsultationSlot[]
    treatment_options: RawTreatmentOptionJoin
    cases: { reference_number: string; patients: { full_name: string } | null } | null
  }

  return {
    data: {
      ...rest,
      slots: [...(consultation_slots ?? [])].sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
      treatment_option: treatment_options?.treatment_plans ?? null,
      case_reference_number: cases?.reference_number ?? null,
      patient_name: cases?.patients?.full_name ?? null,
    },
    error: null,
  }
}

export async function requestOnlineConsultation(
  treatmentOptionId: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('request_online_consultation', {
    p_treatment_option_id: treatmentOptionId,
  })
  return { error: error?.message ?? null }
}

export async function selectConsultationSlot(
  requestId: string,
  slotId: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('select_consultation_slot', {
    p_request_id: requestId,
    p_slot_id: slotId,
  })
  return { error: error?.message ?? null }
}

export async function fetchConsultationSlotById(
  slotId: string,
): Promise<{ data: ConsultationSlot | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consultation_slots')
    .select('id, slot_time, slot_end_time')
    .eq('id', slotId)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as ConsultationSlot, error: null }
}

export type ProposedSlotInput = { slot_time: string; slot_end_time: string }

export async function proposeConsultationSlots(
  requestId: string,
  slots: ProposedSlotInput[],
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('propose_consultation_slots', {
    p_request_id: requestId,
    p_slots: slots,
  })
  return { error: error?.message ?? null }
}

export async function cancelConsultation(
  requestId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('cancel_consultation', {
    p_request_id: requestId,
    p_reason: reason,
  })
  return { error: error?.message ?? null }
}

/**
 * Sends email/SMS alerts to the doctor when a patient submits a new
 * consultation request, reusing the in-portal notification the
 * consultation_requests_notify_doctor DB trigger already inserted (title/
 * message text lives in one place, same pattern as dispatchCaseStatusAlerts
 * in cases.ts). Called from the *patient* app right after
 * request_online_consultation() succeeds, so — unlike sendNotificationAlerts
 * in cases.ts — the caller's session belongs to the patient, not the
 * recipient doctor. Every read here (the notification row, the doctor's
 * contact prefs, the doctor's email) is therefore done via the service-role
 * client: `notifications`/`doctors` RLS only allow a user to read their own
 * row, and `auth.admin.getUserById` requires the service key outright — a
 * patient-session client would have silently found zero rows/failed the
 * admin call on every single request, so the alert would never send.
 */
export async function dispatchConsultationRequestAlertsToDoctor(caseId: string): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('notifications')
    .select('user_id, type, title, message, case_id')
    .eq('case_id', caseId)
    .eq('type', 'consultation_request_received')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return

  const notification = data as {
    user_id: string
    type: string
    title: string
    message: string
    case_id: string | null
  }

  const { data: doctorData } = await supabase
    .from('doctors')
    .select('contact_phone, email_notifications_enabled, sms_notifications_enabled')
    .eq('user_id', notification.user_id)
    .single()

  const doctor = doctorData as {
    contact_phone: string | null
    email_notifications_enabled: boolean
    sms_notifications_enabled: boolean
  } | null
  if (!doctor) return

  let email: string | null = null
  try {
    const { data: adminData } = await supabase.auth.admin.getUserById(notification.user_id)
    email = adminData?.user?.email ?? null
  } catch {
    email = null
  }

  const doctorAppUrl = process.env.NEXT_PUBLIC_DOCTOR_APP_URL ?? 'http://localhost:3004'
  const ctaUrl = `${doctorAppUrl}/consultations`

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
