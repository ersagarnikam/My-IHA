import { updatePatientFullName } from '@iha/db/patients'
import { createClient, getAuthUser } from '@iha/db/server'
import { createLogger } from '@iha/logger'
import type { Patient } from '@iha/db/types'

const logger = createLogger('patient:repositories-patients')

// A plain string literal (not `array.join()`, which widens to `string` and
// breaks Supabase's `.select()` column-shape inference).
const PATIENT_COLUMNS =
  'id, user_id, full_name, date_of_birth, gender, nationality, country_of_residence, phone, address, medical_history, allergies, current_medications, past_surgeries, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, avatar_url, stripe_customer_id, email_notifications_enabled, sms_notifications_enabled, is_deleted, deleted_at, scheduled_delete_at, created_at, updated_at'

export async function fetchPatientByUserId(userId: string): Promise<Patient | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logger.error({ err: error }, 'fetchPatientByUserId failed')
    return null
  }

  return data
}

export type CurrentPatientContext = {
  userId: string
  authFullName: string | null
  patient: Patient | null
}

// Resolves the auth user + their patient row once, so callers that need both
// don't each independently call auth.getUser() and fetchPatientByUserId().
export async function fetchCurrentPatientContext(): Promise<CurrentPatientContext | null> {
  const user = await getAuthUser()
  if (!user) return null

  const patient = await fetchPatientByUserId(user.id)
  const authFullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null

  return { userId: user.id, authFullName, patient }
}

export async function syncPatientNameFromAuth(fullName: string): Promise<void> {
  const trimmed = fullName.trim()
  if (trimmed.length < 2) return

  const { error } = await updatePatientFullName(trimmed)

  if (error) {
    logger.error({ err: error }, 'syncPatientNameFromAuth failed')
  }
}
