import { createClient } from '@iha/db/server'
import type { UploadedFileMeta } from '@/lib/validations/lawyer-registration'

// The notification-preference columns and decrypted registration_number/
// abn_number computed columns queried below aren't present in the generated
// Database types yet (20260902010000_add_lawyer_account_settings.sql is
// written but not yet pushed/regenerated), so this select is typed
// explicitly — same workaround already used for RPCs in
// apps/hospital/lib/actions/account-settings.ts.
type LawyerAccountRow = {
  name: string | null
  lawyer_type: string | null
  registration_number: string | null
  abn_number: string | null
  immigration_law_certification: string | null
  contact_phone: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  certificates: unknown
  email_notifications_enabled: boolean
  sms_notifications_enabled: boolean
}

type LawyerAccountSettingsClient = {
  from(table: 'lawyers'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): Promise<{ data: LawyerAccountRow | null }> }
    }
  }
}

export type LawyerAccountSettings = {
  name: string
  lawyerType: string
  registrationNumber: string
  abnNumber: string
  immigrationLawCertification: string
  phone: string
  address: string
  city: string
  zipCode: string
  certificates: UploadedFileMeta[]
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
}

export async function fetchLawyerAccountSettings(userId: string): Promise<LawyerAccountSettings | null> {
  const supabase = (await createClient()) as unknown as LawyerAccountSettingsClient
  const { data } = await supabase
    .from('lawyers')
    .select(
      'name, lawyer_type, registration_number, abn_number, immigration_law_certification, contact_phone, address, city, zip_code, certificates, email_notifications_enabled, sms_notifications_enabled',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  return {
    name: data.name ?? '',
    lawyerType: data.lawyer_type ?? '',
    registrationNumber: data.registration_number ?? '',
    abnNumber: data.abn_number ?? '',
    immigrationLawCertification: data.immigration_law_certification ?? '',
    phone: data.contact_phone ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    zipCode: data.zip_code ?? '',
    certificates: (data.certificates ?? []) as UploadedFileMeta[],
    emailNotificationsEnabled: data.email_notifications_enabled,
    smsNotificationsEnabled: data.sms_notifications_enabled,
  }
}
