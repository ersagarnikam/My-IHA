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
  hospitals: string[]
  documents: { index: number; fileName: string; category: string; mimeType: string; fileSizeBytes: number }[]
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
  documents: { id: string; documentType: string; fileName: string; mimeType: string; fileSizeBytes: number; uploadedAt: string }[]
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
  specialists: { specialistType: string; specialistName: string | null; costAud: number; notes: string | null }[]
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
