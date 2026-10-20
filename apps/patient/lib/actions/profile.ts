'use server'

import { createClient } from '@iha/db/server'
import {
  updatePatientPersonalInfo,
  updatePatientMedicalBackground,
  updatePatientEmergencyContact,
  updatePatientAvatarUrl,
  updatePatientNotificationPreferences,
} from '@iha/db/patients'
import { getStorageObjectMeta } from '@iha/db/storage'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import {
  personalInfoSchema,
  medicalBackgroundSchema,
  emergencyContactSchema,
  type PersonalInfoInput,
  type MedicalBackgroundInput,
  type EmergencyContactInput,
} from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'
import { signOut } from './auth'

const logger = createLogger('patient:profile')

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function updatePersonalInfo(
  values: PersonalInfoInput,
): Promise<Result<{ updated: true }>> {
  const t = await getTranslations('actionErrors')
  const parsed = personalInfoSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: t('common.tryAgainWithDetails') }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const { error } = await updatePatientPersonalInfo(userId, {
    full_name: parsed.data.full_name,
    date_of_birth: parsed.data.date_of_birth,
    gender: parsed.data.gender,
    nationality: parsed.data.nationality,
    country_of_residence: parsed.data.country_of_residence,
    phone: parsed.data.phone,
    address: parsed.data.address ?? null,
  })

  if (error) {
    logger.error({ err: error }, 'updatePersonalInfo failed')
    return { data: null, error: t('profile.savePersonalInfoFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.personal_info_updated',
    entityType: 'patient',
    entityId: userId,
  })

  revalidatePath('/profile')
  return { data: { updated: true }, error: null }
}

export async function updateMedicalBackground(
  values: MedicalBackgroundInput,
): Promise<Result<{ updated: true }>> {
  const t = await getTranslations('actionErrors')
  const parsed = medicalBackgroundSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: t('common.tryAgainWithDetails') }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  // SENSITIVE: medical_history/allergies/medications/surgeries — never log these values
  const { error } = await updatePatientMedicalBackground(userId, {
    medical_history: parsed.data.medical_history ?? null,
    allergies: parsed.data.allergies ?? [],
    current_medications: parsed.data.current_medications ?? [],
    past_surgeries: parsed.data.past_surgeries ?? null,
  })

  if (error) {
    // SENSITIVE: `error` is a DB error message only, never the medical payload itself
    logger.error({ err: error }, 'updateMedicalBackground failed')
    return { data: null, error: t('profile.saveMedicalBackgroundFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.medical_background_updated',
    entityType: 'patient',
    entityId: userId,
  })

  revalidatePath('/profile')
  return { data: { updated: true }, error: null }
}

export async function updateEmergencyContact(
  values: EmergencyContactInput,
): Promise<Result<{ updated: true }>> {
  const t = await getTranslations('actionErrors')
  const parsed = emergencyContactSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: t('common.tryAgainWithDetails') }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const { error } = await updatePatientEmergencyContact(userId, {
    emergency_contact_name: parsed.data.emergency_contact_name,
    emergency_contact_relationship: parsed.data.emergency_contact_relationship,
    emergency_contact_phone: parsed.data.emergency_contact_phone,
  })

  if (error) {
    logger.error({ err: error }, 'updateEmergencyContact failed')
    return { data: null, error: t('profile.saveEmergencyContactFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.emergency_contact_updated',
    entityType: 'patient',
    entityId: userId,
  })

  revalidatePath('/profile')
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

// `ext` is the extension of the file the client already uploaded directly to
// the `avatars` bucket at `${userId}/avatar.${ext}`. Rather than trusting an
// arbitrary avatar URL string from the client, this derives the expected path
// itself and verifies the real object Supabase Storage recorded there (real
// mimetype/size) before persisting a URL — see verifyDocuments in
// lib/actions/cases.ts for the same pattern applied to case documents.
export async function updateAvatarUrl(
  ext: string,
): Promise<Result<{ avatarUrl: string }>> {
  const t = await getTranslations('actionErrors')
  const normalizedExt = ext.toLowerCase().replace(/^\./, '')
  const expectedMime = ALLOWED_AVATAR_MIME_TYPES[normalizedExt]
  if (!expectedMime) {
    return { data: null, error: t('common.unsupportedImageType') }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()
  const path = `${userId}/avatar.${normalizedExt}`

  const meta = await getStorageObjectMeta(supabase, 'avatars', path)
  if (!meta) {
    return { data: null, error: t('profile.photoVerificationFailed') }
  }
  if (meta.mimetype !== expectedMime) {
    return { data: null, error: t('common.unsupportedImageType') }
  }
  if (meta.size > MAX_AVATAR_SIZE) {
    return { data: null, error: t('common.photoTooLarge') }
  }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  const { error } = await updatePatientAvatarUrl(userId, publicUrl)
  if (error) {
    logger.error({ err: error }, 'updateAvatarUrl failed')
    return { data: null, error: t('profile.savePhotoFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.avatar_updated',
    entityType: 'patient',
    entityId: userId,
  })

  revalidatePath('/profile')
  return { data: { avatarUrl: publicUrl }, error: null }
}

export async function updateNotificationPreferences(values: {
  email_notifications_enabled: boolean
  sms_notifications_enabled: boolean
}): Promise<Result<{ updated: true }>> {
  const t = await getTranslations('actionErrors')
  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const { error } = await updatePatientNotificationPreferences(userId, values)
  if (error) {
    logger.error({ err: error }, 'updateNotificationPreferences failed')
    return { data: null, error: t('profile.saveNotificationPrefsFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.notification_preferences_updated',
    entityType: 'patient',
    entityId: userId,
  })

  revalidatePath('/profile')
  return { data: { updated: true }, error: null }
}

export async function deletePatientAccountAction(): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_patient_account')
  if (error) {
    logger.error({ err: error }, 'deletePatientAccountAction failed')
    return { data: null, error: t('profile.deleteAccountFailed') }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'patient.account_deleted',
    entityType: 'patient',
    entityId: userId,
  })

  await signOut()
  return { data: { success: true }, error: null }
}
