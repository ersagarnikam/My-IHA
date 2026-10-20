import { createClient, createServiceClient } from './server'
import { dispatchNotificationAlerts } from '@iha/notifications'
import type { Database } from '../types'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseDocumentRow = Database['public']['Tables']['case_documents']['Row']
type CaseInsert = Database['public']['Tables']['cases']['Insert']
type CaseDocumentInsert = Database['public']['Tables']['case_documents']['Insert']
type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

// Supabase TypeScript generics resolve .insert() params as `never` for newly added tables
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern used in patients.ts.
type SimpleClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null
          error: { message: string } | null
        }>
      }
      then: Promise<{ error: { message: string } | null }>['then']
    }
  }
}

async function simpleInsert(
  table: string,
  payload: Record<string, unknown> | Record<string, unknown>[],
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const builder = supabase.from(table).insert(payload)
  // Awaiting the builder directly resolves the insert
  const result = await (builder as unknown as Promise<{ error: { message: string } | null }>)
  return { error: result.error?.message ?? null }
}

async function simpleInsertReturning(
  table: string,
  payload: Record<string, unknown>,
  select: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select(select)
    .single()
  return { data, error: error?.message ?? null }
}

type RpcCallClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: { id: string; reference_number: string }[] | null; error: { message: string } | null }>
}

export async function insertCase(
  // `description` is a decrypted computed column (read-only), not part of
  // `Insert` — the RPC takes it as plain text and encrypts server-side.
  payload: Pick<CaseInsert, 'specialty' | 'specialty_other'> & { description: string },
): Promise<{ data: { id: string; reference_number: string } | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcCallClient
  const { data, error } = await supabase.rpc('insert_case', {
    p_specialty: payload.specialty,
    p_specialty_other: payload.specialty_other ?? null,
    p_description: payload.description,
  })

  if (error || !data?.[0]) return { data: null, error: error?.message ?? 'Insert failed' }
  return { data: data[0], error: null }
}

export async function insertCaseDocuments(
  docs: Array<
    Pick<
      CaseDocumentInsert,
      'case_id' | 'patient_id' | 'file_name' | 'file_path' | 'file_size_bytes' | 'mime_type' | 'document_type'
    >
  >,
): Promise<{ error: string | null }> {
  return simpleInsert('case_documents', docs as Record<string, unknown>[])
}

export async function insertPatientDocuments(
  docs: Array<
    Pick<
      CaseDocumentInsert,
      'patient_id' | 'file_name' | 'file_path' | 'file_size_bytes' | 'mime_type' | 'document_type'
    > & { case_id?: string | null; document_category: string }
  >,
): Promise<{ error: string | null }> {
  return simpleInsert('case_documents', docs as Record<string, unknown>[])
}

export async function insertNotification(
  payload: Pick<NotificationInsert, 'user_id' | 'type' | 'title' | 'message' | 'case_id'>,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  return insertNotificationWithClient(supabase, payload)
}

/**
 * Same as `insertNotification`, but accepts an already-constructed client —
 * for use in contexts without a request session (e.g. webhook handlers using
 * a service-role client).
 */
export async function insertNotificationWithClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Pick<NotificationInsert, 'user_id' | 'type' | 'title' | 'message' | 'case_id'>,
): Promise<{ error: string | null }> {
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()

  let dupQuery = supabase
    .from('notifications')
    .select('id')
    .eq('user_id', payload.user_id)
    .eq('type', payload.type)
    .gte('created_at', sixtySecondsAgo)

  dupQuery = payload.case_id
    ? dupQuery.eq('case_id', payload.case_id)
    : dupQuery.is('case_id', null)

  const { data: existing } = await dupQuery.maybeSingle()
  if (existing) return { error: null }

  const simpleClient = supabase as unknown as SimpleClient
  const builder = simpleClient.from('notifications').insert({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    case_id: payload.case_id ?? null,
  })
  const result = await (builder as unknown as Promise<{ error: { message: string } | null }>)
  if (result.error) return { error: result.error.message }

  await sendNotificationAlerts(supabase, payload)
  return { error: null }
}

async function sendNotificationAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Pick<NotificationInsert, 'user_id' | 'type' | 'title' | 'message' | 'case_id'>,
): Promise<void> {
  const [{ data: patientData }, { data: sessionData }] = await Promise.all([
    supabase
      .from('patients')
      .select('phone, email_notifications_enabled, sms_notifications_enabled')
      .eq('user_id', payload.user_id)
      .single(),
    supabase.auth.getUser(),
  ])

  const patient = patientData as {
    phone: string | null
    email_notifications_enabled: boolean
    sms_notifications_enabled: boolean
  } | null

  if (!patient) return

  // sessionData is the *caller's* session (whoever triggered this — could be
  // the patient themselves, or a lawyer/hospital/doctor acting on the
  // patient's case), not necessarily the notification's target user. Only
  // reuse its email when the caller IS the target; otherwise resolve the
  // target's email by id. That lookup needs auth.admin, which requires a
  // service-role client — `supabase` here is the request-scoped anon-key
  // client, so calling .auth.admin on it would silently fail (caught below).
  let email: string | null = sessionData.user?.id === payload.user_id ? sessionData.user.email ?? null : null
  if (!email) {
    try {
      const { data: adminData } = await createServiceClient().auth.admin.getUserById(payload.user_id)
      email = adminData?.user?.email ?? null
    } catch {
      email = null
    }
  }

  const patientAppUrl = process.env.NEXT_PUBLIC_NOTIFICATION_APP_URL ?? 'http://localhost:3000'
  const ctaUrl = payload.case_id
    ? `${patientAppUrl}/cases/${payload.case_id}`
    : `${patientAppUrl}/notifications`

  await dispatchNotificationAlerts({
    type: payload.type,
    title: payload.title,
    message: payload.message,
    ctaUrl,
    appUrl: patientAppUrl,
    email,
    phone: patient.phone,
    emailEnabled: patient.email_notifications_enabled,
    smsEnabled: patient.sms_notifications_enabled,
  })
}

/**
 * Sends email/SMS alerts for a case status change, reusing the in-portal
 * notification that the `cases_notify_status_change` DB trigger already
 * inserted (so the title/message text lives in one place). Call this from
 * app code right after an app-driven status update — it is intentionally
 * *not* invoked by the trigger itself, so status changes made directly in
 * Supabase (e.g. manual edits) only ever produce the in-portal notification,
 * never email/SMS.
 */
export async function dispatchCaseStatusAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  type: string,
): Promise<void> {
  const { data } = await supabase
    .from('notifications')
    .select('user_id, type, title, message, case_id')
    .eq('case_id', caseId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    await sendNotificationAlerts(supabase, data as Pick<NotificationInsert, 'user_id' | 'type' | 'title' | 'message' | 'case_id'>)
  }
}

/**
 * The most recent notification of any of `types` tied to a case — used to
 * show a persisted, always-current version of "what the notification said"
 * on a case's detail page, regardless of whether the patient arrived via the
 * notification click or a direct/bookmarked visit. RLS-scoped, so patients
 * only ever see their own notifications.
 */
export async function fetchLatestNotificationForCase(
  caseId: string,
  types: string[],
): Promise<{ data: { title: string; message: string } | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('title, message')
    .eq('case_id', caseId)
    .in('type', types)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

const CASE_COLUMNS =
  'id, patient_id, reference_number, specialty, specialty_other, description, status, need_travel_assistance, need_stay_booking_assistance, need_transportation_assistance, created_at, updated_at'

export async function fetchPatientCases(patientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return { data, error: error?.message ?? null }
}

export async function fetchCaseById(
  caseId: string,
): Promise<{ data: CaseRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .maybeSingle()
  return { data: data as CaseRow | null, error: error?.message ?? null }
}

export async function fetchDocumentsByCase(
  caseId: string,
): Promise<{ data: CaseDocumentRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('uploaded_at', { ascending: true })
  return { data: (data as CaseDocumentRow[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchDocumentCountsForCases(
  caseIds: string[],
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (!caseIds.length) return { data: {}, error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('case_documents')
    .select('case_id')
    .in('case_id', caseIds)

  if (error) return { data: {}, error: error.message }

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { case_id: string }[]) {
    counts[row.case_id] = (counts[row.case_id] ?? 0) + 1
  }
  return { data: counts, error: null }
}

export type DocumentWithCaseInfo = CaseDocumentRow & {
  reference_number: string | null
  case_specialty: string | null
}

type DocumentWithCaseJoin = CaseDocumentRow & {
  cases: { reference_number: string; specialty: string; specialty_other: string | null } | null
}

export async function fetchAllDocumentsForPatient(
  patientId: string,
): Promise<{ data: DocumentWithCaseInfo[]; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('case_documents')
    .select('*, cases(reference_number, specialty, specialty_other)')
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  const docs = ((data ?? []) as unknown as DocumentWithCaseJoin[])

  return {
    data: docs.map(({ cases: c, ...doc }) => ({
      ...doc,
      reference_number: c?.reference_number ?? null,
      case_specialty: c?.specialty_other ?? c?.specialty ?? null,
    })),
    error: null,
  }
}

export async function updateCaseTravelAssistance(
  caseId: string,
  needTravelAssistance: boolean,
  needStayBookingAssistance: boolean,
  needTransportationAssistance: boolean,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as {
    rpc: (
      fn: string,
      args: Record<string, string | boolean>,
    ) => Promise<{ error: { message: string } | null }>
  }
  const { error } = await supabase.rpc('update_case_travel_assistance', {
    p_case_id: caseId,
    p_need_travel_assistance: needTravelAssistance,
    p_need_stay_booking_assistance: needStayBookingAssistance,
    p_need_transportation_assistance: needTransportationAssistance,
  })
  return { error: error?.message ?? null }
}

export async function updateDocumentCaseLink(
  documentId: string,
  caseId: string,
  fileName: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
      }
    }
  }).from('case_documents').update({ case_id: caseId, file_name: fileName }).eq('id', documentId)
  return { error: error?.message ?? null }
}

export async function createCaseDocumentSignedUrl(
  path: string,
  expiresIn = 3600,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('case-documents')
    .createSignedUrl(path, expiresIn)
  return { url: data?.signedUrl ?? null, error: error?.message ?? null }
}
