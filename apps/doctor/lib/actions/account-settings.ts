'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { logAuditEvent } from '@iha/db/audit'
import { getStorageObjectMeta } from '@iha/db/storage'
import type { Result } from '@iha/validations'
import { createLogger } from '@iha/logger'
import {
  doctorPersonalDetailsSchema,
  doctorProfessionalDetailsSchema,
  doctorAvailabilitySchema,
  doctorNotificationPreferencesSchema,
  type DoctorPersonalDetailsInput,
  type DoctorProfessionalDetailsInput,
  type DoctorAvailabilityInput,
  type DoctorNotificationPreferencesInput,
} from '@/lib/validations/account-settings'
import { FULL_TO_SHORT_DAY } from '@/lib/data/account-settings'

const logger = createLogger('doctor:account-settings')

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
    fn: 'update_doctor_profile',
    args: {
      p_full_name: string
      p_contact_email: string
      p_contact_phone: string
      p_date_of_birth: string
      p_gender: string
    },
  ): Promise<{ error: { message: string } | null }>
  rpc(
    fn: 'update_doctor_professional_details',
    args: {
      p_specialties: string[]
      p_qualifications: string
      p_years_experience: number
      p_license_number: string
      p_bio: string
      p_languages_spoken: string[]
      p_department: string
      p_role: string
      p_hospital_ids: string[]
    },
  ): Promise<{ error: { message: string } | null }>
}

export async function updateDoctorProfile(values: DoctorPersonalDetailsInput): Promise<Result<{ updated: true }>> {
  const parsed = doctorPersonalDetailsSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { data: null, error: 'Your session expired — please sign in again.' }

  const { error } = await (supabase as unknown as AccountSettingsRpcClient).rpc('update_doctor_profile', {
    p_full_name: parsed.data.fullName,
    p_contact_email: user.email,
    p_contact_phone: parsed.data.contactPhone,
    p_date_of_birth: parsed.data.dateOfBirth,
    p_gender: parsed.data.gender,
  })

  if (error) {
    logger.error({ err: error }, 'updateDoctorProfile failed')
    return { data: null, error: 'Failed to save profile.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'doctor.profile_updated',
    entityType: 'doctor',
    entityId: user.id,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateDoctorProfessionalDetails(
  values: DoctorProfessionalDetailsInput,
): Promise<Result<{ updated: true }>> {
  const parsed = doctorProfessionalDetailsSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = (await createClient()) as unknown as AccountSettingsRpcClient
  const { error } = await supabase.rpc('update_doctor_professional_details', {
    p_specialties: parsed.data.specialties,
    p_qualifications: parsed.data.qualifications,
    p_years_experience: parsed.data.yearsOfExperience,
    p_license_number: parsed.data.licenseNumber,
    p_bio: parsed.data.bio,
    p_languages_spoken: parsed.data.languagesSpoken,
    p_department: parsed.data.department,
    p_role: parsed.data.role,
    p_hospital_ids: parsed.data.hospitalAffiliations,
  })

  if (error) {
    logger.error({ err: error }, 'updateDoctorProfessionalDetails failed')
    return { data: null, error: 'Failed to save professional details.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'doctor.professional_details_updated',
    entityType: 'doctor',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

const ALLOWED_AVATAR_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

// Client already uploaded directly to the `avatars` bucket at
// `${userId}/avatar.${ext}` — this derives the expected path itself and
// verifies the real object Supabase Storage recorded there (real
// mimetype/size) before persisting a URL, same pattern as
// updateAvatarUrl in apps/patient/lib/actions/profile.ts.
export async function updateDoctorAvatarUrl(ext: string): Promise<Result<{ photoUrl: string }>> {
  const normalizedExt = ext.toLowerCase().replace(/^\./, '')
  const expectedMime = ALLOWED_AVATAR_MIME_TYPES[normalizedExt]
  if (!expectedMime) {
    return { data: null, error: 'Unsupported image type.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = await createClient()
  const path = `${userId}/avatar.${normalizedExt}`

  const meta = await getStorageObjectMeta(supabase, 'avatars', path)
  if (!meta) {
    return { data: null, error: 'Uploaded photo could not be verified. Please re-upload.' }
  }
  if (meta.mimetype !== expectedMime) {
    return { data: null, error: 'Unsupported image type.' }
  }
  if (meta.size > MAX_AVATAR_SIZE) {
    return { data: null, error: 'Image must be under 5 MB.' }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)

  const { error } = await supabase.from('doctors').update({ photo_url: publicUrl }).eq('user_id', userId)
  if (error) {
    logger.error({ err: error }, 'updateDoctorAvatarUrl failed')
    return { data: null, error: 'Failed to save profile photo.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'doctor.avatar_updated',
    entityType: 'doctor',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { photoUrl: publicUrl }, error: null }
}

export async function updateDoctorAvailability(
  values: DoctorAvailabilityInput,
): Promise<Result<{ updated: true }>> {
  const parsed = doctorAvailabilitySchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your availability and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  // Keep doctors.working_days (short codes, set at registration) in sync with
  // whichever days are enabled here, so the two never drift apart.
  const workingDays = parsed.data.filter((d) => d.enabled).map((d) => FULL_TO_SHORT_DAY[d.day])

  const supabase = await createClient()
  const { error } = await supabase
    .from('doctors')
    .update({ availability_schedule: parsed.data, working_days: workingDays })
    .eq('user_id', userId)

  if (error) {
    logger.error({ err: error }, 'updateDoctorAvailability failed')
    return { data: null, error: 'Failed to save availability.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'doctor.availability_updated',
    entityType: 'doctor',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateDoctorNotificationPreferences(
  values: DoctorNotificationPreferencesInput,
): Promise<Result<{ updated: true }>> {
  const parsed = doctorNotificationPreferencesSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your notification settings and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('doctors')
    .update({
      email_notifications_enabled: parsed.data.email_notifications_enabled,
      sms_notifications_enabled: parsed.data.sms_notifications_enabled,
    })
    .eq('user_id', userId)

  if (error) {
    logger.error({ err: error }, 'updateDoctorNotificationPreferences failed')
    return { data: null, error: 'Failed to save notification preferences.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'doctor.notification_preferences_updated',
    entityType: 'doctor',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}
