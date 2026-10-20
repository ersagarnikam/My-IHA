import { workingDays as registrationWorkingDayCodes } from '@/lib/validations/doctor-registration'
import { availabilityDays, type AvailabilityDay } from '@/lib/validations/account-settings'
import type { UploadedFileMeta } from '@/lib/validations/hospital-registration'
import { createClient } from '@iha/db/server'

// Registration collects working days as short codes (mon/tue/.../sun — see
// doctor-registration.ts). Availability is keyed by full day names, so this
// maps one to the other when deriving a doctor's first-ever schedule for
// Doctor Management's read-only view.
const SHORT_TO_FULL_DAY: Record<(typeof registrationWorkingDayCodes)[number], AvailabilityDay['day']> = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
}

/**
 * Until a doctor first saves their Availability tab (in apps/doctor),
 * `availability_schedule` is empty (see the migration) — show a schedule
 * derived from the working days they picked at registration instead of an
 * arbitrary default, so Doctor Management reflects what they already told us.
 */
export function deriveAvailabilityFromWorkingDays(workingDays: string[]): AvailabilityDay[] {
  const enabledDays = new Set(
    workingDays.map((code) => SHORT_TO_FULL_DAY[code as (typeof registrationWorkingDayCodes)[number]]),
  )
  return availabilityDays.map((day) => ({
    day,
    enabled: enabledDays.has(day),
    start_time: '09:00',
    end_time: '17:00',
  }))
}

export type HospitalAccountSettings = {
  name: string
  registrationType: string | null
  registrationNumber: string
  abnNumber: string
  address: string
  zipCode: string
  city: string
  country: string
  phone: string
  contactEmail: string
  specialties: string[]
  bedCount: number
  roomTypes: string[]
  licenseNumber: string
  accreditationBody: string
  certificates: UploadedFileMeta[]
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
}

export async function fetchHospitalAccountSettings(userId: string): Promise<HospitalAccountSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hospitals')
    .select(
      'name, registration_type, registration_number, abn_number, address, zip_code, city, country, phone, contact_email, specialties, bed_count, room_types, license_number, accreditation_body, certificates, email_notifications_enabled, sms_notifications_enabled',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  return {
    name: data.name ?? '',
    registrationType: data.registration_type,
    registrationNumber: data.registration_number ?? '',
    abnNumber: data.abn_number ?? '',
    address: data.address ?? '',
    zipCode: data.zip_code ?? '',
    city: data.city ?? '',
    country: data.country ?? '',
    phone: data.phone ?? '',
    contactEmail: data.contact_email ?? '',
    specialties: data.specialties ?? [],
    bedCount: data.bed_count ?? 0,
    roomTypes: data.room_types ?? [],
    licenseNumber: data.license_number ?? '',
    accreditationBody: data.accreditation_body ?? '',
    certificates: (data.certificates ?? []) as UploadedFileMeta[],
    emailNotificationsEnabled: data.email_notifications_enabled,
    smsNotificationsEnabled: data.sms_notifications_enabled,
  }
}
