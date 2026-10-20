import { createClient } from './server'
import type { CostBreakdown, CostItem } from './treatments'

// treatment_plans / treatment_plan_specialists aren't in the generated
// Supabase types yet (added by a migration not pushed to the linked project
// at the time this was written) — same "manually-typed row shapes + client
// cast" bypass already used in case-assignments.ts for newly added RPCs.
export type TreatmentPlanStatus =
  | 'draft'
  | 'submitted_to_iha'
  | 'iha_review_in_progress'
  | 'iha_approved'
  | 'rejected_by_iha'
  | 'presented_to_patient'
  | 'patient_confirmed'
  | 'not_selected'

export type TreatmentType = 'medication_only' | 'surgery' | 'therapy'

export type TreatmentPlanSpecialist = {
  id: string
  treatment_plan_id: string
  specialist_type: string
  specialist_name: string | null
  cost_aud: number
  notes: string | null
  created_at: string
}

export type TreatmentPlan = {
  id: string
  case_id: string
  doctor_id: string
  status: TreatmentPlanStatus
  diagnosis: string | null
  treatment_type: TreatmentType | null
  procedure_name: string | null
  description: string | null
  technique: string | null
  expected_outcome: string | null
  success_rate: string | null
  treatment_start_date: string | null
  treatment_end_date: string | null
  treatment_duration_days: number | null
  recovery_time: string | null
  estimated_length_of_stay: string | null
  hospital_id: string | null
  department: string | null
  room_category: string | null
  special_requirements: string | null
  doctor_fees_aud: number | null
  hospital_fees_aud: number | null
  cost_breakdown: CostBreakdown
  cost_notes: string | null
  patient_instructions: string | null
  aftercare: string[]
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type TreatmentPlanWithSpecialists = TreatmentPlan & { specialists: TreatmentPlanSpecialist[] }

export type SpecialistInput = {
  specialist_type: string
  specialist_name?: string | null
  cost_aud: number
  notes?: string | null
}

// doctor_id is intentionally absent — the write path (save_treatment_plan_draft
// RPC) re-derives it from auth.uid() server-side rather than trusting the
// client, now that the columns it writes are encrypted and the RPC is the
// only way to populate them correctly.
export type SaveDraftTreatmentPlanInput = {
  case_id: string
  diagnosis?: string | null
  treatment_type?: TreatmentType | null
  procedure_name?: string | null
  description?: string | null
  technique?: string | null
  expected_outcome?: string | null
  success_rate?: string | null
  treatment_start_date?: string | null
  treatment_end_date?: string | null
  recovery_time?: string | null
  estimated_length_of_stay?: string | null
  hospital_id?: string | null
  department?: string | null
  room_category?: string | null
  special_requirements?: string | null
  doctor_fees_aud?: number | null
  hospital_fees_aud?: number | null
  cost_items?: CostItem[]
  cost_notes?: string | null
  patient_instructions?: string | null
  aftercare?: string[]
  specialists?: SpecialistInput[]
}

function parseCostBreakdown(raw: unknown): CostBreakdown {
  const obj = (raw ?? {}) as Record<string, unknown>
  const items = Array.isArray(obj.items) ? (obj.items as CostItem[]) : []
  return { items, total: typeof obj.total === 'number' ? obj.total : 0 }
}

function toCostBreakdown(items: CostItem[] | undefined): CostBreakdown {
  const safeItems = items ?? []
  return { items: safeItems, total: safeItems.reduce((sum, item) => sum + (item.amount || 0), 0) }
}

type UntypedResult = { data: unknown; error: { message: string; code?: string } | null }
type UntypedClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => { maybeSingle: () => Promise<UntypedResult> }
        order: (col: string, opts: { ascending: boolean }) => Promise<UntypedResult>
      }
    }
  }
  rpc: (fn: string, args: Record<string, unknown>) => Promise<UntypedResult>
}

// treatment_plans/treatment_plan_specialists columns that hold clinical
// narrative or financial detail are encrypted at rest (packages/db/supabase/
// migrations/20260724150000_encrypt_treatment_plan_data.sql) and exposed as
// same-named PostgREST computed columns — a bare `select('*')` would only
// return the physical (unencrypted) columns and silently drop these, so the
// decrypted fields must be requested by name.
const TREATMENT_PLAN_COLUMNS = `
  id, case_id, doctor_id, status, diagnosis, treatment_type, procedure_name, description, technique,
  expected_outcome, success_rate, treatment_start_date, treatment_end_date, treatment_duration_days,
  recovery_time, estimated_length_of_stay, hospital_id, department, room_category, special_requirements,
  doctor_fees_aud, hospital_fees_aud, cost_breakdown, cost_notes, patient_instructions, aftercare,
  submitted_at, created_at, updated_at
`.trim()

const SPECIALIST_COLUMNS = 'id, treatment_plan_id, specialist_type, specialist_name, cost_aud, notes, created_at'

export async function fetchTreatmentPlanForCase(
  caseId: string,
  doctorId: string,
): Promise<{ data: TreatmentPlanWithSpecialists | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedClient

  const { data: planRow, error: planError } = await supabase
    .from('treatment_plans')
    .select(TREATMENT_PLAN_COLUMNS)
    .eq('case_id', caseId)
    .eq('doctor_id', doctorId)
    .maybeSingle()

  if (planError) return { data: null, error: planError.message }
  if (!planRow) return { data: null, error: null }

  const plan = planRow as TreatmentPlan

  const { data: specialistRows, error: specialistsError } = await supabase
    .from('treatment_plan_specialists')
    .select(SPECIALIST_COLUMNS)
    .eq('treatment_plan_id', plan.id)
    .order('created_at', { ascending: true })

  if (specialistsError) return { data: null, error: specialistsError.message }

  return {
    data: {
      ...plan,
      cost_breakdown: parseCostBreakdown(plan.cost_breakdown),
      specialists: (specialistRows as TreatmentPlanSpecialist[] | null) ?? [],
    },
    error: null,
  }
}

export async function saveDraftTreatmentPlan(
  input: SaveDraftTreatmentPlanInput,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedClient

  const { case_id, cost_items, specialists, ...rest } = input

  const { data, error } = await supabase.rpc('save_treatment_plan_draft', {
    p_case_id: case_id,
    p_diagnosis: rest.diagnosis ?? null,
    p_treatment_type: rest.treatment_type ?? null,
    p_procedure_name: rest.procedure_name ?? null,
    p_description: rest.description ?? null,
    p_technique: rest.technique ?? null,
    p_expected_outcome: rest.expected_outcome ?? null,
    p_success_rate: rest.success_rate ?? null,
    p_treatment_start_date: rest.treatment_start_date ?? null,
    p_treatment_end_date: rest.treatment_end_date ?? null,
    p_recovery_time: rest.recovery_time ?? null,
    p_estimated_length_of_stay: rest.estimated_length_of_stay ?? null,
    p_hospital_id: rest.hospital_id ?? null,
    p_department: rest.department ?? null,
    p_room_category: rest.room_category ?? null,
    p_special_requirements: rest.special_requirements ?? null,
    p_doctor_fees_aud: rest.doctor_fees_aud ?? null,
    p_hospital_fees_aud: rest.hospital_fees_aud ?? null,
    p_cost_breakdown: toCostBreakdown(cost_items),
    p_cost_notes: rest.cost_notes ?? null,
    p_patient_instructions: rest.patient_instructions ?? null,
    p_aftercare: rest.aftercare ?? [],
    p_specialists: specialists ?? [],
  })

  if (error) return { data: null, error: error.message }

  return { data: { id: data as string }, error: null }
}

export async function submitTreatmentPlan(planId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedClient
  const { error } = await supabase.rpc('submit_treatment_plan', { p_plan_id: planId })
  return { error: error?.message ?? null }
}

export type HospitalTreatmentPlanStatus = {
  case_id: string
  doctor_id: string
  status: TreatmentPlanStatus
}

type RpcSelectClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: HospitalTreatmentPlanStatus[] | null; error: { message: string } | null }>
}

/** Every non-draft treatment plan status the hospital has access to, across
 * all its affiliated doctors' cases — the bulk-fetch counterpart to
 * hospital_has_access_to_assignment (RLS on treatment_plans only lets the
 * owning doctor select it directly, see 20260730070000). */
export async function fetchTreatmentPlanStatusesForHospital(
  hospitalId: string,
): Promise<{ data: HospitalTreatmentPlanStatus[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcSelectClient
  const { data, error } = await supabase.rpc('hospital_treatment_plan_statuses', { p_hospital_id: hospitalId })
  return { data: data ?? [], error: error?.message ?? null }
}

export type DoctorTreatmentPlanStatus = { case_id: string; status: TreatmentPlanStatus }

/** Every one of this doctor's own treatment plan statuses, keyed by case —
 * unlike the hospital counterpart above this needs no security-definer RPC,
 * since treatment_plans' RLS already lets a doctor select their own rows
 * directly (20260722000000). Used to fold an IHA-rejected plan into the
 * doctor's case-list "Declined" bucket even though cases.status itself
 * never reflects that (see CaseRowStatusBadge). */
export async function fetchTreatmentPlanStatusesForDoctor(
  doctorId: string,
): Promise<{ data: DoctorTreatmentPlanStatus[]; error: string | null }> {
  const supabase = (await createClient()) as unknown as UntypedClient
  const { data, error } = await supabase
    .from('treatment_plans')
    .select('case_id, status')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data as DoctorTreatmentPlanStatus[] | null) ?? [], error: null }
}
