import type { CaseStatus, Tone } from '../../lib/cases'

// Shapes returned by /api/doctor/** (see the doctor package's controllers).

export type DoctorStatus = 'pending' | 'approved' | 'rejected' | 'more_info_requested'

export type AvailabilityDay = {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  enabled: boolean
  start_time: string
  end_time: string
}

export type RegistrationDocument = {
  index: number
  fileName: string
  category: 'medical_license' | 'degree_certificate' | 'other'
  mimeType: string
  fileSizeBytes: number
}

export type DoctorProfile = {
  id: string
  status: DoctorStatus
  active: boolean
  rejectionReason: string | null
  moreInfoMessage: string | null
  fullName: string
  contactEmail: string | null
  contactPhone: string | null
  dateOfBirth: string | null
  gender: string | null
  specialties: string[]
  qualifications: string | null
  yearsOfExperience: number | null
  licenseNumber: string | null
  hasPhoto: boolean
  bio: string | null
  languagesSpoken: string[]
  department: string | null
  role: 'consultant' | 'surgeon' | null
  workingDays: string[]
  hospitalIds: string[]
  availability: AvailabilityDay[]
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
  registrationFeePaidAt: string | null
  annualFeeNextDueAt: string | null
  documents: RegistrationDocument[]
}

export type DoctorAccount = { registered: boolean; doctor: DoctorProfile | null }

export type HospitalChoice = {
  id: string
  name: string
  city: string
  country: string
  roomTypes: string[]
}

export type AssignmentStatus = 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled'

export type Assignment = {
  id: string
  status: AssignmentStatus
  declineReason: string | null
  invitedAt: string
  respondedAt: string | null
  evaluationStartedAt: string | null
  planSubmittedAt: string | null
  consultationSkippedReason: string | null
}

/** Where the initial Zoom consultation stands; held or skipped unlocks plan submission. */
export type InitialConsultationState =
  | 'none'
  | 'slots_proposed'
  | 'slot_selected'
  | 'scheduled'
  | 'held'
  | 'skipped'

export type PlanStatus =
  | 'draft'
  | 'submitted_to_iha'
  | 'iha_review_in_progress'
  | 'iha_approved'
  | 'rejected_by_iha'
  | 'presented_to_patient'
  | 'patient_confirmed'
  | 'not_selected'

export type CaseRow = {
  caseId: string
  referenceNumber: string
  patientName: string | null
  specialty: string
  specialtyOther: string | null
  caseStatus: CaseStatus
  caseCreatedAt: string
  assignment: Assignment
  planStatus: PlanStatus | null
  treatmentStartDate: string | null
  treatmentEndDate: string | null
  initialConsultation: InitialConsultationState | null
}

export type DocumentRequest = {
  id: string
  documentType: string
  message: string | null
  status: 'pending' | 'received'
  requestedAt: string
  receivedAt: string | null
}

export type CaseDetail = {
  caseId: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  description: string
  caseStatus: CaseStatus
  caseCreatedAt: string
  assignment: Assignment
  patient: {
    fullName: string
    dateOfBirth: string | null
    gender: string | null
    countryOfResidence: string | null
    nationality: string | null
    medicalHistory: string | null
    allergies: string[] | null
    currentMedications: string[] | null
    pastSurgeries: string | null
  } | null
  documents: {
    id: string
    documentType: string
    fileName: string
    mimeType: string
    fileSizeBytes: number
    uploadedAt: string
  }[]
  documentRequests: DocumentRequest[]
  planStatus: PlanStatus | null
  treatmentStartDate: string | null
  treatmentEndDate: string | null
  consultations: { id: string; kind: 'initial' | 'option'; status: string; requestedAt: string }[]
  initialConsultation: {
    state: InitialConsultationState
    consultationId: string | null
    skippedReason: string | null
  } | null
}

export type CostItem = { label: string; amount: number | string }

export type Specialist = {
  specialistType: string
  specialistName: string | null
  costAud: number | string
  notes: string | null
}

export type Plan = {
  caseId: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  caseStatus: CaseStatus
  evaluationStartedAt: string | null
  initialConsultation: InitialConsultationState
  planId: string | null
  status: PlanStatus | null
  submittedAt: string | null
  updatedAt: string | null
  diagnosis: string | null
  treatmentType: 'medication_only' | 'surgery' | 'therapy' | null
  procedureName: string | null
  description: string | null
  technique: string | null
  expectedOutcome: string | null
  successRate: string | null
  treatmentStartDate: string | null
  treatmentEndDate: string | null
  treatmentDurationDays: number | null
  recoveryTime: string | null
  estimatedLengthOfStay: string | null
  hospitalId: string | null
  department: string | null
  roomCategory: string | null
  specialRequirements: string | null
  doctorFeesAud: number | null
  hospitalFeesAud: number | null
  costItems: CostItem[]
  costNotes: string | null
  patientInstructions: string | null
  aftercare: string[]
  specialists: Specialist[]
  hospitals: { id: string; name: string; city: string; roomTypes: string[] }[]
}

export type ConsultationStatus =
  | 'requested'
  | 'slots_proposed'
  | 'slot_selected'
  | 'scheduled'
  | 'cancelled'

export type DoctorConsultation = {
  id: string
  kind: 'initial' | 'option'
  caseId: string
  caseReference: string | null
  patientName: string | null
  procedureName: string | null
  treatmentStartDate: string | null
  status: ConsultationStatus
  requestedAt: string
  updatedAt: string
  selectedSlotId: string | null
  zoomLink: string | null
  cancellationReason: string | null
  slots: { id: string; slotTime: string; slotEndTime: string }[]
}

export type FeePayment = {
  id: string
  feeType: 'registration' | 'annual'
  amountAud: number
  billingPeriod: string | null
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  gatewayReference: string | null
  paidAt: string | null
  createdAt: string
  /** Refunded to the card in total (after card processing fees). */
  refundedAud: number
}

export type Billing = {
  registrationFeeAud: number
  annualFeeAud: number
  registrationFeePaidAt: string | null
  annualFeeNextDueAt: string | null
  annualFeeDue: boolean
  provider: string
  publishableKey: string | null
  payments: FeePayment[]
}

// ── Labels ──────────────────────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  lab_report: 'Lab Report',
  mri_ct: 'MRI / CT Scan',
  xray: 'X-Ray',
  prescription: 'Prescription',
  medical_history: 'Medical History',
  other: 'Other',
}

export const TREATMENT_TYPE_LABELS: Record<string, string> = {
  medication_only: 'Medication Only',
  surgery: 'Surgery',
  therapy: 'Therapy',
}

export const SPECIALIST_TYPE_LABELS: Record<string, string> = {
  anaesthetist: 'Anaesthetist',
  radiologist: 'Radiologist',
  pathologist: 'Pathologist',
  rehabilitation: 'Rehabilitation',
  other: 'Other',
}

export const LANGUAGE_OPTIONS = [
  'English',
  'Mandarin (Chinese)',
  'Cantonese',
  'Hindi',
  'Arabic',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Korean',
  'Spanish',
]

export const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

export const ROLE_LABELS: Record<string, string> = { consultant: 'Consultant', surgeon: 'Surgeon' }

export const WORKING_DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
] as const

/** The live portal's wording for each case stage, from the doctor's side. */
const CASE_LABELS: Record<CaseStatus, [string, Tone]> = {
  case_submitted: ['New', 'info'],
  under_review: ['New', 'info'],
  doctor_assigned: ['Accepted', 'info'],
  evaluation: ['Evaluation', 'accent'],
  treatment_plan: ['Awaiting Patient', 'orange'],
  treatment_confirmed: ['Treatment Confirmed', 'good'],
  payment_confirmed: ['Payment Confirmed', 'good'],
  visa_documents_submitted: ['Visa Documents Submitted', 'info'],
  visa_processing: ['Visa Processing', 'warn'],
  travel_ready: ['Travel Ready', 'good'],
  visa_rejected: ['Visa Rejected', 'bad'],
  completed: ['Completed', 'muted'],
  closed: ['Case Closed', 'muted'],
}

/**
 * A doctor's own response can differ from the shared case status: declined /
 * withdrawn / closed invitations and IHA-rejected plans win, an open invite
 * always reads "New", and a submitted plan reads "Treatment Plan Submitted"
 * until admin moves the case on (old CaseRowStatusBadge).
 */
export function caseBadge(row: {
  assignment: Pick<Assignment, 'status' | 'planSubmittedAt'>
  caseStatus: CaseStatus
  planStatus: PlanStatus | null
}): [string, Tone] {
  const a = row.assignment
  if (a.status === 'declined') return ['Declined', 'bad']
  if (a.status === 'withdrawn') return ['Withdrawn', 'muted']
  if (a.status === 'cancelled') return ['Case Closed', 'muted']
  if (row.planStatus === 'rejected_by_iha') return ['Declined', 'bad']
  if (a.status === 'invited') return ['New', 'info']
  if (a.planSubmittedAt && row.caseStatus === 'evaluation')
    return ['Treatment Plan Submitted', 'orange']
  return CASE_LABELS[row.caseStatus]
}

export const CONSULTATION_LABELS: Record<string, [string, Tone]> = {
  requested: ['Awaiting Slots', 'warn'],
  slots_proposed: ['Awaiting Patient Confirmation', 'info'],
  slot_selected: ['Awaiting Payment', 'info'],
  scheduled: ['Scheduled', 'good'],
  completed: ['Completed', 'muted'],
  cancelled: ['Cancelled', 'bad'],
}

/** "Completed" isn't stored: it's a scheduled consultation whose time has passed. */
export function consultationStage(c: DoctorConsultation): string {
  if (c.status !== 'scheduled') return c.status
  const slot = c.slots.find((s) => s.id === c.selectedSlotId)
  return slot && new Date(slot.slotEndTime).getTime() < Date.now() ? 'completed' : 'scheduled'
}

export function specialtyLabel(c: { specialty: string; specialtyOther: string | null }) {
  return c.specialty === 'Other' && c.specialtyOther ? c.specialtyOther : c.specialty
}
