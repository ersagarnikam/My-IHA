'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { createLogger } from '@iha/logger'
import {
  hospitalAccountBasicInfoSchema,
  hospitalAccountDetailsSchema,
  hospitalNotificationPreferencesSchema,
  type HospitalAccountBasicInfoInput,
  type HospitalAccountDetailsInput,
  type HospitalNotificationPreferencesInput,
} from '@/lib/validations/account-settings'

const logger = createLogger('hospital:account-settings')

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// The account-settings RPCs aren't present in the generated Database types
// (these migrations are written but not yet pushed/regenerated — see the
// account-settings plan), so `.rpc()` is typed explicitly here, same
// workaround already used for `email_already_registered` in
// lib/actions/registration.ts.
type AccountSettingsRpcClient = {
  rpc(
    fn: 'update_hospital_basic_info',
    args: {
      p_name: string
      p_registration_number: string
      p_abn_number: string
      p_contact_email: string
      p_phone: string
      p_address: string
      p_city: string
      p_country: string
      p_zip_code: string
    },
  ): Promise<{ error: { message: string } | null }>
  rpc(
    fn: 'update_hospital_details',
    args: {
      p_registration_type: string
      p_specialties: string[]
      p_bed_count: number
      p_room_types: string[]
      p_license_number: string
      p_accreditation_body: string
    },
  ): Promise<{ error: { message: string } | null }>
}

export async function updateHospitalBasicInfo(
  values: HospitalAccountBasicInfoInput,
): Promise<Result<{ updated: true }>> {
  const parsed = hospitalAccountBasicInfoSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { data: null, error: 'Your session expired — please sign in again.' }

  const { error } = await (supabase as unknown as AccountSettingsRpcClient).rpc('update_hospital_basic_info', {
    p_name: parsed.data.name,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_contact_email: user.email,
    p_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_city: parsed.data.city,
    p_country: parsed.data.country,
    p_zip_code: parsed.data.zipCode,
  })

  if (error) {
    logger.error({ err: error }, 'updateHospitalBasicInfo failed')
    return { data: null, error: 'Failed to save hospital information.' }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'hospital.profile_updated',
    entityType: 'hospital',
    entityId: user.id,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateHospitalDetails(
  values: HospitalAccountDetailsInput,
): Promise<Result<{ updated: true }>> {
  const parsed = hospitalAccountDetailsSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = (await createClient()) as unknown as AccountSettingsRpcClient
  const { error } = await supabase.rpc('update_hospital_details', {
    p_registration_type: parsed.data.registrationType,
    p_specialties: parsed.data.specialties,
    p_bed_count: parsed.data.bedCount,
    p_room_types: parsed.data.roomTypes,
    p_license_number: parsed.data.licenseNumber,
    p_accreditation_body: parsed.data.accreditationBody,
  })

  if (error) {
    logger.error({ err: error }, 'updateHospitalDetails failed')
    return { data: null, error: 'Failed to save hospital details.' }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'hospital.details_updated',
    entityType: 'hospital',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateHospitalNotificationPreferences(
  values: HospitalNotificationPreferencesInput,
): Promise<Result<{ updated: true }>> {
  const parsed = hospitalNotificationPreferencesSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your notification settings and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('hospitals')
    .update({
      email_notifications_enabled: parsed.data.email_notifications_enabled,
      sms_notifications_enabled: parsed.data.sms_notifications_enabled,
    })
    .eq('user_id', userId)

  if (error) {
    logger.error({ err: error }, 'updateHospitalNotificationPreferences failed')
    return { data: null, error: 'Failed to save notification preferences.' }
  }

  await logAuditEvent({
    app: 'hospital',
    action: 'hospital.notification_preferences_updated',
    entityType: 'hospital',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}
