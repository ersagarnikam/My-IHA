import { createClient } from '@iha/db/server'
import { fetchTreatmentPlanStatusesForHospital } from '@iha/db/treatment-plans'
import { createLogger } from '@iha/logger'
import { fetchAffiliatedDoctorIds } from './doctor-management'

const logger = createLogger('hospital:data:patient-management')

export type HospitalPatientRow = {
  id: string
  fullName: string
  dateOfBirth: string | null
  gender: string | null
  countryOfResidence: string | null
  phone: string | null
  avatarUrl: string | null
  caseCount: number
  latestCaseId: string | null
  latestCaseReferenceNumber: string | null
  latestCaseStatus: string | null
}

type AssignmentCaseRow = {
  case_id: string
  cases: {
    id: string
    patient_id: string
    reference_number: string
    status: string
    created_at: string
  } | null
}

/** Patients with at least one case assigned to a doctor affiliated with this
 * hospital — one row per patient, with a case count and their most recent case. */
export async function fetchPatientsForHospitalDoctors(
  hospitalId: string,
): Promise<{ data: HospitalPatientRow[]; error: string | null }> {
  const doctorIds = await fetchAffiliatedDoctorIds(hospitalId)
  if (doctorIds.length === 0) return { data: [], error: null }

  const supabase = await createClient()
  const { data: assignments, error } = await supabase
    .from('doctor_case_assignments')
    .select('case_id, cases(id, patient_id, reference_number, status, created_at)')
    .in('doctor_id', doctorIds)

  if (error) {
    logger.error({ err: error, hospitalId }, 'fetchPatientsForHospitalDoctors assignments query failed')
    return { data: [], error: error.message }
  }

  const rows = (assignments ?? []) as unknown as AssignmentCaseRow[]

  const byPatient = new Map<string, { caseIds: Set<string>; latest: NonNullable<AssignmentCaseRow['cases']> }>()
  for (const row of rows) {
    if (!row.cases) continue
    const existing = byPatient.get(row.cases.patient_id)
    if (!existing) {
      byPatient.set(row.cases.patient_id, { caseIds: new Set([row.cases.id]), latest: row.cases })
      continue
    }
    existing.caseIds.add(row.cases.id)
    if (new Date(row.cases.created_at) > new Date(existing.latest.created_at)) {
      existing.latest = row.cases
    }
  }

  const patientIds = [...byPatient.keys()]
  if (patientIds.length === 0) return { data: [], error: null }

  const { data: patients, error: patientsError } = await supabase
    .from('patients')
    .select('id, full_name, date_of_birth, gender, country_of_residence, phone, avatar_url')
    .in('id', patientIds)

  if (patientsError) {
    logger.error({ err: patientsError, hospitalId }, 'fetchPatientsForHospitalDoctors patients query failed')
    return { data: [], error: patientsError.message }
  }

  const result: HospitalPatientRow[] = (patients ?? [])
    .map((p) => {
      const entry = byPatient.get(p.id)!
      return {
        id: p.id,
        fullName: p.full_name ?? '',
        dateOfBirth: p.date_of_birth,
        gender: p.gender,
        countryOfResidence: p.country_of_residence,
        phone: p.phone,
        avatarUrl: p.avatar_url,
        caseCount: entry.caseIds.size,
        latestCaseId: entry.latest.id,
        latestCaseReferenceNumber: entry.latest.reference_number,
        latestCaseStatus: entry.latest.status,
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))

  return { data: result, error: null }
}

export type HospitalPatientDetail = {
  id: string
  fullName: string
  dateOfBirth: string | null
  gender: string | null
  countryOfResidence: string | null
  avatarUrl: string | null
  medicalHistory: string | null
  allergies: string[]
  currentMedications: string[]
  pastSurgeries: string | null
}

/** Relies on the hospital-scoped RLS on `patients` (see 20260730060000) —
 * only resolves if this patient has a case with a submitted treatment plan
 * naming this hospital. No contact details (phone, address, emergency
 * contact) are selected here — a hospital sees clinical info only. */
export async function fetchPatientDetailForHospital(
  patientId: string,
): Promise<{ data: HospitalPatientDetail | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .select(
      'id, full_name, date_of_birth, gender, country_of_residence, avatar_url, medical_history, allergies, current_medications, past_surgeries',
    )
    .eq('id', patientId)
    .maybeSingle()

  if (error) {
    // SENSITIVE: `error` is a DB error message only, never medical_history/allergies/etc.
    logger.error({ err: error, patientId }, 'fetchPatientDetailForHospital failed')
  }
  if (!data) return { data: null, error: error?.message ?? null }

  return {
    data: {
      id: data.id,
      fullName: data.full_name ?? '',
      dateOfBirth: data.date_of_birth,
      gender: data.gender,
      countryOfResidence: data.country_of_residence,
      allergies: data.allergies ?? [],
      currentMedications: data.current_medications ?? [],
      pastSurgeries: data.past_surgeries,
      avatarUrl: data.avatar_url,
      medicalHistory: data.medical_history,
    },
    error: null,
  }
}

export type HospitalPatientCaseRow = {
  id: string
  referenceNumber: string
  specialty: string
  specialtyOther: string | null
  status: string
  doctorName: string | null
}

type PatientCaseWithAssignments = {
  id: string
  reference_number: string
  specialty: string
  specialty_other: string | null
  status: string
  doctor_case_assignments: { doctor_id: string; doctors: { full_name: string } | null }[] | null
}

/** Cases for this patient visible to the hospital — same RLS scoping as
 * `patients` above, applied per-case rather than assuming every case for a
 * visible patient is itself visible.
 *
 * A case can be routed to two of this hospital's own doctors in parallel
 * (one plan later confirmed, the other closed out), so the embedded
 * doctor_case_assignments array can have more than one row — PostgREST
 * doesn't guarantee its order, so picking `[0]` risked showing whichever
 * doctor's name happened to sort first, possibly the closed-out one. This
 * prefers the doctor whose plan is 'patient_confirmed' (same rule the case
 * detail page uses), falling back to the first row when none is confirmed
 * yet. */
export async function fetchCasesForHospitalPatient(
  patientId: string,
  hospitalId: string,
): Promise<{ data: HospitalPatientCaseRow[]; error: string | null }> {
  const supabase = await createClient()
  const [{ data, error }, { data: planStatuses }] = await Promise.all([
    supabase
      .from('cases')
      .select(
        'id, reference_number, specialty, specialty_other, status, doctor_case_assignments(doctor_id, doctors(full_name))',
      )
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
    fetchTreatmentPlanStatusesForHospital(hospitalId),
  ])

  if (error) {
    logger.error({ err: error, patientId }, 'fetchCasesForHospitalPatient failed')
    return { data: [], error: error.message }
  }

  const rows = (data ?? []) as unknown as PatientCaseWithAssignments[]
  const confirmedDoctorByCaseId = new Map(
    planStatuses.filter((p) => p.status === 'patient_confirmed').map((p) => [p.case_id, p.doctor_id]),
  )

  return {
    data: rows.map((r) => {
      const assignments = r.doctor_case_assignments ?? []
      const confirmedDoctorId = confirmedDoctorByCaseId.get(r.id)
      const picked = (confirmedDoctorId && assignments.find((a) => a.doctor_id === confirmedDoctorId)) || assignments[0]
      return {
        id: r.id,
        referenceNumber: r.reference_number,
        specialty: r.specialty,
        specialtyOther: r.specialty_other,
        status: r.status,
        doctorName: picked?.doctors?.full_name ?? null,
      }
    }),
    error: null,
  }
}
