import type { CaseStatus } from '../../lib/cases'

// Shapes returned by /api/admin/** (backend admin/AdminController, AdminChatController).

export type CaseRow = {
  id: string
  referenceNumber: string
  patientName: string | null
  specialty: string
  specialtyOther: string | null
  status: CaseStatus
  createdAt: string
  doctorNames: string[]
  needsDoctor: boolean
}

export type Overview = {
  pendingDoctors: number
  pendingHospitals: number
  pendingLawyers: number
  visaCasesUnassigned: number
  casesNeedingDoctor: number
  plansToReview: number
  chatsWaiting: number
  totalCases: number
  recentCases: CaseRow[]
}

export type DoctorRow = {
  id: string
  fullName: string
  email: string | null
  specialties: string[]
  status: 'pending' | 'approved' | 'rejected' | 'more_info_requested'
  createdAt: string
  registrationFeePaidAt: string | null
  active: boolean
}

export type DoctorDetail = {
  doctor: DoctorRow
  contactPhone: string | null
  qualifications: string | null
  yearsOfExperience: number | null
  licenseNumber: string | null
  bio: string | null
  languagesSpoken: string[]
  department: string | null
  role: string | null
  workingDays: string[]
  rejectionReason: string | null
  moreInfoMessage: string | null
  indemnity: {
    insurer: string
    policyNumber: string
    expiresOn: string
    coversOverseas: boolean
    telehealthGuidelinesAck: boolean
    declaredAt: string
  } | null
  indemnityStatus: 'missing' | 'expired' | 'valid'
  hospitals: string[]
  documents: {
    index: number
    fileName: string
    category: string
    mimeType: string
    fileSizeBytes: number
  }[]
}

export type Assignment = {
  id: string
  doctorId: string
  doctorName: string | null
  status: string
  declineReason: string | null
  invitedAt: string
  respondedAt: string | null
  evaluationStartedAt: string | null
  planSubmittedAt: string | null
  consultationSkippedReason: string | null
  planId: string | null
  planStatus: string | null
}

export type CaseDetail = {
  id: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  description: string
  status: CaseStatus
  createdAt: string
  patient: {
    fullName: string
    dateOfBirth: string | null
    gender: string | null
    nationality: string | null
    countryOfResidence: string | null
    phone: string | null
  } | null
  documents: {
    id: string
    documentType: string
    fileName: string
    mimeType: string
    fileSizeBytes: number
    uploadedAt: string
  }[]
  assignments: Assignment[]
}

export type Candidate = {
  id: string
  fullName: string
  specialties: string[]
  yearsOfExperience: number | null
  matchesSpecialty: boolean
}

export type PlanRow = {
  id: string
  status: string
  caseId: string
  referenceNumber: string | null
  specialty: string | null
  doctorName: string | null
  hospitalName: string | null
  procedureName: string | null
  submittedAt: string | null
  totalAud: number
}

export type PlanDetail = {
  id: string
  status: string
  rejectionReason: string | null
  submittedAt: string | null
  caseId: string
  referenceNumber: string | null
  specialty: string | null
  doctorName: string | null
  hospitalName: string | null
  hospitalCity: string | null
  diagnosis: string | null
  treatmentType: string | null
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
  department: string | null
  roomCategory: string | null
  specialRequirements: string | null
  doctorFeesAud: number | null
  hospitalFeesAud: number | null
  costItems: { label: string; amount: number }[]
  costNotes: string | null
  specialists: {
    specialistType: string
    specialistName: string | null
    costAud: number
    notes: string | null
  }[]
  patientInstructions: string | null
  aftercare: string[]
  totalAud: number
  suggestedCommissionAud: number
}

export type ThreadRow = {
  kind: 'patient' | 'provider'
  id: string
  name: string | null
  accountType: 'patient' | 'doctor' | 'hospital' | 'lawyer'
  status: 'open' | 'closed'
  unread: number
  reopenRequestedAt: string | null
  reopenReason: string | null
  lastMessage: { senderType: string; body: string; createdAt: string } | null
}

export type Thread = {
  kind: 'patient' | 'provider'
  id: string
  name: string | null
  accountType: string
  status: 'open' | 'closed'
  reopenRequestedAt: string | null
  reopenReason: string | null
  messages: { id: string; senderType: string; body: string; createdAt: string }[]
}

export const DOCTOR_STATUS: Record<string, [string, string]> = {
  pending: ['Pending review', 'badge-warn'],
  more_info_requested: ['More info requested', 'badge-orange'],
  approved: ['Approved', 'badge-good'],
  rejected: ['Rejected', 'badge-bad'],
}

export const PLAN_STATUS: Record<string, [string, string]> = {
  submitted_to_iha: ['To review', 'badge-warn'],
  iha_review_in_progress: ['In review', 'badge-warn'],
  iha_approved: ['Approved', 'badge-good'],
  presented_to_patient: ['With patient', 'badge-info'],
  patient_confirmed: ['Chosen & paid', 'badge-good'],
  not_selected: ['Not chosen', 'badge-muted'],
  rejected_by_iha: ['Declined', 'badge-bad'],
}

export const ASSIGNMENT_STATUS: Record<string, [string, string]> = {
  invited: ['Invited', 'badge-info'],
  accepted: ['Accepted', 'badge-good'],
  declined: ['Declined', 'badge-bad'],
  withdrawn: ['Withdrawn', 'badge-muted'],
  cancelled: ['Closed', 'badge-muted'],
}

export function Pill({ map, value }: { map: Record<string, [string, string]>; value: string }) {
  const [label, tone] = map[value] ?? [value, 'badge-muted']
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

// GET /api/admin/insights (backend admin/AdminInsightsService).

export type FeeStatus = 'unpaid' | 'overdue' | 'due_soon' | 'paid'

export type DoctorStats = {
  id: string
  fullName: string
  specialties: string[]
  status: DoctorRow['status']
  active: boolean
  yearsOfExperience: number | null
  activeCases: number
  pendingInvitations: number
  totalInvitations: number
  invitationAcceptancePct: number | null
  avgResponseHours: number | null
  plansSubmitted: number
  planChosenPct: number | null
  patientsTreated: number
  doctorFeesEarnedAud: number
  lastActivityAt: string | null
  feeStatus: FeeStatus
  annualFeeNextDueAt: string | null
}

export type Insights = {
  platform: {
    activeDoctors: number
    doctorsAwaitingFee: number
    patients: number
    totalCases: number
    casesInProgress: number
    casesCompleted: number
    newCasesThisMonth: number
  }
  attention: {
    pendingDoctors: number
    casesNeedingDoctor: number
    plansToReview: number
    chatsWaiting: number
  }
  money: {
    treatmentPaymentsAud: number
    consultationFeesAud: number
    mtaServiceFeesAud: number
    doctorMembershipFeesAud: number
    monthly: { month: string; patientPaymentsAud: number; doctorFeesAud: number }[]
  }
  pipeline: { key: string; label: string; count: number }[]
  doctorsByStatus: Record<string, number>
  doctors: DoctorStats[]
  specialties: { specialty: string; activeDoctors: number; openCases: number }[]
  waitingInvitations: {
    doctorId: string
    doctorName: string | null
    caseId: string
    referenceNumber: string | null
    invitedAt: string
  }[]
  feeAlerts: {
    doctorId: string
    fullName: string
    status: FeeStatus
    annualFeeNextDueAt: string | null
  }[]
  complianceAlerts: {
    providerType: 'doctor' | 'hospital'
    providerId: string
    name: string
    item: string
    label: string
    status: 'missing' | 'failed' | 'expired' | 'expiring'
    date: string | null
  }[]
  upcomingConsultations: {
    id: string
    kind: 'initial' | 'option'
    caseId: string
    referenceNumber: string | null
    patientName: string | null
    doctorName: string | null
    startsAt: string
    endsAt: string
  }[]
}

export type DoctorPerformance = {
  stats: DoctorStats
  membershipFeesPaidAud: number
  cases: {
    caseId: string
    referenceNumber: string | null
    specialty: string | null
    caseStatus: CaseStatus | null
    assignmentStatus: string
    declineReason: string | null
    planStatus: string | null
    invitedAt: string
    respondedAt: string | null
    consultationSkippedReason: string | null
  }[]
}

export const FEE_STATUS: Record<FeeStatus, [string, string]> = {
  paid: ['Paid', 'badge-good'],
  due_soon: ['Due soon', 'badge-warn'],
  overdue: ['Overdue', 'badge-bad'],
  unpaid: ['Registration fee unpaid', 'badge-orange'],
}

/** "3.5 h", "2 d" — average time to answer an invitation. */
export function responseTime(hours: number | null) {
  if (hours === null) return '—'
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

export function pct(value: number | null) {
  return value === null ? '—' : `${value}%`
}

// GET /api/admin/settings/fees (backend fees/FeeSettingsService, admin/AdminSettingsController).

export type FeeSetting = {
  key: string
  group: 'doctors' | 'lawyers' | 'hospitals' | 'patients'
  label: string
  description: string
  unit: 'aud' | 'percent'
  charged: boolean
  amount: number
  updatedAt: string
  updatedBy: string | null
}

export type FeeSettings = {
  fees: FeeSetting[]
  history: {
    id: string
    key: string
    oldAmount: number | null
    newAmount: number
    reason: string | null
    changedBy: string | null
    changedAt: string
  }[]
}

// /api/admin/payments (backend admin/AdminPaymentController, refund/RefundService).

export type AdminPayment = {
  kind: 'patient' | 'doctor'
  id: string
  type: 'treatment' | 'consultation' | 'registration' | 'annual'
  payerName: string | null
  payerId: string
  caseId: string | null
  caseReference: string | null
  amountAud: number
  status: 'completed' | 'refunded' | 'failed' | 'pending'
  gateway: string
  gatewayReference: string | null
  paidAt: string
  /** Refunded so far before card fees; refundedToCardAud after them. */
  refundedAud: number
  refundedToCardAud: number
  refundCount: number
}

export type RefundQuote = {
  amountAud: number
  refundedAud: number
  refundedToCardAud: number
  refundableAud: number
  feeAud: number
  feeSource: 'stripe' | 'estimate'
  feeDeductedAud: number
  feeRemainingAud: number
}

export type AdminRefund = {
  id: string
  amountAud: number
  feeDeductedAud: number
  refundedAud: number
  feeSource: 'stripe' | 'estimate' | 'waived' | 'none'
  reason: string
  note: string | null
  status: 'pending' | 'succeeded' | 'failed'
  gatewayRefundId: string | null
  createdBy: string | null
  createdAt: string
}

export type AdminPaymentDetail = {
  payment: AdminPayment
  quote: RefundQuote
  refunds: AdminRefund[]
  reasons: Record<string, string>
  /** Reasons for which the card fee is deducted (the payer's side); for the rest MTA absorbs it. */
  feeKeptReasons: string[]
}

export const PAYMENT_TYPE: Record<AdminPayment['type'], string> = {
  treatment: 'Treatment',
  consultation: 'Consultation fee',
  registration: 'Doctor registration fee',
  annual: 'Doctor annual fee',
}

/** completed with a refund shows as partly refunded. */
export function paymentStatus(p: Pick<AdminPayment, 'status' | 'refundedAud'>): [string, string] {
  if (p.status === 'refunded') return ['Refunded', 'badge-muted']
  if (p.status === 'completed' && p.refundedAud > 0) return ['Partly refunded', 'badge-warn']
  if (p.status === 'completed') return ['Paid', 'badge-good']
  return [p.status, 'badge-muted']
}
