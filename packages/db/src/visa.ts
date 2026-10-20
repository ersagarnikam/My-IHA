import { createClient } from './server'
import type { Database } from '../types'
import { visaFormSchema, pendingVisaDocumentsSchema } from '@iha/validations'

type VisaSubmissionRow = Database['public']['Tables']['visa_submissions']['Row']
type VisaDocumentRow = Database['public']['Tables']['visa_documents']['Row']

export type VisaSubmissionWithCase = VisaSubmissionRow & {
  cases: { id: string; reference_number: string; specialty: string } | null
}

export type { VisaSubmissionRow, VisaDocumentRow }

// Supabase TypeScript generics resolve .insert() params as `never` for this table
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern used in cases.ts/chat.ts.
type SimpleClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null
          error: { message: string } | null
        }>
      }
    }
  }
}

const VISA_SUBMISSION_COLUMNS =
  'id, case_id, patient_id, assigned_lawyer_id, status, rejection_reason, form_data, created_at, updated_at'

export async function fetchVisaSubmissionForCase(
  caseId: string,
): Promise<{ data: VisaSubmissionRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select(VISA_SUBMISSION_COLUMNS)
    .eq('case_id', caseId)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as VisaSubmissionRow | null, error: null }
}

type CaseLawyerUserIdClient = {
  rpc(
    fn: 'case_lawyer_user_id',
    args: { target_case_id: string },
  ): Promise<{ data: string | null; error: { message: string } | null }>
}

// Patients have no direct read access to the lawyers table (see
// 20260826010000_create_lawyers_table.sql — self-service only), so a plain
// embedded select would come back null under RLS even on a matching row.
// Goes through the same security-definer function
// (20260901050000_allow_patient_notifications_to_lawyer.sql) that gates the
// notifications insert policy, for notifying the assigned lawyer after a
// patient action (e.g. a document upload) — not for display.
export async function fetchLawyerUserIdForCase(
  caseId: string,
): Promise<{ data: string | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as CaseLawyerUserIdClient
  const { data, error } = await supabase.rpc('case_lawyer_user_id', { target_case_id: caseId })
  if (error) return { data: null, error: error.message }
  return { data: data ?? null, error: null }
}

export async function fetchVisaSubmissionStatusesForCases(
  caseIds: string[],
): Promise<{ data: Record<string, string>; error: string | null }> {
  if (!caseIds.length) return { data: {}, error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select('case_id, status')
    .in('case_id', caseIds)

  if (error) return { data: {}, error: error.message }

  const statusByCase: Record<string, string> = {}
  for (const row of (data ?? []) as { case_id: string; status: string }[]) {
    statusByCase[row.case_id] = row.status
  }
  return { data: statusByCase, error: null }
}

export async function fetchVisaDocuments(
  visaSubmissionId: string,
): Promise<{ data: VisaDocumentRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_documents')
    .select('*')
    .eq('visa_submission_id', visaSubmissionId)
    .order('uploaded_at', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as VisaDocumentRow[], error: null }
}

export type DocumentRequestWithStatus = Database['public']['Tables']['visa_document_requests']['Row'] & {
  fulfilled: boolean
}

/**
 * Document requests for a case, with "fulfilled" computed against whether a
 * matching-category document was uploaded after the request — there's no
 * stored fulfilled_at. Shared by apps/visa (lawyer's case detail page) and
 * apps/patient (patient's visa detail page), so both sides agree on which
 * requests are still open.
 */
export async function fetchDocumentRequestsForCase(
  caseId: string,
): Promise<{ data: DocumentRequestWithStatus[]; error: string | null }> {
  const supabase = await createClient()
  const [{ data: requests, error: requestsError }, { data: documents, error: documentsError }] =
    await Promise.all([
      supabase
        .from('visa_document_requests')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false }),
      supabase
        .from('visa_documents')
        .select('category, uploaded_at, requested_by_lawyer')
        .eq('case_id', caseId)
        .eq('requested_by_lawyer', true),
    ])

  if (requestsError) return { data: [], error: requestsError.message }
  if (documentsError) return { data: [], error: documentsError.message }

  const withStatus = (requests ?? []).map((request) => {
    const fulfilled = (documents ?? []).some(
      (doc) => doc.category === request.category && doc.uploaded_at > request.created_at,
    )
    return { ...request, fulfilled }
  })

  return { data: withStatus, error: null }
}

export type VisaDocumentWithCase = {
  id: string
  case_id: string | null
  category: string
  file_name: string
  file_path: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string
  cases: { id: string; reference_number: string; specialty: string; specialty_other: string | null } | null
}

const VISA_DOCUMENT_WITH_CASE_COLUMNS =
  'id, case_id, category, file_name, file_path, file_size_bytes, mime_type, uploaded_at, cases(id, reference_number, specialty, specialty_other)'

// Every visa document across all of a patient's cases — their own uploads
// (from the visa application wizard or added standalone here) plus any
// hospital-generated letters already sent to them. RLS on visa_documents
// enforces that visibility rule, so no extra filtering is needed here.
// Uses the untyped bypass client because `case_id` isn't in the generated
// Database types yet (see the HospitalGeneratedDocument note below).
export async function fetchAllVisaDocumentsForPatient(
  patientId: string,
): Promise<{ data: VisaDocumentWithCase[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(VISA_DOCUMENT_WITH_CASE_COLUMNS)
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as VisaDocumentWithCase[], error: null }
}

export type PendingDocument = {
  category: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  mimeType: string
}

type RpcVisaDocument = {
  category: string
  file_name: string
  file_path: string
  file_size_bytes: number
  mime_type: string
}

// `submit_visa_application` is present in the generated Functions type, but its
// overload confuses supabase-js's .rpc() overload resolution here (TS picks an
// unrelated zero-arg overload and rejects the real args). Typed explicitly instead.
type SubmitVisaApplicationClient = {
  rpc(
    fn: 'submit_visa_application',
    args: { p_case_id: string; p_form_data: Record<string, string>; p_documents: RpcVisaDocument[] },
  ): Promise<{ data: { submission_id: string } | null; error: { message: string } | null }>
}

export async function submitVisaApplicationRpc(
  caseId: string,
  formData: Record<string, string>,
  pendingDocuments: PendingDocument[],
): Promise<{ data: { submissionId: string } | null; error: string | null }> {
  const parsedForm = visaFormSchema.safeParse(formData)
  if (!parsedForm.success) return { data: null, error: 'Invalid visa form data' }

  const parsedDocuments = pendingVisaDocumentsSchema.safeParse(pendingDocuments)
  if (!parsedDocuments.success) return { data: null, error: 'Invalid document data' }

  const supabase = await createClient()

  const docs: RpcVisaDocument[] = parsedDocuments.data.map((d) => ({
    category:        d.category,
    file_name:       d.fileName,
    file_path:       d.filePath,
    file_size_bytes: d.fileSizeBytes,
    mime_type:       d.mimeType,
  }))

  const db = supabase as unknown as SubmitVisaApplicationClient
  const { data, error } = await db.rpc('submit_visa_application', {
    p_case_id:   caseId,
    p_form_data: parsedForm.data,
    p_documents: docs,
  })

  if (error) return { data: null, error: error.message }
  return { data: data ? { submissionId: data.submission_id } : null, error: null }
}

// True if this case/category has a lawyer request with no matching document
// uploaded after it yet — mirrors the "fulfilled" heuristic in
// apps/visa/lib/data/documents.ts (fetchDocumentRequestsForCase), which is
// the only other place this pairing logic exists. Keep both in sync.
async function fulfillsPendingDocumentRequest(
  db: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  category: string,
): Promise<boolean> {
  const [{ data: requests }, { data: fulfillingDocs }] = await Promise.all([
    db.from('visa_document_requests').select('created_at').eq('case_id', caseId).eq('category', category),
    db
      .from('visa_documents')
      .select('uploaded_at')
      .eq('case_id', caseId)
      .eq('category', category)
      .eq('requested_by_lawyer', true),
  ])

  if (!requests?.length) return false
  return requests.some((r) => !fulfillingDocs?.some((d) => d.uploaded_at > r.created_at))
}

export async function insertVisaDocument(doc: {
  visaSubmissionId: string
  caseId: string
  patientId: string
  category: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  mimeType: string
}): Promise<{ data: VisaDocumentRow | null; error: string | null }> {
  const db = await createClient()
  const requestedByLawyer = await fulfillsPendingDocumentRequest(db, doc.caseId, doc.category)

  const supabase = db as unknown as SimpleClient
  const { data, error } = await supabase
    .from('visa_documents')
    .insert({
      visa_submission_id:  doc.visaSubmissionId,
      case_id:             doc.caseId,
      patient_id:          doc.patientId,
      category:            doc.category,
      file_name:           doc.fileName,
      file_path:           doc.filePath,
      file_size_bytes:     doc.fileSizeBytes,
      mime_type:           doc.mimeType,
      requested_by_lawyer: requestedByLawyer,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as unknown as VisaDocumentRow, error: null }
}

type AddVisaDocumentsForCaseClient = {
  rpc(
    fn: 'add_visa_documents_for_case',
    args: { p_case_id: string; p_documents: RpcVisaDocument[] },
  ): Promise<{ data: { submission_id: string; added: number } | null; error: { message: string } | null }>
}

// Standalone "attach visa documents to a case" path used by the Documents
// page's Visa tab — unlike submitVisaApplicationRpc this never touches
// cases.status or requires the visa application form to have been filled
// in; it just files documents against the case's visa_submissions row,
// creating that row on first use.
export async function addVisaDocumentsForCaseRpc(
  caseId: string,
  pendingDocuments: PendingDocument[],
): Promise<{ data: { submissionId: string; added: number } | null; error: string | null }> {
  const parsedDocuments = pendingVisaDocumentsSchema.safeParse(pendingDocuments)
  if (!parsedDocuments.success) return { data: null, error: 'Invalid document data' }

  const supabase = await createClient()

  const docs: RpcVisaDocument[] = parsedDocuments.data.map((d) => ({
    category:        d.category,
    file_name:       d.fileName,
    file_path:       d.filePath,
    file_size_bytes: d.fileSizeBytes,
    mime_type:       d.mimeType,
  }))

  const db = supabase as unknown as AddVisaDocumentsForCaseClient
  const { data, error } = await db.rpc('add_visa_documents_for_case', {
    p_case_id:   caseId,
    p_documents: docs,
  })

  if (error) return { data: null, error: error.message }
  return { data: data ? { submissionId: data.submission_id, added: data.added } : null, error: null }
}

type BatchInsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>
  }
}

// Uploads with no case chosen yet — direct insert (no RPC needed, the
// existing "Patients insert own visa documents" RLS policy doesn't require
// case_id/visa_submission_id). Linked to a case later via
// linkVisaDocumentToCaseRpc, mirroring case_documents' optional-case flow.
export async function insertUnlinkedVisaDocuments(
  docs: Array<{
    patientId: string
    category: string
    fileName: string
    filePath: string
    fileSizeBytes: number
    mimeType: string
  }>,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as BatchInsertClient
  const { error } = await supabase.from('visa_documents').insert(
    docs.map((d) => ({
      patient_id:      d.patientId,
      category:        d.category,
      file_name:       d.fileName,
      file_path:       d.filePath,
      file_size_bytes: d.fileSizeBytes,
      mime_type:       d.mimeType,
    })),
  )
  return { error: error?.message ?? null }
}

type LinkVisaDocumentToCaseClient = {
  rpc(
    fn: 'link_visa_document_to_case',
    args: { p_document_id: string; p_case_id: string },
  ): Promise<{ data: { submission_id: string } | null; error: { message: string } | null }>
}

export async function linkVisaDocumentToCaseRpc(
  documentId: string,
  caseId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const db = supabase as unknown as LinkVisaDocumentToCaseClient
  const { error } = await db.rpc('link_visa_document_to_case', {
    p_document_id: documentId,
    p_case_id:     caseId,
  })
  return { error: error?.message ?? null }
}

export async function createVisaDocumentSignedUrl(
  filePath: string,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('visa-documents')
    .createSignedUrl(filePath, 3600)
  if (error || !data?.signedUrl) return { url: null, error: error?.message ?? 'Failed' }
  return { url: data.signedUrl, error: null }
}

export async function fetchAllVisaSubmissionsWithCase(
  patientId: string,
): Promise<{ data: VisaSubmissionWithCase[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select(`${VISA_SUBMISSION_COLUMNS}, cases(id, reference_number, specialty)`)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as VisaSubmissionWithCase[], error: null }
}

export async function fetchVisaSubmissionWithCaseDetail(
  submissionId: string,
): Promise<{ data: VisaSubmissionWithCase | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select(`${VISA_SUBMISSION_COLUMNS}, cases(id, reference_number, specialty)`)
    .eq('id', submissionId)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as unknown as VisaSubmissionWithCase | null, error: null }
}

// ── Hospital-generated visa letters (Hospital Invitation / Appointment ──
// Confirmation) — reuse visa_documents with source = 'hospital_generated'.
// `source`, `case_id`, `sent_to_patient_at` aren't in the generated Database
// types yet (migration not pushed to the linked project at the time this was
// written) — same manual-cast bypass already used in treatment-plans.ts.

export type HospitalLetterType = 'hospital_invitation' | 'appointment_confirmation'

export type HospitalGeneratedDocument = {
  id: string
  case_id: string
  category: HospitalLetterType
  file_name: string
  file_path: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string
  sent_to_patient_at: string | null
}

type UntypedResult = { data: unknown; error: { message: string } | null }
type ChainableQuery = {
  eq: (col: string, value: string) => ChainableQuery
  in: (col: string, values: string[]) => ChainableQuery
  not: (col: string, op: string, value: null) => ChainableQuery
  order: (col: string, opts: { ascending: boolean }) => Promise<UntypedResult>
}
type VisaDocumentsQueryClient = {
  from: (table: string) => { select: (columns: string) => ChainableQuery }
}

const HOSPITAL_LETTER_COLUMNS =
  'id, case_id, category, file_name, file_path, file_size_bytes, mime_type, uploaded_at, sent_to_patient_at'

/** Hospital-side: every generated letter for a case, sent or not. */
export async function fetchHospitalGeneratedDocumentsForCase(
  caseId: string,
): Promise<{ data: HospitalGeneratedDocument[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(HOSPITAL_LETTER_COLUMNS)
    .eq('case_id', caseId)
    .eq('source', 'hospital_generated')
    .order('category', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as HospitalGeneratedDocument[], error: null }
}

/** Hospital-side, batched: every generated letter across a set of cases —
 * used by the Documents list page so it doesn't issue one query per case. */
export async function fetchHospitalGeneratedDocumentsForCases(
  caseIds: string[],
): Promise<{ data: HospitalGeneratedDocument[]; error: string | null }> {
  if (caseIds.length === 0) return { data: [], error: null }

  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(HOSPITAL_LETTER_COLUMNS)
    .in('case_id', caseIds)
    .eq('source', 'hospital_generated')
    .order('category', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as HospitalGeneratedDocument[], error: null }
}

/** Patient-side: only letters the hospital has explicitly sent (RLS enforces this too). */
export async function fetchSentHospitalDocumentsForCase(
  caseId: string,
): Promise<{ data: HospitalGeneratedDocument[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(HOSPITAL_LETTER_COLUMNS)
    .eq('case_id', caseId)
    .eq('source', 'hospital_generated')
    .not('sent_to_patient_at', 'is', null)
    .order('category', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as HospitalGeneratedDocument[], error: null }
}

/** Patient-side, batched: only letters the hospital has explicitly sent, across a set of cases. */
export async function fetchSentHospitalDocumentsForCases(
  caseIds: string[],
): Promise<{ data: HospitalGeneratedDocument[]; error: string | null }> {
  if (caseIds.length === 0) return { data: [], error: null }

  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(HOSPITAL_LETTER_COLUMNS)
    .in('case_id', caseIds)
    .eq('source', 'hospital_generated')
    .not('sent_to_patient_at', 'is', null)
    .order('category', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as HospitalGeneratedDocument[], error: null }
}

type HospitalDocRpcClient = {
  rpc(
    fn: 'generate_hospital_visa_document',
    args: {
      p_case_id: string
      p_document_type: string
      p_file_path: string
      p_file_name: string
      p_file_size_bytes: number
      p_mime_type: string
    },
  ): Promise<{ data: { id: string } | null; error: { message: string } | null }>
  rpc(
    fn: 'send_visa_document_to_patient',
    args: { p_document_id: string },
  ): Promise<{ data: { id: string; case_id: string; category: string } | null; error: { message: string } | null }>
}

export async function recordGeneratedVisaDocument(input: {
  caseId: string
  documentType: HospitalLetterType
  filePath: string
  fileName: string
  fileSizeBytes: number
  mimeType: string
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as HospitalDocRpcClient
  const { data, error } = await supabase.rpc('generate_hospital_visa_document', {
    p_case_id: input.caseId,
    p_document_type: input.documentType,
    p_file_path: input.filePath,
    p_file_name: input.fileName,
    p_file_size_bytes: input.fileSizeBytes,
    p_mime_type: input.mimeType,
  })
  if (error || !data) return { data: null, error: error?.message ?? 'Failed to record generated document' }
  return { data, error: null }
}

export { VISA_STATUS_TRANSITIONS } from './visa-status'

type UpdateVisaSubmissionStatusClient = {
  rpc(
    fn: 'update_visa_submission_status',
    args: { p_case_id: string; p_status: string; p_rejection_reason: string | null },
  ): Promise<{ error: { message: string } | null }>
}

/**
 * Lawyer-only status transition, gated + validated server-side by the RPC —
 * see 20260901010000/20260902100000. `rejectionReason` is required by the
 * RPC when `status === 'rejected'`; ignored otherwise.
 */
export async function updateVisaSubmissionStatusRpc(
  caseId: string,
  status: string,
  rejectionReason?: string | null,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as UpdateVisaSubmissionStatusClient
  const { error } = await supabase.rpc('update_visa_submission_status', {
    p_case_id: caseId,
    p_status: status,
    p_rejection_reason: rejectionReason ?? null,
  })
  return { error: error?.message ?? null }
}

type GetCaseProviderUserIdsClient = {
  rpc(
    fn: 'get_case_provider_user_ids',
    args: { p_case_id: string },
  ): Promise<{
    data: { hospital_user_id: string | null; doctor_user_id: string | null }[] | null
    error: { message: string } | null
  }>
}

/**
 * The auth user_id of the hospital and doctor tied to a case's treatment
 * plan — for notifying them from the lawyer portal on visa approval/
 * rejection. Lawyers have no direct RLS read on treatment_plans, so this
 * goes through a security-definer RPC (20260902100000) rather than a plain
 * select. Either id (or the whole result) can come back null if no
 * treatment plan exists yet for the case.
 */
export async function fetchCaseProviderUserIds(
  caseId: string,
): Promise<{ data: { hospitalUserId: string | null; doctorUserId: string | null }; error: string | null }> {
  const supabase = (await createClient()) as unknown as GetCaseProviderUserIdsClient
  const { data, error } = await supabase.rpc('get_case_provider_user_ids', { p_case_id: caseId })
  if (error) return { data: { hospitalUserId: null, doctorUserId: null }, error: error.message }
  const row = data?.[0]
  return {
    data: { hospitalUserId: row?.hospital_user_id ?? null, doctorUserId: row?.doctor_user_id ?? null },
    error: null,
  }
}

export async function markVisaDocumentSentToPatient(
  documentId: string,
): Promise<{ data: { id: string; case_id: string; category: string } | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as HospitalDocRpcClient
  const { data, error } = await supabase.rpc('send_visa_document_to_patient', { p_document_id: documentId })
  if (error || !data) return { data: null, error: error?.message ?? 'Failed to send document' }
  return { data, error: null }
}

// ── Lawyer-issued approved visa (Module 06, SOW 6.1) — reuses
// visa_documents with source = 'lawyer_issued', category = 'approved_visa'.
// Unlike hospital letters there's no separate "send" step: the RPC stamps
// sent_to_patient_at immediately on upload.

export type LawyerIssuedDocument = {
  id: string
  case_id: string
  category: 'approved_visa'
  file_name: string
  file_path: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string
  sent_to_patient_at: string | null
}

const LAWYER_ISSUED_DOCUMENT_COLUMNS =
  'id, case_id, category, file_name, file_path, file_size_bytes, mime_type, uploaded_at, sent_to_patient_at'

/** Lawyer-side, batched: the approved-visa document (if any) across a set of
 * cases — used by the Documents list page so it doesn't issue one query per case. */
export async function fetchLawyerIssuedDocumentsForCases(
  caseIds: string[],
): Promise<{ data: LawyerIssuedDocument[]; error: string | null }> {
  if (caseIds.length === 0) return { data: [], error: null }

  const supabase = (await createClient()) as unknown as VisaDocumentsQueryClient
  const { data, error } = await supabase
    .from('visa_documents')
    .select(LAWYER_ISSUED_DOCUMENT_COLUMNS)
    .in('case_id', caseIds)
    .eq('source', 'lawyer_issued')
    .order('uploaded_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as LawyerIssuedDocument[], error: null }
}

/** Patient-side: the approved-visa document for a single case, if the lawyer
 * has issued one yet (RLS enforces this too). */
export async function fetchApprovedVisaDocumentForCase(
  caseId: string,
): Promise<{ data: LawyerIssuedDocument | null; error: string | null }> {
  const { data, error } = await fetchLawyerIssuedDocumentsForCases([caseId])
  return { data: data[0] ?? null, error }
}

type RecordLawyerVisaDocumentClient = {
  rpc(
    fn: 'record_lawyer_visa_document',
    args: {
      p_case_id: string
      p_file_path: string
      p_file_name: string
      p_file_size_bytes: number
      p_mime_type: string
    },
  ): Promise<{ data: { id: string; patient_id: string } | null; error: { message: string } | null }>
}

export async function recordLawyerVisaDocument(input: {
  caseId: string
  filePath: string
  fileName: string
  fileSizeBytes: number
  mimeType: string
}): Promise<{ data: { id: string; patientId: string } | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as RecordLawyerVisaDocumentClient
  const { data, error } = await supabase.rpc('record_lawyer_visa_document', {
    p_case_id: input.caseId,
    p_file_path: input.filePath,
    p_file_name: input.fileName,
    p_file_size_bytes: input.fileSizeBytes,
    p_mime_type: input.mimeType,
  })
  if (error || !data) return { data: null, error: error?.message ?? 'Failed to record document' }
  return { data: { id: data.id, patientId: data.patient_id }, error: null }
}
