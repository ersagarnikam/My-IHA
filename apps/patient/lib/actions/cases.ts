'use server'

import { createClient } from '@iha/db/server'
import { insertCase, insertCaseDocuments, insertPatientDocuments, insertNotification, fetchCaseById, updateCaseTravelAssistance, updateDocumentCaseLink } from '@iha/db/cases'
import { getStorageObjectMeta } from '@iha/db/storage'
import { logAuditEvent } from '@iha/db/audit'
import { medicalDetailsSchema, type MedicalDetailsInput, type SubmittedDocument } from '@iha/validations'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:cases')

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp'])
const MAX_FILE_SIZE = 10 * 1024 * 1024

function getExt(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot !== -1) return fileName.slice(dot).toLowerCase()
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  return ''
}

// Re-validates each uploaded document against what Supabase Storage actually
// recorded for it (real size/mimetype from the stored object), rather than the
// mime_type/file_size_bytes the client reports alongside the row insert — a
// client can lie about those fields even though the bucket itself already
// rejects disallowed uploads at write time. Returns the docs with their
// mime_type/file_size_bytes overwritten with the verified values.
async function verifyDocuments<T extends SubmittedDocument>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  docs: T[],
): Promise<{ ok: true; documents: T[] } | { ok: false; error: string }> {
  const t = await getTranslations('actionErrors')
  const verified: T[] = []
  for (const doc of docs) {
    if (!ALLOWED_EXTENSIONS.has(getExt(doc.file_name, doc.mime_type))) {
      return { ok: false, error: t('common.uploadErrorFileType') }
    }

    const meta = await getStorageObjectMeta(supabase, 'case-documents', doc.file_path)
    if (!meta) {
      return { ok: false, error: t('common.fileVerificationFailed') }
    }
    if (!ALLOWED_MIME_TYPES.has(meta.mimetype)) {
      return { ok: false, error: t('common.uploadErrorFileType') }
    }
    if (meta.size > MAX_FILE_SIZE) {
      return { ok: false, error: t('common.fileSizeLimitExceeded') }
    }

    verified.push({ ...doc, mime_type: meta.mimetype, file_size_bytes: meta.size })
  }
  return { ok: true, documents: verified }
}

function logicalFileNames(
  docs: SubmittedDocument[],
  referenceNumber: string,
): string[] {
  const typeCount = new Map<string, number>()
  return docs.map((doc) => {
    const count = typeCount.get(doc.document_type) ?? 0
    typeCount.set(doc.document_type, count + 1)
    const ext = getExt(doc.file_name, doc.mime_type)
    const suffix = count > 0 ? `-${count + 1}` : ''
    return `${referenceNumber}-${doc.document_type}${suffix}${ext}`
  })
}

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

type SubmitCasePayload = {
  medicalDetails: MedicalDetailsInput
  documents: SubmittedDocument[]
}

export async function submitCase(
  payload: SubmitCasePayload,
): Promise<Result<{ caseId: string; referenceNumber: string }>> {
  const t = await getTranslations('actionErrors')
  const parsed = medicalDetailsSchema.safeParse(payload.medicalDetails)
  if (!parsed.success) {
    return { data: null, error: t('common.tryAgainWithSubmission') }
  }

  if (payload.documents.length === 0) {
    return { data: null, error: t('cases.uploadAtLeastOneDocument') }
  }

  const supabase = await createClient()
  const verifyResult = await verifyDocuments(supabase, payload.documents)
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }
  const documents = verifyResult.documents

  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const patient = await fetchPatientByUserId(user.id)
  if (!patient) return { data: null, error: t('cases.patientProfileNotFound') }

  // 1. Create case row
  const { data: caseData, error: caseError } = await insertCase({
    specialty: parsed.data.specialty,
    specialty_other: parsed.data.specialty_other?.trim() || null,
    description: parsed.data.description,
  })

  if (caseError || !caseData) {
    logger.error({ err: caseError }, 'submitCase failed')
    return { data: null, error: t('cases.submitFailed') }
  }

  // 2. Insert document metadata
  const names = logicalFileNames(documents, caseData.reference_number)
  const { error: docsError } = await insertCaseDocuments(
    documents.map((doc, i) => ({
      case_id: caseData.id,
      patient_id: patient.id,
      file_name: names[i] ?? doc.file_name,
      file_path: doc.file_path,
      file_size_bytes: doc.file_size_bytes,
      mime_type: doc.mime_type,
      document_type: doc.document_type,
    })),
  )

  if (docsError) {
    logger.error({ err: docsError }, 'submitCase documents insert failed')
    // Non-fatal — case exists, documents can be retried
  }

  // 3. Notification
  await insertNotification({
    user_id: user.id,
    type: 'case_submitted',
    title: 'Case submitted',
    message: `Your case ${caseData.reference_number} has been received by MTA.`,
    case_id: caseData.id,
  })

  await logAuditEvent({
    app: 'patient',
    action: 'case.submitted',
    entityType: 'case',
    entityId: caseData.id,
    metadata: { reference_number: caseData.reference_number, document_count: payload.documents.length },
  })

  revalidatePath('/cases')
  return { data: { caseId: caseData.id, referenceNumber: caseData.reference_number }, error: null }
}

export async function addDocumentsToCase(
  caseId: string,
  documents: SubmittedDocument[],
): Promise<Result<{ added: number }>> {
  const t = await getTranslations('actionErrors')
  if (!documents.length) return { data: null, error: t('cases.noDocumentsProvided') }

  const supabase = await createClient()
  const verifyResult = await verifyDocuments(supabase, documents)
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }
  const verifiedDocuments = verifyResult.documents

  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  // RLS guarantees this case belongs to the authenticated user
  const { data: caseRow, error: caseErr } = await fetchCaseById(caseId)
  if (caseErr || !caseRow) return { data: null, error: t('common.caseNotFound') }

  const names = logicalFileNames(verifiedDocuments, caseRow.reference_number)
  const { error } = await insertCaseDocuments(
    verifiedDocuments.map((doc, i) => ({
      case_id: caseId,
      patient_id: caseRow.patient_id,
      file_name: names[i] ?? doc.file_name,
      file_path: doc.file_path,
      file_size_bytes: doc.file_size_bytes,
      mime_type: doc.mime_type,
      document_type: doc.document_type,
    })),
  )

  if (error) {
    logger.error({ err: error }, 'addDocumentsToCase failed')
    return { data: null, error: t('cases.saveDocumentsFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'case.documents_added',
    entityType: 'case',
    entityId: caseId,
    metadata: { document_count: documents.length },
  })

  revalidatePath(`/cases/${caseId}`)
  return { data: { added: documents.length }, error: null }
}

export async function updateTravelAssistance(
  caseId: string,
  needTravelAssistance: boolean,
  needStayBookingAssistance: boolean,
  needTransportationAssistance: boolean,
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const { error } = await updateCaseTravelAssistance(
    caseId,
    needTravelAssistance,
    needStayBookingAssistance,
    needTransportationAssistance,
  )
  if (error) {
    if (error.includes('case_not_travel_ready')) {
      return { data: null, error: t('cases.travelNotReady') }
    }
    if (error.includes('unauthorized') || error.includes('case_not_found')) {
      return { data: null, error: t('common.caseNotFound') }
    }
    logger.error({ err: error }, 'updateTravelAssistance failed')
    return { data: null, error: t('cases.saveTravelFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'case.travel_assistance_updated',
    entityType: 'case',
    entityId: caseId,
    metadata: {
      need_travel_assistance: needTravelAssistance,
      need_stay_booking_assistance: needStayBookingAssistance,
      need_transportation_assistance: needTransportationAssistance,
    },
  })

  revalidatePath(`/cases/${caseId}`)
  return { data: { success: true }, error: null }
}

type PatientDocument = SubmittedDocument & { document_category: 'medical' | 'visa' }

export async function addPatientDocuments(
  documents: PatientDocument[],
  caseId?: string | null,
): Promise<Result<{ added: number }>> {
  const t = await getTranslations('actionErrors')
  if (!documents.length) return { data: null, error: t('cases.noDocumentsProvided') }

  const supabase = await createClient()
  const verifyResult = await verifyDocuments(supabase, documents)
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }
  const verifiedDocuments = verifyResult.documents

  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const patient = await fetchPatientByUserId(user.id)
  if (!patient) return { data: null, error: t('cases.patientProfileNotFound') }

  let fileNames: string[]
  if (caseId) {
    const { data: caseRow, error: caseErr } = await fetchCaseById(caseId)
    if (caseErr || !caseRow) return { data: null, error: t('common.caseNotFound') }
    fileNames = logicalFileNames(verifiedDocuments, caseRow.reference_number)
  } else {
    const typeCount = new Map<string, number>()
    fileNames = verifiedDocuments.map((doc) => {
      const count = typeCount.get(doc.document_type) ?? 0
      typeCount.set(doc.document_type, count + 1)
      const ext = getExt(doc.file_name, doc.mime_type)
      const suffix = count > 0 ? `-${count + 1}` : ''
      return `${doc.document_type}${suffix}${ext}`
    })
  }

  const { error } = await insertPatientDocuments(
    verifiedDocuments.map((doc, i) => ({
      case_id: caseId ?? null,
      patient_id: patient.id,
      file_name: fileNames[i] ?? doc.file_name,
      file_path: doc.file_path,
      file_size_bytes: doc.file_size_bytes,
      mime_type: doc.mime_type,
      document_type: doc.document_type,
      document_category: doc.document_category,
    })),
  )

  if (error) {
    logger.error({ err: error }, 'addPatientDocuments failed')
    return { data: null, error: t('cases.saveDocumentsFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'case.documents_added',
    entityType: 'patient',
    entityId: patient.id,
    metadata: { document_count: documents.length, document_category: documents[0]?.document_category },
  })

  revalidatePath('/documents')
  if (caseId) revalidatePath(`/cases/${caseId}`)
  return { data: { added: documents.length }, error: null }
}

export async function linkDocumentToCase(
  documentId: string,
  caseId: string,
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()

  // Fetch the document to get its type, current filename (for extension), and mime
  const { data: docRaw } = await supabase
    .from('case_documents')
    .select('document_type, file_name, mime_type')
    .eq('id', documentId)
    .maybeSingle()
  const doc = docRaw as { document_type: string; file_name: string; mime_type: string } | null
  if (!doc) return { data: null, error: t('cases.documentNotFound') }

  // Fetch the case for the reference number
  const { data: caseRow, error: caseErr } = await fetchCaseById(caseId)
  if (caseErr || !caseRow) return { data: null, error: t('common.caseNotFound') }

  // Count existing docs of the same type already linked to this case (for dedup suffix)
  const { data: existingDocs } = await supabase
    .from('case_documents')
    .select('id')
    .eq('case_id', caseId)
    .eq('document_type', doc.document_type)
  const count = (existingDocs ?? []).length

  const ext = getExt(doc.file_name, doc.mime_type)
  const suffix = count > 0 ? `-${count + 1}` : ''
  const newFileName = `${caseRow.reference_number}-${doc.document_type}${suffix}${ext}`

  const { error } = await updateDocumentCaseLink(documentId, caseId, newFileName)
  if (error) {
    logger.error({ err: error }, 'linkDocumentToCase failed')
    return { data: null, error: t('cases.linkDocumentFailed') }
  }

  revalidatePath('/documents')
  revalidatePath(`/cases/${caseId}`)
  return { data: { success: true }, error: null }
}
