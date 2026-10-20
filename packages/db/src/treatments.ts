import { createClient } from './server'
import type { TreatmentType } from '@iha/validations'
import type { Json } from '../types'

export type CostItem = { label: string; amount: number; labelKey?: 'doctor_fees' | 'hospital_fees' | 'iha_service_fee' }

export type CostBreakdown = {
  items: CostItem[]
  total: number
}

export type TreatmentPlanSpecialistSummary = {
  specialist_type: string
  specialist_name: string | null
  cost_aud: number
  notes: string | null
}

export type TreatmentOptionWithDetails = {
  id: string
  case_id: string
  hospital_id: string
  doctor_id: string
  treatment_plan_id: string
  treatment_summary: string
  cost_breakdown: CostBreakdown
  diagnosis: string | null
  treatment_type: TreatmentType | null
  recommended_treatment: string | null
  procedure_name: string | null
  description: string | null
  expected_outcome: string | null
  technique: string | null
  success_rate: string | null
  treatment_start_date: string | null
  treatment_end_date: string | null
  treatment_duration: string | null
  recovery_time: string | null
  hospital_stay: string | null
  department: string | null
  room_category: string | null
  special_requirements: string | null
  patient_instructions: string | null
  cost_notes: string | null
  specialists: TreatmentPlanSpecialistSummary[]
  aftercare: string[] | null
  is_selected: boolean
  published_at: string
  created_at: string
  hospitals: {
    name: string
    city: string
    country: string
    bed_count: number | null
    specialties: string[] | null
  }
  doctors: {
    full_name: string
    specialties: string[] | null
    qualifications: string | null
    photo_url: string | null
    years_experience: number | null
  }
}

export type TreatmentOptionWithCaseInfo = TreatmentOptionWithDetails & {
  cases: {
    reference_number: string
    specialty: string
    specialty_other: string | null
  }
}

export type TreatmentOptionWithPatientInfo = TreatmentOptionWithDetails & {
  cases: {
    reference_number: string
    specialty: string
    specialty_other: string | null
    patients: { full_name: string } | null
  }
}

// treatment_options no longer stores clinical/cost detail directly — it
// references treatment_plans (packages/db/supabase/migrations/
// 20260722000000_create_treatment_plans_tables.sql) as the single source of
// truth and only adds mta_commission_aud + publish/selection state on top.
// treatment_plans isn't in the generated Supabase types yet either, so this
// join is read through the same manually-typed bypass used in
// treatment-plans.ts/case-assignments.ts.
type RawTreatmentPlanJoin = {
  // treatment_plans.hospital_id is nullable at the column level (a draft can
  // lack one), but submit_treatment_plan() requires it before a plan can
  // leave draft — and only a submitted, approved plan ever gets a priced
  // treatment_options row — so it's always set by the time this join runs.
  hospital_id: string
  doctor_id: string
  diagnosis: string | null
  treatment_type: TreatmentType | null
  procedure_name: string | null
  description: string | null
  technique: string | null
  expected_outcome: string | null
  success_rate: string | null
  treatment_start_date: string | null
  treatment_end_date: string | null
  recovery_time: string | null
  estimated_length_of_stay: string | null
  treatment_duration_days: number | null
  department: string | null
  room_category: string | null
  doctor_fees_aud: number | null
  hospital_fees_aud: number | null
  cost_breakdown: Json
  cost_notes: string | null
  patient_instructions: string | null
  special_requirements: string | null
  aftercare: string[]
  hospitals: TreatmentOptionWithDetails['hospitals']
  doctors: TreatmentOptionWithDetails['doctors']
  treatment_plan_specialists: Array<{
    specialist_type: string
    specialist_name: string | null
    cost_aud: number
    notes: string | null
  }>
}

type RawTreatmentOptionRow = {
  id: string
  case_id: string
  treatment_plan_id: string
  mta_commission_aud: number
  is_selected: boolean
  published_at: string
  created_at: string
  treatment_plans: RawTreatmentPlanJoin
}

const TREATMENT_SELECT = `
  id, case_id, treatment_plan_id, mta_commission_aud, is_selected, published_at, created_at,
  treatment_plans!inner(
    hospital_id, doctor_id, diagnosis, treatment_type, procedure_name, description,
    technique, expected_outcome, success_rate,
    treatment_start_date, treatment_end_date,
    recovery_time, estimated_length_of_stay, treatment_duration_days,
    department, room_category,
    doctor_fees_aud, hospital_fees_aud, cost_breakdown, cost_notes,
    patient_instructions, special_requirements, aftercare,
    hospitals(name, city, country, bed_count, specialties),
    doctors(full_name, specialties, qualifications, photo_url, years_experience),
    treatment_plan_specialists(specialist_type, specialist_name, cost_aud, notes)
  )
`.trim()

function parseCostItems(raw: Json): CostItem[] {
  const obj = (raw ?? {}) as Record<string, unknown>
  return Array.isArray(obj.items) ? (obj.items as CostItem[]) : []
}

function buildCostBreakdown(tp: RawTreatmentPlanJoin, mtaCommissionAud: number): CostBreakdown {
  const items: CostItem[] = []
  if (tp.doctor_fees_aud) items.push({ label: 'Doctor Fees', labelKey: 'doctor_fees', amount: tp.doctor_fees_aud })
  if (tp.hospital_fees_aud) items.push({ label: 'Hospital Fees', labelKey: 'hospital_fees', amount: tp.hospital_fees_aud })
  items.push(...parseCostItems(tp.cost_breakdown))
  for (const s of tp.treatment_plan_specialists ?? []) {
    const label = s.specialist_name ? `${s.specialist_type} (${s.specialist_name})` : s.specialist_type
    items.push({ label, amount: s.cost_aud })
  }
  if (mtaCommissionAud) items.push({ label: 'IHA Service Fee', labelKey: 'iha_service_fee', amount: mtaCommissionAud })

  return { items, total: items.reduce((sum, item) => sum + item.amount, 0) }
}

function formatDurationDays(days: number | null): string | null {
  if (days === null) return null
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

function flattenTreatmentOption(row: RawTreatmentOptionRow): TreatmentOptionWithDetails {
  const tp = row.treatment_plans

  return {
    id: row.id,
    case_id: row.case_id,
    hospital_id: tp.hospital_id,
    doctor_id: tp.doctor_id,
    treatment_plan_id: row.treatment_plan_id,
    treatment_summary: tp.description ?? tp.procedure_name ?? '',
    cost_breakdown: buildCostBreakdown(tp, row.mta_commission_aud),
    diagnosis: tp.diagnosis,
    treatment_type: tp.treatment_type,
    recommended_treatment: tp.procedure_name,
    procedure_name: tp.procedure_name,
    description: tp.description,
    expected_outcome: tp.expected_outcome,
    technique: tp.technique,
    success_rate: tp.success_rate,
    treatment_start_date: tp.treatment_start_date,
    treatment_end_date: tp.treatment_end_date,
    treatment_duration: formatDurationDays(tp.treatment_duration_days),
    recovery_time: tp.recovery_time,
    hospital_stay: tp.estimated_length_of_stay,
    department: tp.department,
    room_category: tp.room_category,
    special_requirements: tp.special_requirements,
    patient_instructions: tp.patient_instructions,
    cost_notes: tp.cost_notes,
    specialists: (tp.treatment_plan_specialists ?? []).map((s) => ({
      specialist_type: s.specialist_type,
      specialist_name: s.specialist_name,
      cost_aud: s.cost_aud,
      notes: s.notes,
    })),
    aftercare: tp.aftercare,
    is_selected: row.is_selected,
    published_at: row.published_at,
    created_at: row.created_at,
    hospitals: tp.hospitals,
    doctors: tp.doctors,
  }
}

type UntypedClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, value: string) => {
        not: (col: string, op: string, value: null) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
  }
}

export async function fetchTreatmentOptionsForCase(
  caseId: string,
): Promise<{ data: TreatmentOptionWithDetails[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedClient
  const { data, error } = await supabase
    .from('treatment_options')
    .select(TREATMENT_SELECT)
    .eq('case_id', caseId)
    .not('published_at', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return { data: [], error: error.message }

  const rows = (data ?? []) as unknown as RawTreatmentOptionRow[]
  return { data: rows.map(flattenTreatmentOption), error: null }
}

type UntypedDoctorTreatmentsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: boolean) => {
          not: (col: string, op: string, value: null) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

// treatment_plans_case_doctor_key allows multiple doctors to each have a plan
// on the same case, so this filters treatment_plans.doctor_id directly rather
// than going through the doctor's assigned case_ids — otherwise a colleague's
// plan on a shared case could leak in.
export async function fetchConfirmedTreatmentsForDoctor(
  doctorId: string,
): Promise<{ data: TreatmentOptionWithPatientInfo[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedDoctorTreatmentsClient
  const { data, error } = await supabase
    .from('treatment_options')
    .select(`${TREATMENT_SELECT}, cases(reference_number, specialty, specialty_other, patients(full_name))`)
    .eq('treatment_plans.doctor_id', doctorId)
    .eq('is_selected', true)
    .not('published_at', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return { data: [], error: error.message }

  const rows = (data ?? []) as unknown as (RawTreatmentOptionRow & {
    cases: { reference_number: string; specialty: string; specialty_other: string | null; patients: { full_name: string } | null }
  })[]
  return {
    data: rows.map((r) => ({ ...flattenTreatmentOption(r), cases: r.cases })),
    error: null,
  }
}

type CaseWithTreatmentOptionsJoin = {
  reference_number: string
  specialty: string
  specialty_other: string | null
  treatment_options: RawTreatmentOptionRow[]
}

export async function fetchAllTreatmentOptionsForPatient(
  patientId: string,
): Promise<{ data: TreatmentOptionWithCaseInfo[]; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cases')
    .select(`reference_number, specialty, specialty_other, treatment_options!inner(${TREATMENT_SELECT})`)
    .eq('patient_id', patientId)
    .not('treatment_options.published_at', 'is', null)
    .order('created_at', { ascending: true, referencedTable: 'treatment_options' })

  if (error) return { data: [], error: error.message }

  const rows = (data ?? []) as unknown as CaseWithTreatmentOptionsJoin[]

  return {
    data: rows.flatMap((c) =>
      c.treatment_options.map((r) => ({
        ...flattenTreatmentOption(r),
        cases: {
          reference_number: c.reference_number,
          specialty: c.specialty,
          specialty_other: c.specialty_other,
        },
      })),
    ),
    error: null,
  }
}

export async function confirmTreatmentOption(
  optionId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, string>) => Promise<{ error: { message: string } | null }>
  }).rpc('confirm_treatment_option', { p_option_id: optionId })
  return { error: error?.message ?? null }
}
