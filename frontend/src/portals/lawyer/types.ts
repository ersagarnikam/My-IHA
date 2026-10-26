// Types for the visa lawyer portal (backend lawyer/LawyerAccountController, LawyerPortalController).

export type LawyerStatus = 'pending' | 'approved' | 'rejected' | 'more_info_requested'

export type LawyerProfile = {
  id: string
  status: LawyerStatus
  approved: boolean
  rejectionReason: string | null
  moreInfoMessage: string | null
  lawyerType: 'individual' | 'law_firm'
  name: string
  abnNumber: string | null
  contactEmail: string | null
  phone: string | null
  address: string | null
  city: string | null
  zipCode: string | null
  experience: string | null
  credentialType: 'marn' | 'practising_certificate' | null
  credentialNumber: string | null
  practisingState: string | null
  credentialExpiresOn: string | null
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
  timeZone: string
  createdAt: string
  documents: {
    index: number
    fileName: string
    category: string
    mimeType: string
    fileSizeBytes: number
  }[]
}

export type LawyerAccount = { registered: boolean; lawyer: LawyerProfile | null }

export const LAWYER_TYPES: Record<string, string> = {
  individual: 'Individual lawyer / agent',
  law_firm: 'Law firm',
}

export const CREDENTIALS: Record<string, string> = {
  marn: 'Registered migration agent (MARN)',
  practising_certificate: 'Australian legal practitioner (practising certificate)',
}

export const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export const DOCUMENT_LABELS: Record<string, string> = {
  credential_certificate: 'MARN registration / practising certificate',
  indemnity_insurance: 'Professional indemnity insurance',
  other: 'Other document',
}

export type Bucket =
  | 'new'
  | 'under_review'
  | 'docs_pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'

export type CaseRow = {
  caseId: string
  referenceNumber: string | null
  patientName: string | null
  country: string | null
  status: string
  bucket: Bucket
  createdAt: string
  updatedAt: string
}

export type DocView = {
  id: string
  category: string
  label: string
  source: 'patient_upload' | 'hospital_generated' | 'lawyer_issued'
  fileName: string
  mimeType: string | null
  fileSizeBytes: number | null
  requestedByLawyer: boolean
  uploadedAt: string
}

export type CaseDetail = {
  row: CaseRow
  patient: {
    fullName: string
    dateOfBirth: string | null
    gender: string | null
    nationality: string | null
    countryOfResidence: string | null
  }
  rejectionReason: string | null
  /** The patient's visa form, snake_case keys as in the old form_data. */
  form: Record<string, string | null> | null
  documents: DocView[]
  requests: {
    id: string
    category: string
    label: string
    documentType: string
    instructions: string | null
    createdAt: string
    open: boolean
  }[]
  notes: { id: string; body: string; createdAt: string }[]
  plan: {
    hospitalName: string | null
    doctorName: string | null
    specialty: string | null
    procedureName: string | null
    treatmentStartDate: string | null
    treatmentEndDate: string | null
    estimatedLengthOfStay: string | null
  } | null
  nextStatuses: string[]
  canRequestDocuments: boolean
}

export const BUCKETS: Record<Bucket, [string, string]> = {
  new: ['New', 'badge-info'],
  under_review: ['Under Review', 'badge-warn'],
  docs_pending: ['Docs Pending', 'badge-orange'],
  in_progress: ['In Progress', 'badge-info'],
  approved: ['Approved', 'badge-good'],
  rejected: ['Rejected', 'badge-bad'],
}

/** Labels for the statuses a lawyer can move a case to. */
export const STATUS_ACTIONS: Record<string, string> = {
  under_review: 'Under Review',
  processing: 'Processing (lodged with Home Affairs)',
  approved: 'Approved',
  rejected: 'Rejected',
}

/** Patient-uploadable categories a lawyer can request. */
export const REQUESTABLE: Record<string, string> = {
  passport: 'Passport Copy',
  passport_photograph: 'Passport Size Photograph',
  bank_statement: 'Bank Statement',
  sponsorship_letter: 'Sponsorship Letter',
  employer_letter: 'Employer Letter',
  companion_passport: 'Companion Passport Copy',
  companion_proof_of_relationship: 'Proof of Relationship',
}
