type Status = string

// Colors kept in sync with apps/patient/components/cases/case-status-badge.tsx
// so a case reads the same regardless of which portal shows it.
const STATUS_COLORS: Record<string, string> = {
  case_submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  doctor_assigned: 'bg-purple-100 text-purple-700',
  evaluation: 'bg-purple-100 text-purple-700',
  treatment_plan: 'bg-orange-100 text-orange-700',
  treatment_confirmed: 'bg-orange-100 text-orange-700',
  payment_confirmed: 'bg-emerald-100 text-emerald-700',
  visa_documents_submitted: 'bg-blue-100 text-blue-700',
  visa_processing: 'bg-blue-100 text-blue-700',
  travel_ready: 'bg-emerald-100 text-emerald-700',
  visa_rejected: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-600',
  closed: 'bg-red-100 text-red-700',
}

// case_submitted reads as "New" in this portal — "Case Submitted" doesn't
// make sense from the doctor's point of view (they never see pre-submission
// state). apps/patient's copy of this map keeps the original "Case Submitted".
//
// treatment_plan/treatment_confirmed both read as "Awaiting Patient" here —
// from the doctor's side, the distinction between "plan routed to patient"
// and "patient picked an option but hasn't paid yet" isn't actionable, they
// just need to know they're waiting on the patient either way. payment_confirmed
// is the point the doctor actually cares about, so it reads as "Treatment
// Confirmed" (the case is genuinely locked in once payment clears).
const STATUS_LABELS: Record<string, string> = {
  case_submitted: 'New',
  under_review: 'Under Review',
  doctor_assigned: 'Doctor Assigned',
  evaluation: 'Evaluation',
  treatment_plan: 'Awaiting Patient',
  treatment_confirmed: 'Awaiting Patient',
  payment_confirmed: 'Treatment Confirmed',
  visa_documents_submitted: 'Visa Documents Submitted',
  visa_processing: 'Visa Processing',
  travel_ready: 'Travel Ready',
  visa_rejected: 'Visa Rejected',
  completed: 'Completed',
  closed: 'Closed',
}

export function getStatusColor(status: Status): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function getStatusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status
}

export function CaseStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  )
}
