'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { insertNotification } from '@iha/db/cases'
import { recordLawyerVisaDocument } from '@iha/db/visa'
import type { Result } from '@iha/validations'
import { createLogger } from '@iha/logger'
import { fetchPatientUserIdForCase } from '@/lib/data/cases'
import { getDocumentCategoryLabel } from '@/components/cases/document-category-labels'

const logger = createLogger('visa:documents')

const UPLOAD_APPROVED_VISA_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to upload documents for this case.',
  not_found: 'Visa application not found for this case.',
  visa_not_approved: 'The visa document can only be uploaded once this case has been marked Approved.',
}

export async function uploadApprovedVisaDocumentAction(
  caseId: string,
  doc: { fileName: string; filePath: string; fileSizeBytes: number; mimeType: string },
): Promise<Result<{ id: string }>> {
  const { data, error } = await recordLawyerVisaDocument({
    caseId,
    filePath: doc.filePath,
    fileName: doc.fileName,
    fileSizeBytes: doc.fileSizeBytes,
    mimeType: doc.mimeType,
  })

  if (error || !data) {
    const mapped = error ? Object.entries(UPLOAD_APPROVED_VISA_ERROR_MESSAGES).find(([code]) => error.includes(code)) : null
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error, caseId }, 'uploadApprovedVisaDocumentAction failed')
    return { data: null, error: 'Failed to save the approved visa. Please try again.' }
  }

  // In-portal-only fallback, same convention as requestDocumentAction below:
  // the document is already saved even if this lookup/dispatch fails.
  const { data: patientUserId, error: patientLookupError } = await fetchPatientUserIdForCase(caseId)
  if (patientLookupError || !patientUserId) {
    logger.error({ err: patientLookupError, caseId }, 'uploadApprovedVisaDocumentAction patient lookup failed')
  } else {
    const { error: notifyError } = await insertNotification({
      user_id: patientUserId,
      type: 'visa_document_available',
      title: 'Your approved visa is ready',
      message: 'Your visa lawyer has uploaded your approved visa — download it from your Visa & Travel section.',
      case_id: caseId,
    })
    if (notifyError) logger.error({ err: notifyError, caseId }, 'uploadApprovedVisaDocumentAction insertNotification failed')
  }

  revalidatePath('/documents')
  revalidatePath(`/visa-cases/${caseId}`)
  return { data: { id: data.id }, error: null }
}

export async function requestDocumentAction(
  caseId: string,
  category: string,
  documentType: string,
  instructions: string,
): Promise<Result<{ success: true }>> {
  if (!category.trim() || !documentType.trim()) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('request_visa_document', {
    p_case_id: caseId,
    p_category: category,
    p_document_type: documentType,
    p_instructions: instructions,
  })

  if (error) {
    if (error.message.includes('case_not_under_review')) {
      return { data: null, error: 'Document requests are only available while the case is under review.' }
    }
    logger.error({ err: error, caseId }, 'requestDocumentAction RPC failed')
    return { data: null, error: 'Something went wrong. Please try again.' }
  }

  // In-portal-only fallback: the RPC already succeeded (the request exists
  // and status advanced) even if this lookup/dispatch fails, so a failure
  // here is logged, not surfaced as an error to the lawyer.
  const { data: patientUserId, error: patientLookupError } = await fetchPatientUserIdForCase(caseId)
  if (patientLookupError || !patientUserId) {
    logger.error({ err: patientLookupError, caseId }, 'requestDocumentAction patient lookup failed')
  } else {
    const { error: notifyError } = await insertNotification({
      user_id: patientUserId,
      type: 'document_requested',
      title: 'Your visa lawyer requested a document',
      message: `Please upload: ${getDocumentCategoryLabel(category)} — ${documentType}${instructions ? ` (${instructions})` : ''}`,
      case_id: caseId,
    })
    if (notifyError) {
      logger.error({ err: notifyError, caseId }, 'requestDocumentAction insertNotification failed')
    }
  }

  revalidatePath(`/visa-cases/${caseId}`)
  return { data: { success: true }, error: null }
}
