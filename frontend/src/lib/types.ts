// API response shapes beyond cases (see the matching Spring controllers).

import type { CaseStatus } from './cases'

export type Profile = {
  id: string
  email: string
  fullName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  countryOfResidence: string | null
  phone: string | null
  address: string | null
  medicalHistory: string | null
  allergies: string[]
  currentMedications: string[]
  pastSurgeries: string | null
  emergencyContactName: string | null
  emergencyContactRelationship: string | null
  emergencyContactPhone: string | null
  hasAvatar: boolean
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
  profileComplete: boolean
  createdAt: string
}

export type CostItem = {
  label: string
  amount: number
  labelKey?: 'doctor_fees' | 'hospital_fees' | 'iha_service_fee'
}

export type TreatmentOption = {
  id: string
  caseId: string
  treatmentPlanId: string
  treatmentSummary: string
  costBreakdown: { items: CostItem[]; total: number }
  diagnosis: string | null
  treatmentType: string | null
  procedureName: string | null
  description: string | null
  expectedOutcome: string | null
  technique: string | null
  successRate: string | null
  treatmentStartDate: string | null
  treatmentEndDate: string | null
  treatmentDurationDays: number | null
  recoveryTime: string | null
  hospitalStay: string | null
  department: string | null
  roomCategory: string | null
  specialRequirements: string | null
  patientInstructions: string | null
  costNotes: string | null
  specialists: {
    specialistType: string
    specialistName: string | null
    costAud: number
    notes: string | null
  }[]
  aftercare: string[]
  selected: boolean
  publishedAt: string
  createdAt: string
  hospital: {
    name: string
    city: string
    country: string
    bedCount: number | null
    specialties: string[]
  } | null
  doctor: {
    fullName: string
    specialties: string[]
    qualifications: string | null
    photoUrl: string | null
    yearsExperience: number | null
  } | null
}

export type ConsultationStatus =
  | 'requested'
  | 'slots_proposed'
  | 'slot_selected'
  | 'scheduled'
  | 'cancelled'

export type Consultation = {
  id: string
  caseId: string
  /** initial: the doctor's consultation before the plan; option: about a published treatment option. */
  kind: 'initial' | 'option'
  doctorName: string | null
  treatmentOptionId: string | null
  status: ConsultationStatus
  zoomLink: string | null
  selectedSlotId: string | null
  cancellationReason: string | null
  requestedAt: string
  updatedAt: string
  feeAud: number
  slots: { id: string; slotTime: string; slotEndTime: string }[]
}

export type Checkout = {
  provider: 'stripe' | 'fake'
  publishableKey: string | null
  paymentId: string
  intentId: string
  clientSecret: string
  customerSessionClientSecret: string | null
  amountAud: number
  defaultPaymentMethodId: string | null
}

export type PaymentRow = {
  id: string
  caseId: string
  caseReference: string | null
  paymentType: 'full_payment' | 'consultation_fee'
  consultationRequestId: string | null
  amountAud: number
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  gatewayReference: string | null
  paidAt: string | null
  createdAt: string
}

export type SavedCard = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
  createdAt: string
}

export type DocumentRow = {
  id: string
  category: 'medical' | 'visa'
  type: string
  source: 'patient_upload' | 'hospital_generated' | 'lawyer_issued'
  fileName: string
  mimeType: string | null
  fileSizeBytes: number | null
  caseId: string | null
  caseReference: string | null
  caseSpecialty: string | null
  caseStatus: CaseStatus | null
  uploadedAt: string
}

export type VisaDocument = {
  id: string
  caseId: string | null
  category: string
  source: DocumentRow['source']
  fileName: string
  mimeType: string | null
  fileSizeBytes: number | null
  requestedByLawyer: boolean
  reviewStatus: string | null
  sentToPatientAt: string | null
  uploadedAt: string
}

export type VisaRequest = {
  id: string
  category: string
  instructions: string | null
  createdAt: string
}

export type VisaSubmissionSummary = {
  id: string
  caseId: string
  caseReference: string | null
  specialty: string | null
  specialtyOther: string | null
  caseStatus: CaseStatus | null
  status: string
  rejectionReason: string | null
  formSubmitted: boolean
  createdAt: string
  updatedAt: string
}

export type VisaFormData = Record<string, string | undefined>

export type CaseVisa = {
  caseId: string
  referenceNumber: string
  caseStatus: CaseStatus
  visaPageOpen: boolean
  lettersReady: boolean
  canStart: boolean
  submission: VisaSubmissionSummary | null
  form: VisaFormData | null
  documents: VisaDocument[]
  openRequests: VisaRequest[]
}

export type ChatMessage = {
  id: string
  senderType: 'patient' | 'admin'
  body: string
  read: boolean
  createdAt: string
}

export type ChatThread = {
  id: string
  status: 'open' | 'closed'
  openedAt: string | null
  closedAt: string | null
  reopenRequestedAt: string | null
  unread: number
  messages: ChatMessage[]
}

export type DashboardCase = {
  id: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  status: CaseStatus
  documentCount: number
  latestPaymentStatus: PaymentRow['status'] | null
  latestPaymentAmountAud: number | null
  visaStatus: string | null
  createdAt: string
  updatedAt: string
}

export type Dashboard = {
  fullName: string
  profileComplete: boolean
  activeCases: DashboardCase[]
  recentCases: DashboardCase[]
  totalCases: number
}
