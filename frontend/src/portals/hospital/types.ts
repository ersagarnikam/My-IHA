import type { CaseStatus } from '../../lib/cases'

// Shapes returned by /api/hospital/** (backend hospital/HospitalAccountController, HospitalPortalController).

export type HospitalStatus = 'pending' | 'approved' | 'rejected' | 'more_info_requested'

export type HospitalDocument = {
  index: number
  fileName: string
  category: string
  mimeType: string
  fileSizeBytes: number
}

export type HospitalProfile = {
  id: string
  status: HospitalStatus
  approved: boolean
  rejectionReason: string | null
  moreInfoMessage: string | null
  name: string
  registrationNumber: string | null
  abnNumber: string | null
  phone: string | null
  contactEmail: string | null
  country: string
  city: string
  address: string | null
  zipCode: string | null
  registrationType: string | null
  specialties: string[]
  bedCount: number | null
  roomTypes: string[]
  licenseNumber: string | null
  accreditationBody: string | null
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
  timeZone: string
  createdAt: string
  documents: HospitalDocument[]
}

export type HospitalAccount = { registered: boolean; hospital: HospitalProfile | null }

/** One case as it reaches the hospital through one doctor's treatment plan (keyed by plan id). */
export type CaseRow = {
  planId: string
  caseId: string
  referenceNumber: string
  condition: string
  caseStatus: CaseStatus
  planStatus: string
  patientId: string
  patientName: string | null
  doctorId: string
  doctorName: string | null
  procedure: string | null
  admissionDate: string | null
  submittedAt: string | null
  caseCreatedAt: string
  chosen: boolean
  lettersEligible: boolean
  lettersGenerated: number
  lettersSent: number
}

export type Dashboard = {
  doctors: number
  patients: number
  cases: number
  confirmedTreatments: number
  treated: number
  lettersToIssue: number
  upcomingAdmissions: CaseRow[]
  recentCases: CaseRow[]
}

export type PatientInfo = {
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  countryOfResidence: string | null
  medicalHistory: string | null
  allergies: string[] | null
  currentMedications: string[] | null
  pastSurgeries: string | null
}

export type PatientRow = {
  id: string
  fullName: string | null
  dateOfBirth: string | null
  gender: string | null
  country: string | null
  caseCount: number
  latestPlanId: string
  latestReference: string
}

export type PatientDetail = { id: string; fullName: string; info: PatientInfo; cases: CaseRow[] }

export type DoctorRow = {
  id: string
  fullName: string
  specialties: string[]
  department: string | null
  role: string | null
  email: string | null
  phone: string | null
  yearsOfExperience: number | null
  status: string
  cases: number
}

export type DoctorDetail = {
  id: string
  fullName: string
  status: string
  gender: string | null
  email: string | null
  phone: string | null
  specialties: string[]
  qualifications: string | null
  yearsOfExperience: number | null
  licenseNumber: string | null
  department: string | null
  role: string | null
  languages: string[]
  bio: string | null
  hospitals: string[]
  availability: { day: string; enabled: boolean; start_time: string; end_time: string }[]
  totalCases: number
  activeCases: number
  completedCases: number
  cases: CaseRow[]
}

export type LetterType = 'hospital_invitation' | 'appointment_confirmation'

export type Letter = {
  type: LetterType
  label: string
  fileName: string | null
  generatedAt: string | null
  sentAt: string | null
}

export type PlanSummary = {
  diagnosis: string | null
  treatmentType: string | null
  procedure: string | null
  technique: string | null
  description: string | null
  expectedOutcome: string | null
  startDate: string | null
  endDate: string | null
  durationDays: number | null
  lengthOfStay: string | null
  recoveryTime: string | null
  department: string | null
  roomCategory: string | null
  specialRequirements: string | null
  doctorFeesAud: number | null
  hospitalFeesAud: number | null
  costItems: { label: string; amount: number | null }[]
  totalAud: number
  submittedAt: string | null
}

export type CaseDetail = {
  row: CaseRow
  description: string
  patient: PatientInfo
  doctor: {
    id: string
    fullName: string
    specialties: string[]
    email: string | null
    phone: string | null
  } | null
  assignmentStatus: string | null
  plan: PlanSummary
  letters: Letter[]
}

export const LETTER_TYPES: { type: LetterType; label: string }[] = [
  { type: 'hospital_invitation', label: 'Hospital Invitation Letter' },
  { type: 'appointment_confirmation', label: 'Appointment Confirmation Letter' },
]

export const HOSPITAL_TYPES: Record<string, string> = {
  multi_specialty: 'Multi-specialty',
  single_specialty: 'Single specialty',
}

/** The hospital's view of a case: plan status first, then where the case is. */
export function hospitalCaseStatus(
  r: Pick<CaseRow, 'planStatus' | 'caseStatus' | 'chosen'>,
): [string, string] {
  if (r.planStatus === 'rejected_by_iha') return ['Declined by MTA', 'badge-bad']
  if (r.planStatus === 'not_selected') return ['Patient chose another plan', 'badge-muted']
  if (r.caseStatus === 'visa_rejected') return ['Visa refused', 'badge-bad']
  if (r.caseStatus === 'closed') return ['Closed', 'badge-muted']
  if (r.chosen && r.caseStatus === 'completed') return ['Treated', 'badge-good']
  if (r.chosen) return ['Treatment confirmed', 'badge-good']
  if (r.planStatus === 'presented_to_patient') return ['With patient', 'badge-info']
  return ['With MTA for review', 'badge-warn']
}

/** Tabs on the case list (old hospital case management). */
export type CaseTab = 'all' | 'awaiting' | 'confirmed' | 'completed' | 'declined'

export function caseTab(r: CaseRow): Exclude<CaseTab, 'all'> {
  if (
    r.planStatus === 'rejected_by_iha' ||
    r.planStatus === 'not_selected' ||
    r.caseStatus === 'visa_rejected' ||
    r.caseStatus === 'closed'
  )
    return 'declined'
  if (r.chosen && r.caseStatus === 'completed') return 'completed'
  if (r.chosen) return 'confirmed'
  return 'awaiting'
}
