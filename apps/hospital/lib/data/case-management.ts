import { createClient } from '@iha/db/server'
import type { AssignmentWithCase } from '@iha/db/case-assignments'
import { fetchTreatmentPlanStatusesForHospital, type TreatmentPlanStatus } from '@iha/db/treatment-plans'
import { createLogger } from '@iha/logger'
import { fetchAffiliatedDoctorIds } from './doctor-management'

const logger = createLogger('hospital:data:case-management')

export type AssignmentWithCaseAndDoctor = AssignmentWithCase & {
  doctors: { full_name: string } | null
  treatmentPlanStatus: TreatmentPlanStatus | null
}

// Case statuses from which visa documents (hospital invitation / appointment
// confirmation) become relevant — mirrors the patient app's equivalent list
// (apps/patient/app/(dashboard)/cases/[caseId]/page.tsx VISA_STATUSES).
export const VISA_ELIGIBLE_STATUSES = [
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
]

export type VisaEligibleCase = {
  caseId: string
  assignmentId: string
  referenceNumber: string
  patientName: string
  specialty: string
  specialtyOther: string | null
  status: string
}

const ASSIGNMENT_WITH_CASE_AND_DOCTOR_SELECT =
  '*, cases(id, reference_number, specialty, specialty_other, status, created_at, patients(full_name)), doctors(full_name)'

/** Case assignments across every doctor affiliated with this hospital — the
 * hospital-scoped equivalent of fetchAssignmentsForDoctor. Each row is
 * annotated with its treatment plan's status (null if none/still draft) so
 * callers can bucket a "Declined" (IHA-rejected) case even though
 * cases.status itself never reflects that. */
export async function fetchAssignmentsForHospitalDoctors(
  hospitalId: string,
): Promise<{ data: AssignmentWithCaseAndDoctor[]; error: string | null }> {
  const doctorIds = await fetchAffiliatedDoctorIds(hospitalId)
  if (doctorIds.length === 0) return { data: [], error: null }

  const supabase = await createClient()
  const [{ data, error }, { data: planStatuses }] = await Promise.all([
    supabase
      .from('doctor_case_assignments')
      .select(ASSIGNMENT_WITH_CASE_AND_DOCTOR_SELECT)
      .in('doctor_id', doctorIds)
      .order('invited_at', { ascending: false }),
    fetchTreatmentPlanStatusesForHospital(hospitalId),
  ])

  if (error) {
    logger.error({ err: error, hospitalId }, 'fetchAssignmentsForHospitalDoctors failed')
  }

  const assignments = (data as unknown as AssignmentWithCaseAndDoctor[] | null) ?? []
  const statusByAssignment = new Map(planStatuses.map((p) => [`${p.case_id}:${p.doctor_id}`, p.status]))

  return {
    data: assignments.map((a) => ({
      ...a,
      treatmentPlanStatus: statusByAssignment.get(`${a.case_id}:${a.doctor_id}`) ?? null,
    })),
    error: error?.message ?? null,
  }
}

/** A single case's assignment for the Case Details view — relies on the
 * hospital-scoped RLS on `doctor_case_assignments` (see 20260730060000) to
 * restrict this to cases where an affiliated doctor's treatment plan named
 * this hospital; no doctorIds/hospitalId filter needed here.
 *
 * A case can be routed to two of this hospital's own doctors in parallel
 * (one plan later confirmed, the other closed out) — entry points that only
 * know the case (notifications, dashboard shortcuts) can't say which one
 * they mean, so this picks the assignment whose treatment plan is
 * 'patient_confirmed' when one exists, rather than an arbitrary one.
 * Otherwise (neither doctor's plan confirmed yet) falls back to the most
 * recently invited assignment, same as before. The case detail page uses
 * this only as a fallback — see fetchHospitalAssignmentById. */
export async function fetchAssignmentForHospitalCase(
  caseId: string,
): Promise<{ data: AssignmentWithCaseAndDoctor | null; error: string | null }> {
  const supabase = await createClient()
  const [{ data, error }, { data: confirmedPlan }] = await Promise.all([
    supabase
      .from('doctor_case_assignments')
      .select(ASSIGNMENT_WITH_CASE_AND_DOCTOR_SELECT)
      .eq('case_id', caseId)
      .order('invited_at', { ascending: false }),
    supabase
      .from('treatment_plans')
      .select('doctor_id')
      .eq('case_id', caseId)
      .eq('status', 'patient_confirmed')
      .maybeSingle(),
  ])

  if (error) {
    logger.error({ err: error, caseId }, 'fetchAssignmentForHospitalCase failed')
  }

  const assignments = (data as unknown as AssignmentWithCaseAndDoctor[] | null) ?? []
  const confirmedDoctorId = (confirmedPlan as { doctor_id: string } | null)?.doctor_id
  const picked = (confirmedDoctorId && assignments.find((a) => a.doctor_id === confirmedDoctorId)) || assignments[0]

  return { data: picked ?? null, error: error?.message ?? null }
}

/** A single assignment row by id, for the Case Details view. The list page's
 * "View" link passes ?assignmentId= alongside the case id specifically so
 * the detail page can show exactly the row that was clicked (see
 * fetchAssignmentForHospitalCase's docstring for why the case id alone is
 * ambiguous when this hospital has two doctors on the same case). */
export async function fetchHospitalAssignmentById(
  assignmentId: string,
): Promise<{ data: AssignmentWithCaseAndDoctor | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctor_case_assignments')
    .select(ASSIGNMENT_WITH_CASE_AND_DOCTOR_SELECT)
    .eq('id', assignmentId)
    .maybeSingle()

  if (error) {
    logger.error({ err: error, assignmentId }, 'fetchHospitalAssignmentById failed')
  }

  return { data: (data as unknown as AssignmentWithCaseAndDoctor | null) ?? null, error: error?.message ?? null }
}

/** Cases this hospital can attach visa documents to (Documents page) — one
 * row per case (a case reassigned across doctors can otherwise appear once
 * per assignment), filtered to VISA_ELIGIBLE_STATUSES and to the treatment
 * plan the patient actually confirmed (payment). A hospital that competed
 * for a case but wasn't the one selected no longer has a live plan here —
 * see 20260825130000_restrict_hospital_visa_documents_to_confirmed_plan. */
export async function fetchVisaEligibleCasesForHospital(
  hospitalId: string,
): Promise<{ data: VisaEligibleCase[]; error: string | null }> {
  const { data: assignments, error } = await fetchAssignmentsForHospitalDoctors(hospitalId)
  if (error) return { data: [], error }

  const byCaseId = new Map<string, VisaEligibleCase>()
  for (const a of assignments) {
    const c = a.cases
    if (!c || !VISA_ELIGIBLE_STATUSES.includes(c.status) || a.treatmentPlanStatus !== 'patient_confirmed' || byCaseId.has(c.id)) continue
    byCaseId.set(c.id, {
      caseId: c.id,
      assignmentId: a.id,
      referenceNumber: c.reference_number,
      patientName: c.patients?.full_name ?? '—',
      specialty: c.specialty,
      specialtyOther: c.specialty_other,
      status: c.status,
    })
  }

  return { data: Array.from(byCaseId.values()), error: null }
}
