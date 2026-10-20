'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { logAuditEvent } from '@iha/db/audit'
import type { Result } from '@iha/validations'
import { createLogger } from '@iha/logger'
import {
  lawyerAccountBasicInfoSchema,
  lawyerAccountProfessionalSchema,
  lawyerNotificationPreferencesSchema,
  type LawyerAccountBasicInfoInput,
  type LawyerAccountProfessionalInput,
  type LawyerNotificationPreferencesInput,
} from '@/lib/validations/account-settings'

const logger = createLogger('visa:account-settings')

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// The account-settings RPCs aren't present in the generated Database types
// (this migration is written but not yet pushed/regenerated — see
// 20260902010000_add_lawyer_account_settings.sql), so `.rpc()` is typed
// explicitly here, same workaround already used in apps/hospital/lib/actions/
// account-settings.ts.
type AccountSettingsRpcClient = {
  rpc(
    fn: 'update_lawyer_basic_info',
    args: {
      p_name: string
      p_registration_number: string
      p_abn_number: string
      p_contact_phone: string
      p_address: string
      p_city: string
      p_zip_code: string
    },
  ): Promise<{ error: { message: string } | null }>
  rpc(
    fn: 'update_lawyer_professional_details',
    args: {
      p_lawyer_type: string
      p_immigration_law_certification: string
    },
  ): Promise<{ error: { message: string } | null }>
}

// email_notifications_enabled/sms_notifications_enabled aren't present in
// the generated Database types yet either (same migration as above), so
// this `.update()` is typed explicitly too.
type NotificationPreferencesClient = {
  from(table: 'lawyers'): {
    update(values: { email_notifications_enabled: boolean; sms_notifications_enabled: boolean }): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>
    }
  }
}

export async function updateLawyerBasicInfo(
  values: LawyerAccountBasicInfoInput,
): Promise<Result<{ updated: true }>> {
  const parsed = lawyerAccountBasicInfoSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = (await createClient()) as unknown as AccountSettingsRpcClient
  const { error } = await supabase.rpc('update_lawyer_basic_info', {
    p_name: parsed.data.name,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_contact_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_city: parsed.data.city,
    p_zip_code: parsed.data.zipCode,
  })

  if (error) {
    logger.error({ err: error }, 'updateLawyerBasicInfo failed')
    return { data: null, error: 'Failed to save your information.' }
  }

  await logAuditEvent({
    app: 'visa',
    action: 'lawyer.profile_updated',
    entityType: 'lawyer',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateLawyerProfessionalDetails(
  values: LawyerAccountProfessionalInput,
): Promise<Result<{ updated: true }>> {
  const parsed = lawyerAccountProfessionalSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your details and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = (await createClient()) as unknown as AccountSettingsRpcClient
  const { error } = await supabase.rpc('update_lawyer_professional_details', {
    p_lawyer_type: parsed.data.lawyerType,
    p_immigration_law_certification: parsed.data.immigrationLawCertification,
  })

  if (error) {
    logger.error({ err: error }, 'updateLawyerProfessionalDetails failed')
    return { data: null, error: 'Failed to save your professional details.' }
  }

  await logAuditEvent({
    app: 'visa',
    action: 'lawyer.professional_details_updated',
    entityType: 'lawyer',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}

export async function updateLawyerNotificationPreferences(
  values: LawyerNotificationPreferencesInput,
): Promise<Result<{ updated: true }>> {
  const parsed = lawyerNotificationPreferencesSchema.safeParse(values)
  if (!parsed.success) {
    return { data: null, error: 'Please check your notification settings and try again.' }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: 'Unauthenticated' }

  const supabase = (await createClient()) as unknown as NotificationPreferencesClient
  const { error } = await supabase
    .from('lawyers')
    .update({
      email_notifications_enabled: parsed.data.email_notifications_enabled,
      sms_notifications_enabled: parsed.data.sms_notifications_enabled,
    })
    .eq('user_id', userId)

  if (error) {
    logger.error({ err: error }, 'updateLawyerNotificationPreferences failed')
    return { data: null, error: 'Failed to save notification preferences.' }
  }

  await logAuditEvent({
    app: 'visa',
    action: 'lawyer.notification_preferences_updated',
    entityType: 'lawyer',
    entityId: userId,
  })

  revalidatePath('/account-settings')
  return { data: { updated: true }, error: null }
}
