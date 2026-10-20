// Types and constants for the patient API. Labels come from the i18n catalogues.

export type CaseStatus =
  | 'case_submitted'
  | 'under_review'
  | 'doctor_assigned'
  | 'evaluation'
  | 'treatment_plan'
  | 'treatment_confirmed'
  | 'payment_confirmed'
  | 'visa_documents_submitted'
  | 'visa_processing'
  | 'travel_ready'
  | 'visa_rejected'
  | 'completed'
  | 'closed'

/** The 11-step journey shown on the dashboard and case page (terminal failure states excluded). */
export const JOURNEY: CaseStatus[] = [
  'case_submitted',
  'under_review',
  'doctor_assigned',
  'evaluation',
  'treatment_plan',
  'treatment_confirmed',
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
]

export function isInProgress(status: CaseStatus) {
  return status !== 'completed' && status !== 'closed' && status !== 'visa_rejected'
}

export function isAtOrAfter(status: CaseStatus, step: CaseStatus) {
  const order: CaseStatus[] = [...JOURNEY.slice(0, 10), 'visa_rejected', 'completed', 'closed']
  return order.indexOf(status) >= order.indexOf(step)
}

export type Tone = 'info' | 'warn' | 'orange' | 'accent' | 'good' | 'bad' | 'muted'

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  case_submitted: 'info',
  under_review: 'warn',
  doctor_assigned: 'accent',
  evaluation: 'accent',
  treatment_plan: 'orange',
  treatment_confirmed: 'good',
  payment_confirmed: 'good',
  visa_documents_submitted: 'info',
  visa_processing: 'info',
  travel_ready: 'good',
  visa_rejected: 'bad',
  completed: 'muted',
  closed: 'bad',
}

export type CaseSummary = {
  id: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  status: CaseStatus
  documentCount: number
  createdAt: string
  updatedAt: string
}

export type CaseDocument = {
  id: string
  caseId: string | null
  documentType: MedicalDocumentType
  fileName: string
  mimeType: string
  fileSizeBytes: number
  uploadedAt: string
}

export type Notification = {
  id: string
  caseId: string | null
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

export type CaseDetail = Omit<CaseSummary, 'documentCount'> & {
  description: string
  needTravelAssistance: boolean
  needStayBookingAssistance: boolean
  needTransportationAssistance: boolean
  canAddDocuments: boolean
  maxDocuments: number
  documents: CaseDocument[]
  timeline: Notification[]
}

export type Specialty = { name: string; labelEn: string; labelZh: string }

export const MEDICAL_DOCUMENT_TYPES = [
  'lab_report',
  'mri_ct',
  'xray',
  'prescription',
  'medical_history',
  'other',
] as const

export type MedicalDocumentType = (typeof MEDICAL_DOCUMENT_TYPES)[number]

export const MAX_FILES = 10
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
