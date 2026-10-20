import { fetchAllVisaDocumentsForPatient } from '@iha/db/visa'
import type { DocumentWithCase } from './cases'

export async function fetchAllVisaApplicationDocumentsForPatientId(
  patientId: string,
): Promise<DocumentWithCase[]> {
  const { data } = await fetchAllVisaDocumentsForPatient(patientId)
  return data.map((doc) => ({
    id: doc.id,
    case_id: doc.case_id,
    document_category: 'visa',
    document_type: doc.category,
    file_name: doc.file_name,
    file_path: doc.file_path,
    file_size_bytes: doc.file_size_bytes ?? 0,
    mime_type: doc.mime_type ?? 'application/octet-stream',
    patient_id: patientId,
    uploaded_at: doc.uploaded_at,
    reference_number: doc.cases?.reference_number ?? null,
    case_specialty: doc.cases?.specialty_other ?? doc.cases?.specialty ?? null,
    origin: 'visa_documents' as const,
  }))
}
