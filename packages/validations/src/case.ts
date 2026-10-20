import { z } from 'zod'

export const VISA_DOCUMENT_CATEGORIES = [
  'passport',
  'passport_photograph',
  'hospital_invitation',
  'appointment_confirmation',
  'bank_statement',
  'sponsorship_letter',
  'employer_letter',
  'companion_passport',
  'companion_proof_of_relationship',
] as const

export type VisaDocumentCategory = (typeof VISA_DOCUMENT_CATEGORIES)[number]

// `hospital_invitation` / `appointment_confirmation` are generated and sent
// by the hospital directly (see the hospital-generated visa letters feature)
// — patients no longer upload these themselves anywhere in the app. This
// list drives upload-category pickers; `VISA_DOCUMENT_CATEGORIES` above stays
// unchanged so existing records under those two categories still resolve a
// proper label wherever they're displayed.
export const UPLOADABLE_VISA_DOCUMENT_CATEGORIES = [
  'passport',
  'passport_photograph',
  'bank_statement',
  'sponsorship_letter',
  'employer_letter',
  'companion_passport',
  'companion_proof_of_relationship',
] as const

export const DOCUMENT_TYPES = [
  'lab_report',
  'mri_ct',
  'xray',
  'prescription',
  'medical_history',
  'other',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  lab_report: 'Lab Report',
  mri_ct: 'MRI / CT Scan',
  xray: 'X-Ray',
  prescription: 'Prescription',
  medical_history: 'Medical History',
  other: 'Other',
}

export type MedicalDetailsMessages = {
  specialtyRequired: string
  specialtyOtherMaxLength: string
  descriptionMinLength: string
  descriptionMaxLength: string
  specialtyOtherRequired: string
}

const defaultMedicalDetailsMessages: MedicalDetailsMessages = {
  specialtyRequired: 'Please select a medical specialty',
  specialtyOtherMaxLength: 'Max 100 characters',
  descriptionMinLength: 'Please describe your condition in at least 50 characters',
  descriptionMaxLength: 'Description must be under 2000 characters',
  specialtyOtherRequired: 'Please describe your specialty (at least 2 characters)',
}

export function getMedicalDetailsSchema(messages: MedicalDetailsMessages = defaultMedicalDetailsMessages) {
  return z
    .object({
      specialty: z.string().min(1, messages.specialtyRequired),
      specialty_other: z.string().max(100, messages.specialtyOtherMaxLength).optional(),
      description: z
        .string()
        .min(50, messages.descriptionMinLength)
        .max(2000, messages.descriptionMaxLength),
    })
    .refine(
      (val) =>
        val.specialty !== 'Other' ||
        (val.specialty_other && val.specialty_other.trim().length >= 2),
      { message: messages.specialtyOtherRequired, path: ['specialty_other'] },
    )
}

export const medicalDetailsSchema = getMedicalDetailsSchema()

export const submittedDocumentSchema = z.object({
  localId: z.string(),
  file_name: z.string(),
  file_path: z.string(),
  file_size_bytes: z.number(),
  mime_type: z.string(),
  document_type: z.enum(DOCUMENT_TYPES),
})

export type MedicalDetailsInput = z.infer<typeof medicalDetailsSchema>
export type SubmittedDocument = z.infer<typeof submittedDocumentSchema>

// Backward-compat alias
export const caseSubmissionSchema = medicalDetailsSchema
export type CaseSubmissionInput = MedicalDetailsInput
