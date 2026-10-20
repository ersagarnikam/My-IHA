import { createClient } from './server'
import type { Database } from '../types'

export type PatientForCase = {
  full_name: string
  date_of_birth: string | null
  gender: string | null
  country_of_residence: string | null
  phone: string | null
  avatar_url: string | null
  medical_history: string | null
}

// Doctor-facing lookup — relies on the "Doctors can view assigned patients"
// RLS policy (scoped through doctor_case_assignments), not a service-role bypass.
export async function fetchPatientForCase(
  patientId: string,
): Promise<{ data: PatientForCase | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .select('full_name, date_of_birth, gender, country_of_residence, phone, avatar_url, medical_history')
    .eq('id', patientId)
    .maybeSingle()
  return { data: data as PatientForCase | null, error: error?.message ?? null }
}

type RpcClient = {
  rpc: (
    fn: 'update_patient_full_name',
    args: { p_full_name: string },
  ) => Promise<{ error: { message: string } | null }>
}

export async function updatePatientFullName(fullName: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('update_patient_full_name', {
    p_full_name: fullName,
  })

  return { error: error?.message ?? null }
}

// `phone`/`address`/`full_name`/`date_of_birth` are decrypted computed
// columns (read-only — see ../types/computed-columns.ts), so they aren't
// part of the `Update` type; the RPC takes them as plain text and encrypts
// server-side.
type PersonalInfoPayload = Pick<
  Database['public']['Tables']['patients']['Update'],
  'gender' | 'nationality' | 'country_of_residence'
> & {
  full_name: string
  date_of_birth: string | null
  phone: string
  address: string | null
}

// SENSITIVE: medical_history/allergies/current_medications/past_surgeries — never log.
// All four are decrypted computed columns (read-only), so none are part of the `Update` type.
type MedicalPayload = {
  medical_history: string | null
  allergies: string[]
  current_medications: string[]
  past_surgeries: string | null
}

type EmergencyContactPayload = {
  emergency_contact_name: string
  emergency_contact_relationship: string
  emergency_contact_phone: string
}

type NotificationPreferencesPayload = Pick<
  Database['public']['Tables']['patients']['Update'],
  'email_notifications_enabled' | 'sms_notifications_enabled'
>

type SimpleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { code: string; message: string } | null }>
    }
  }
}

async function updatePatientRow(
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ error: { code: string; message: string } | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  return supabase.from('patients').update(payload).eq('user_id', userId)
}

type RpcCallClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
}

export async function updatePatientPersonalInfo(
  _userId: string,
  payload: PersonalInfoPayload,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcCallClient
  const { error } = await supabase.rpc('update_patient_personal_info', {
    p_full_name: payload.full_name,
    p_date_of_birth: payload.date_of_birth,
    p_gender: payload.gender,
    p_nationality: payload.nationality,
    p_country_of_residence: payload.country_of_residence,
    p_phone: payload.phone,
    p_address: payload.address,
  })
  return { error: error?.message ?? null }
}

// SENSITIVE: passes medical_history/allergies/medications/surgeries to the RPC — never log `payload`
export async function updatePatientMedicalBackground(
  _userId: string,
  payload: MedicalPayload,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcCallClient
  const { error } = await supabase.rpc('update_patient_medical_background', {
    p_medical_history: payload.medical_history,
    p_allergies: payload.allergies,
    p_current_medications: payload.current_medications,
    p_past_surgeries: payload.past_surgeries,
  })
  return { error: error?.message ?? null }
}

export async function updatePatientEmergencyContact(
  _userId: string,
  payload: EmergencyContactPayload,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as RpcCallClient
  const { error } = await supabase.rpc('update_patient_emergency_contact', {
    p_emergency_contact_name: payload.emergency_contact_name,
    p_emergency_contact_relationship: payload.emergency_contact_relationship,
    p_emergency_contact_phone: payload.emergency_contact_phone,
  })
  return { error: error?.message ?? null }
}

export async function updatePatientAvatarUrl(
  userId: string,
  avatarUrl: string,
): Promise<{ error: string | null }> {
  const { error } = await updatePatientRow(userId, { avatar_url: avatarUrl })
  return { error: error?.message ?? null }
}

export async function updatePatientNotificationPreferences(
  userId: string,
  payload: NotificationPreferencesPayload,
): Promise<{ error: string | null }> {
  const { error } = await updatePatientRow(userId, payload as Record<string, unknown>)
  return { error: error?.message ?? null }
}
