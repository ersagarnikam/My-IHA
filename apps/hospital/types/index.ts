export type CaseStatus =
  | 'case_submitted'
  | 'under_review'
  | 'doctor_assigned'
  | 'evaluation'
  | 'treatment_plan'
  | 'treatment_confirmed'
  | 'payment_confirmed'
  | 'visa_processing'
  | 'travel_ready'
  | 'completed'
  | 'closed'

export type AssignmentStatus = 'invited' | 'accepted' | 'declined' | 'withdrawn'

export type MessageThreadStatus = 'open' | 'closed'

export type SenderType = 'doctor' | 'hospital' | 'admin'

export type HospitalDoctorStatus = 'pending' | 'approved' | 'rejected' | 'more_info_requested'

export type AccountRole = 'hospital' | 'doctor'

export type TreatmentPlanStatus =
  | 'draft'
  | 'submitted_to_iha'
  | 'iha_review_in_progress'
  | 'iha_approved'
  | 'rejected_by_iha'
  | 'presented_to_patient'
  | 'patient_confirmed'
