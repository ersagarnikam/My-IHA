'use server'

import { createClient } from '@iha/db/server'
import { fetchCaseById, insertNotification } from '@iha/db/cases'
import { fetchPatientForCase } from '@iha/db/patients'
import { fetchTreatmentPlanForCase } from '@iha/db/treatment-plans'
import {
  createVisaDocumentSignedUrl,
  recordGeneratedVisaDocument,
  markVisaDocumentSentToPatient,
  type HospitalLetterType,
} from '@iha/db/visa'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@iha/logger'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchAssignmentForHospitalCase } from '@/lib/data/case-management'
import { fetchHospitalById } from '@/lib/data/hospitals'
import { buildHospitalInvitationLetterPdf, buildAppointmentConfirmationLetterPdf } from '@/lib/pdf/case-letters'

const logger = createLogger('hospital:visa-documents')

const LETTER_LABELS: Record<HospitalLetterType, string> = {
  hospital_invitation: 'Hospital Invitation Letter',
  appointment_confirmation: 'Appointment Confirmation Letter',
}

const GENERATE_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'You are not authorised to generate documents for this case.',
  plan_not_selected: 'This case was confirmed with a different hospital, so you can no longer generate documents for it.',
  case_not_payment_confirmed: 'This case is not yet eligible for visa documents — payment must be confirmed first.',
  invalid_document_type: 'Unknown document type.',
}

export async function generateHospitalVisaDocumentAction(
  caseId: string,
  documentType: HospitalLetterType,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const account = await getAccountForUser(user.id)
  if (!account || account.role !== 'hospital') return { data: null, error: 'Unauthorized.' }

  const [{ data: assignment, error: assignmentError }, { data: caseRow, error: caseError }, hospital] =
    await Promise.all([
      fetchAssignmentForHospitalCase(caseId),
      fetchCaseById(caseId),
      fetchHospitalById(account.id),
    ])

  if (!assignment || !caseRow || !hospital) {
    logger.error(
      {
        caseId,
        hospitalId: account.id,
        hasAssignment: Boolean(assignment),
        hasCase: Boolean(caseRow),
        hasHospital: Boolean(hospital),
        assignmentError,
        caseError,
      },
      'generateHospitalVisaDocumentAction: one or more lookups came back empty',
    )
    return { data: null, error: 'Case not found.' }
  }

  const [{ data: patient }, { data: plan }] = await Promise.all([
    fetchPatientForCase(caseRow.patient_id),
    fetchTreatmentPlanForCase(caseId, assignment.doctor_id),
  ])

  if (!patient) return { data: null, error: 'Patient not found.' }

  let pdfBytes: Uint8Array
  try {
    // SENSITIVE: input carries patient DOB/gender and the treatment plan's
    // diagnosis — never log this object, only the generated document id.
    const input = {
      case: { reference_number: caseRow.reference_number, specialty: caseRow.specialty, specialty_other: caseRow.specialty_other },
      patient: {
        full_name: patient.full_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        country_of_residence: patient.country_of_residence,
      },
      doctor: assignment.doctors ? { full_name: assignment.doctors.full_name } : null,
      plan: plan
        ? {
            procedure_name: plan.procedure_name,
            diagnosis: plan.diagnosis,
            treatment_type: plan.treatment_type,
            treatment_start_date: plan.treatment_start_date,
            treatment_end_date: plan.treatment_end_date,
            estimated_length_of_stay: plan.estimated_length_of_stay,
            department: plan.department,
          }
        : null,
      hospital,
    }

    pdfBytes = await (documentType === 'hospital_invitation'
      ? buildHospitalInvitationLetterPdf(input)
      : buildAppointmentConfirmationLetterPdf(input))
  } catch (err) {
    logger.error({ err, caseId, documentType }, 'letter PDF generation failed')
    return { data: null, error: 'Failed to generate the letter. Please try again.' }
  }

  const filePath = `hospital-generated/${caseId}/${documentType}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('visa-documents')
    .upload(filePath, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    logger.error({ err: uploadError, caseId, documentType }, 'letter upload failed')
    return { data: null, error: 'Failed to save the generated letter. Please try again.' }
  }

  const { data, error } = await recordGeneratedVisaDocument({
    caseId,
    documentType,
    filePath,
    fileName: `${LETTER_LABELS[documentType].replace(/\s+/g, '_')}.pdf`,
    fileSizeBytes: pdfBytes.byteLength,
    mimeType: 'application/pdf',
  })

  if (error || !data) {
    const mapped = error ? Object.entries(GENERATE_ERROR_MESSAGES).find(([code]) => error.includes(code)) : null
    if (mapped) return { data: null, error: mapped[1] }
    logger.error({ err: error, caseId, documentType }, 'recordGeneratedVisaDocument failed')
    return { data: null, error: 'Failed to save the generated letter. Please try again.' }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'visa_document.generated',
    entityType: 'visa_document',
    entityId: data.id,
    metadata: { case_id: caseId, document_type: documentType },
  })

  revalidatePath(`/case-management/${caseId}`)
  revalidatePath('/documents')

  return { data: { id: data.id }, error: null }
}

export async function sendVisaDocumentToPatientAction(
  documentId: string,
  caseId: string,
): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { data, error } = await markVisaDocumentSentToPatient(documentId)
  if (error || !data) {
    logger.error({ err: error, documentId }, 'markVisaDocumentSentToPatient failed')
    return { data: null, error: 'Failed to send this document to the patient. Please try again.' }
  }

  const { data: caseRow } = await fetchCaseById(caseId)
  if (caseRow) {
    const { data: patientRow } = await supabase
      .from('patients')
      .select('user_id')
      .eq('id', caseRow.patient_id)
      .maybeSingle()

    const patientUserId = (patientRow as { user_id: string } | null)?.user_id
    if (patientUserId) {
      const label = LETTER_LABELS[data.category as HospitalLetterType] ?? 'Document'
      await insertNotification({
        user_id: patientUserId,
        type: 'visa_document_available',
        title: `${label} available`,
        message: `Your hospital has issued your ${label.toLowerCase()} — it's ready to download from your Visa & Travel section.`,
        case_id: caseId,
      })
    }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'visa_document.sent_to_patient',
    entityType: 'visa_document',
    entityId: documentId,
    metadata: { case_id: caseId },
  })

  revalidatePath(`/case-management/${caseId}`)
  revalidatePath('/documents')

  return { data: { success: true }, error: null }
}

export async function generateHospitalLetterSignedUrlAction(filePath: string): Promise<Result<{ url: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const { url, error } = await createVisaDocumentSignedUrl(filePath)
  if (error || !url) {
    logger.error({ err: error, filePath }, 'generateHospitalLetterSignedUrlAction failed')
    return { data: null, error: 'Failed to generate a preview link.' }
  }

  return { data: { url }, error: null }
}
