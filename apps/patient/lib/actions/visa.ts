'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import {
  insertVisaDocument,
  insertUnlinkedVisaDocuments,
  linkVisaDocumentToCaseRpc,
  createVisaDocumentSignedUrl,
  submitVisaApplicationRpc,
  addVisaDocumentsForCaseRpc,
  fetchLawyerUserIdForCase,
  type PendingDocument,
} from '@iha/db/visa'
import { insertNotification, fetchCaseById } from '@iha/db/cases'
import { getStorageObjectMeta } from '@iha/db/storage'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { visaFormSchema, type VisaFormInput } from '@iha/validations'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:visa')

// Matches apps/visa/components/cases/document-category-labels.ts — small
// local copy rather than a shared import since this is a plain-English
// notification string, not routed through this app's own i18n system (the
// recipient is a lawyer in a different portal/locale context).
const VISA_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  passport: 'Passport Copy',
  passport_photograph: 'Passport Size Photograph',
  hospital_invitation: 'Hospital Invitation Letter',
  appointment_confirmation: 'Appointment Confirmation Letter',
  bank_statement: 'Bank Statement',
  sponsorship_letter: 'Sponsorship Letter',
  employer_letter: 'Employer Letter',
  companion_passport: 'Companion Passport Copy',
  companion_proof_of_relationship: 'Proof of Relationship',
}

// Best-effort: the document write already succeeded by the time this runs,
// so a failure here (no lawyer assigned yet, notification insert error) is
// logged and swallowed rather than surfaced to the patient as an upload
// failure — mirrors requestDocumentAction's notify-after-write pattern on
// the visa lawyer side.
async function notifyLawyerOfDocumentUpload(caseId: string, category: string): Promise<void> {
  const { data: lawyerUserId, error: lawyerLookupError } = await fetchLawyerUserIdForCase(caseId)
  if (lawyerLookupError || !lawyerUserId) {
    if (lawyerLookupError) logger.error({ err: lawyerLookupError, caseId }, 'notifyLawyerOfDocumentUpload lawyer lookup failed')
    return
  }

  const { data: caseRow } = await fetchCaseById(caseId)
  const categoryLabel = VISA_DOCUMENT_CATEGORY_LABELS[category] ?? category
  const { error: notifyError } = await insertNotification({
    user_id: lawyerUserId,
    type: 'visa_document_uploaded',
    title: 'Patient uploaded a document',
    message: `${categoryLabel} was uploaded for case ${caseRow?.reference_number ?? ''}.`,
    case_id: caseId,
  })
  if (notifyError) {
    logger.error({ err: notifyError, caseId }, 'notifyLawyerOfDocumentUpload insertNotification failed')
  }
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp'])
const MAX_FILE_SIZE = 10 * 1024 * 1024

function getExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot !== -1 ? fileName.slice(dot).toLowerCase() : ''
}

// Re-validates each pending document against what Supabase Storage actually
// recorded for it (real size/mimetype from the stored object) rather than the
// fileSizeBytes/mimeType the client reports — see the matching helper in
// lib/actions/cases.ts for why this is needed. Returns the docs with their
// mimeType/fileSizeBytes overwritten with the verified values.
async function verifyPendingDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  docs: PendingDocument[],
): Promise<{ ok: true; documents: PendingDocument[] } | { ok: false; error: string }> {
  const t = await getTranslations('actionErrors')
  const verified: PendingDocument[] = []
  for (const doc of docs) {
    if (!ALLOWED_EXTENSIONS.has(getExt(doc.fileName))) {
      return { ok: false, error: t('common.uploadErrorFileType') }
    }

    const meta = await getStorageObjectMeta(supabase, 'visa-documents', doc.filePath)
    if (!meta) {
      return { ok: false, error: t('common.fileVerificationFailed') }
    }
    if (!ALLOWED_MIME_TYPES.has(meta.mimetype)) {
      return { ok: false, error: t('common.uploadErrorFileType') }
    }
    if (meta.size > MAX_FILE_SIZE) {
      return { ok: false, error: t('common.fileSizeLimitExceeded') }
    }

    verified.push({ ...doc, mimeType: meta.mimetype, fileSizeBytes: meta.size })
  }
  return { ok: true, documents: verified }
}

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function getPatient(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .single()
  return data as { id: string } | null
}

// SENSITIVE: formData carries passport_number/passport_expiry and companion
// passport fields (see visaFormSchema) — never log formData/parsed.data directly.
export async function submitVisaForm(
  caseId: string,
  formData: VisaFormInput,
  pendingDocuments: PendingDocument[],
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const parsed = visaFormSchema.safeParse(formData)
  if (!parsed.success) {
    return { data: null, error: t('common.tryAgainWithSubmission') }
  }

  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()
  const verifyResult = await verifyPendingDocuments(supabase, pendingDocuments)
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }
  const documents = verifyResult.documents

  const { data, error } = await submitVisaApplicationRpc(caseId, parsed.data as Record<string, string>, documents)
  if (error || !data) {
    // SENSITIVE: `error` is a DB error message only, never the passport payload itself
    logger.error({ err: error }, 'submitVisaForm failed')
    return { data: null, error: error ?? t('visa.submitApplicationFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'visa.submitted',
    entityType: 'case',
    entityId: caseId,
    metadata: { document_count: pendingDocuments.length },
  })

  const { data: caseRow } = await fetchCaseById(caseId)
  await insertNotification({
    user_id: user.id,
    type: 'visa_application_submitted',
    title: 'Visa application submitted',
    message: `Your visa application for case ${caseRow?.reference_number ?? ''} has been submitted.`,
    case_id: caseId,
  })

  revalidatePath(`/cases/${caseId}/visa`)
  revalidatePath(`/cases/${caseId}`)
  return { data: { success: true }, error: null }
}

export async function addVisaDocument(params: {
  caseId: string
  visaSubmissionId: string
  category: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  mimeType: string
}): Promise<Result<{ id: string }>> {
  const t = await getTranslations('actionErrors')
  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()
  const verifyResult = await verifyPendingDocuments(supabase, [{
    category: params.category,
    fileName: params.fileName,
    filePath: params.filePath,
    fileSizeBytes: params.fileSizeBytes,
    mimeType: params.mimeType,
  }])
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }
  const verifiedDoc = verifyResult.documents[0]
  if (!verifiedDoc) return { data: null, error: t('common.uploadErrorFileType') }

  const patient = await getPatient(user.id)
  if (!patient) return { data: null, error: t('visa.patientNotFound') }

  const result = await insertVisaDocument({
    visaSubmissionId: params.visaSubmissionId,
    caseId:           params.caseId,
    patientId:        patient.id,
    category:         verifiedDoc.category,
    fileName:         verifiedDoc.fileName,
    filePath:         verifiedDoc.filePath,
    fileSizeBytes:    verifiedDoc.fileSizeBytes,
    mimeType:         verifiedDoc.mimeType,
  })

  if (result.error || !result.data) {
    logger.error({ err: result.error }, 'addVisaDocument failed')
    return { data: null, error: result.error ?? t('visa.saveDocumentFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'visa.document_added',
    entityType: 'visa_submission',
    entityId: params.visaSubmissionId,
    metadata: { category: params.category },
  })

  await notifyLawyerOfDocumentUpload(params.caseId, params.category)

  revalidatePath(`/cases/${params.caseId}/visa`)
  return { data: { id: result.data.id }, error: null }
}

// Used by the Documents page's Visa tab — attaches one or more documents to
// a case's visa submission without going through the full application
// wizard. `caseId` is optional, same as the Medical tab: leave it unset to
// upload unlinked and attach a case later via linkVisaDocumentToCase.
export async function addVisaDocumentsForCase(
  caseId: string | null,
  pendingDocuments: PendingDocument[],
): Promise<Result<{ added: number }>> {
  const t = await getTranslations('actionErrors')
  if (!pendingDocuments.length) return { data: null, error: t('cases.noDocumentsProvided') }

  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()
  const verifyResult = await verifyPendingDocuments(supabase, pendingDocuments)
  if (!verifyResult.ok) return { data: null, error: verifyResult.error }

  if (!caseId) {
    const patient = await getPatient(user.id)
    if (!patient) return { data: null, error: t('visa.patientNotFound') }

    const { error } = await insertUnlinkedVisaDocuments(
      verifyResult.documents.map((d) => ({
        patientId:     patient.id,
        category:      d.category,
        fileName:      d.fileName,
        filePath:      d.filePath,
        fileSizeBytes: d.fileSizeBytes,
        mimeType:      d.mimeType,
      })),
    )
    if (error) {
      logger.error({ err: error }, 'addVisaDocumentsForCase (unlinked) failed')
      return { data: null, error: t('visa.saveDocumentFailed') }
    }

    await logAuditEvent({
      app: 'patient',
      action: 'visa.documents_added',
      entityType: 'patient',
      entityId: patient.id,
      metadata: { document_count: pendingDocuments.length },
    })

    revalidatePath('/documents')
    return { data: { added: pendingDocuments.length }, error: null }
  }

  const { data, error } = await addVisaDocumentsForCaseRpc(caseId, verifyResult.documents)
  if (error || !data) {
    logger.error({ err: error }, 'addVisaDocumentsForCase failed')
    const message = error?.includes('case_not_eligible_for_visa_documents')
      ? t('visa.caseNotEligible')
      : (error ?? t('visa.saveDocumentFailed'))
    return { data: null, error: message }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'visa.documents_added',
    entityType: 'case',
    entityId: caseId,
    metadata: { document_count: data.added },
  })

  const { data: lawyerUserId, error: lawyerLookupError } = await fetchLawyerUserIdForCase(caseId)
  if (lawyerLookupError) {
    logger.error({ err: lawyerLookupError, caseId }, 'addVisaDocumentsForCase lawyer lookup failed')
  } else if (lawyerUserId) {
    const { data: caseRow } = await fetchCaseById(caseId)
    const { error: notifyError } = await insertNotification({
      user_id: lawyerUserId,
      type: 'visa_document_uploaded',
      title: 'Patient uploaded a document',
      message: `${data.added} document${data.added === 1 ? '' : 's'} uploaded for case ${caseRow?.reference_number ?? ''}.`,
      case_id: caseId,
    })
    if (notifyError) {
      logger.error({ err: notifyError, caseId }, 'addVisaDocumentsForCase insertNotification failed')
    }
  }

  revalidatePath('/documents')
  revalidatePath(`/cases/${caseId}`)
  revalidatePath(`/cases/${caseId}/visa`)
  return { data: { added: data.added }, error: null }
}

// Attaches a previously-unlinked visa document (uploaded via the Documents
// page with no case chosen) to a case.
export async function linkVisaDocumentToCase(
  documentId: string,
  caseId: string,
): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const { error } = await linkVisaDocumentToCaseRpc(documentId, caseId)
  if (error) {
    logger.error({ err: error }, 'linkVisaDocumentToCase failed')
    const message = error.includes('case_not_eligible_for_visa_documents')
      ? t('visa.caseNotEligible')
      : t('cases.linkDocumentFailed')
    return { data: null, error: message }
  }

  revalidatePath('/documents')
  revalidatePath(`/cases/${caseId}`)
  return { data: { success: true }, error: null }
}

export async function generateVisaDocumentSignedUrl(
  filePath: string,
): Promise<Result<{ url: string }>> {
  const t = await getTranslations('actionErrors')
  const user = await getAuthUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const { url, error } = await createVisaDocumentSignedUrl(filePath)
  if (error || !url) {
    logger.error({ err: error }, 'generateVisaDocumentSignedUrl failed')
    return { data: null, error: t('visa.downloadLinkFailed') }
  }

  return { data: { url }, error: null }
}
