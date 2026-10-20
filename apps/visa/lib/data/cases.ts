import { createClient } from '@iha/db/server'

/** For notifying the patient after a lawyer action (e.g. a document request) — not for display. */
export async function fetchPatientUserIdForCase(
  caseId: string,
): Promise<{ data: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select('patients(user_id)')
    .eq('case_id', caseId)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  const patient = (data as unknown as { patients: { user_id: string } | null } | null)?.patients
  return { data: patient?.user_id ?? null, error: null }
}

export type LawyerCaseListItem = {
  id: string
  case_id: string
  status: string
  patients: { full_name: string | null; country_of_residence: string | null } | null
  cases: { id: string; reference_number: string } | null
}

/**
 * Cases assigned to this lawyer, most recent first. RLS on visa_submissions
 * already scopes rows to assigned_lawyer_id = the caller's lawyers.id (see
 * 20260826020000_add_lawyer_case_access.sql) — the .eq() below is belt-and-
 * braces, not the actual security boundary.
 */
export async function fetchCasesForLawyer(
  lawyerId: string,
): Promise<{ data: LawyerCaseListItem[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_submissions')
    .select('id, case_id, status, patients(full_name, country_of_residence), cases(id, reference_number)')
    .eq('assigned_lawyer_id', lawyerId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as LawyerCaseListItem[], error: null }
}

export type LawyerCaseDetail = {
  submissionId: string
  status: string
  rejectionReason: string | null
  formData: Record<string, string> | null
  case: { id: string; reference_number: string; specialty: string; specialty_other: string | null } | null
  patient: {
    full_name: string | null
    avatar_url: string | null
    gender: string | null
    nationality: string | null
    date_of_birth: string | null
    country_of_residence: string | null
    phone: string | null
    address: string | null
  } | null
  // Only the logistics fields a visa lawyer needs — diagnosis, cost
  // breakdown, and other clinical/financial detail on treatment_plans stay
  // hospital/doctor-internal, per explicit product direction.
  treatmentPlan: {
    hospital: string | null
    doctor: string | null
    doctorSpecialties: string[] | null
    procedureName: string | null
    treatmentStartDate: string | null
    treatmentEndDate: string | null
  } | null
}

/**
 * Case detail for the lawyer's case-detail page. Two queries: visa_submissions
 * (embeds cases/patients via existing FKs) and the case's treatment_plans row
 * (a separate table, not reachable from visa_submissions in one PostgREST
 * embed) — mirrors how hospital-portal's case detail page composes its view
 * from more than one query rather than forcing a single mega-join.
 */
export async function fetchCaseDetailForLawyer(
  caseId: string,
): Promise<{ data: LawyerCaseDetail | null; error: string | null }> {
  const supabase = await createClient()

  const [{ data: submission, error: submissionError }, { data: plan, error: planError }] = await Promise.all([
    supabase
      .from('visa_submissions')
      .select(
        'id, status, rejection_reason, form_data, cases(id, reference_number, specialty, specialty_other), patients(full_name, avatar_url, gender, nationality, date_of_birth, country_of_residence, phone, address)',
      )
      .eq('case_id', caseId)
      .maybeSingle(),
    supabase
      .from('treatment_plans')
      .select('procedure_name, treatment_start_date, treatment_end_date, hospitals(name), doctors(full_name, specialties)')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (submissionError) return { data: null, error: submissionError.message }
  if (!submission) return { data: null, error: null }
  if (planError) return { data: null, error: planError.message }

  const raw = submission as unknown as {
    id: string
    status: string
    rejection_reason: string | null
    form_data: Record<string, string> | null
    cases: LawyerCaseDetail['case']
    patients: LawyerCaseDetail['patient']
  }
  const rawPlan = plan as unknown as {
    procedure_name: string | null
    treatment_start_date: string | null
    treatment_end_date: string | null
    hospitals: { name: string } | null
    doctors: { full_name: string; specialties: string[] | null } | null
  } | null

  return {
    data: {
      submissionId: raw.id,
      status: raw.status,
      rejectionReason: raw.rejection_reason,
      formData: raw.form_data,
      case: raw.cases,
      patient: raw.patients,
      treatmentPlan: rawPlan
        ? {
            hospital: rawPlan.hospitals?.name ?? null,
            doctor: rawPlan.doctors?.full_name ?? null,
            doctorSpecialties: rawPlan.doctors?.specialties ?? null,
            procedureName: rawPlan.procedure_name,
            treatmentStartDate: rawPlan.treatment_start_date,
            treatmentEndDate: rawPlan.treatment_end_date,
          }
        : null,
    },
    error: null,
  }
}

export type CaseNote = {
  id: string
  body: string
  createdAt: string
}

/**
 * Confidential lawyer notes for a case — RLS on visa_case_notes
 * (20260903000000) grants read access only to the assigned lawyer, never the
 * patient (and there's no admin identity model yet to grant MTA Admin access
 * to — see the migration comment). Most recent first, matching the
 * "timestamped log per case" shape the SOW asks for.
 */
export async function fetchCaseNotes(caseId: string): Promise<{ data: CaseNote[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_case_notes')
    .select('id, body, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return {
    data: (data ?? []).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at })),
    error: null,
  }
}
