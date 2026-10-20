import { CaseStatusBadge } from './case-status-badge'

// A doctor's own response to a case can diverge from the case's overall
// status (e.g. they declined, but the case itself is still `case_submitted`
// until MTA Admin re-routes it). Declined/withdrawn take priority over the
// case status so a doctor never sees "New" for a case they already turned down.
//
// Likewise, while the assignment is still `invited`, the case reads as "New"
// regardless of the underlying cases.status (case_submitted/under_review) —
// "Under Review" is patient-portal phrasing for that same pre-admin-routing
// window; a doctor who hasn't responded yet shouldn't see it as anything but
// a fresh, pending invite.
//
// "Treatment Plan Sent" is similar: it's tracked on the assignment
// (plan_submitted_at), not cases.status, since submitting to MTA Admin
// doesn't move the case itself — Admin is the one who later routes the plan
// to the patient and advances cases.status to 'treatment_plan'. So a
// doctor sees "Treatment Plan Sent" while the case is still `evaluation`,
// until Admin's own routing step replaces it with the case's real status.
//
// treatmentPlanStatus is a separate signal from cases.status entirely (see
// hospital_treatment_plan_statuses, packages/db/supabase/migrations/
// 20260730070000) — IHA rejecting a plan doesn't move cases.status at all,
// so without this override a rejected case would keep reading as whatever
// pre-rejection state it was in.
export function CaseRowStatusBadge({
  assignmentStatus,
  caseStatus,
  planSubmittedAt,
  treatmentPlanStatus,
}: {
  assignmentStatus: string
  caseStatus: string
  planSubmittedAt?: string | null
  treatmentPlanStatus?: string | null
}) {
  if (assignmentStatus === 'declined') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Declined
      </span>
    )
  }

  if (assignmentStatus === 'withdrawn') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Withdrawn
      </span>
    )
  }

  // System-closed: another doctor's plan was paid for, or this doctor never
  // responded before the case resolved elsewhere. Must take priority over
  // the `invited` -> "New" fallback below, since a cancelled invite is no
  // longer live regardless of how far along the case is.
  if (assignmentStatus === 'cancelled') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Case Closed
      </span>
    )
  }

  if (treatmentPlanStatus === 'rejected_by_iha') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        Declined
      </span>
    )
  }

  if (assignmentStatus === 'invited') {
    return <CaseStatusBadge status="case_submitted" />
  }

  if (planSubmittedAt && caseStatus === 'evaluation') {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
        Treatment Plan Sent
      </span>
    )
  }

  return <CaseStatusBadge status={caseStatus} />
}
