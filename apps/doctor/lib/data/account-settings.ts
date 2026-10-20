import { createClient } from '@iha/db/server'
import { workingDays as registrationWorkingDayCodes } from '@/lib/validations/doctor-registration'
import { availabilityDays, type AvailabilityDay } from '@/lib/validations/account-settings'

// Registration collects working days as short codes (mon/tue/.../sun — see
// doctor-registration.ts). Availability is keyed by full day names, so this
// maps one to the other when deriving a doctor's first-ever schedule.
const SHORT_TO_FULL_DAY: Record<(typeof registrationWorkingDayCodes)[number], AvailabilityDay['day']> = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
}

// Reverse of SHORT_TO_FULL_DAY — used to write the Availability tab's enabled
// days back into doctors.working_days, so the two stay in sync in both
// directions instead of only seeding the initial schedule.
export const FULL_TO_SHORT_DAY: Record<AvailabilityDay['day'], (typeof registrationWorkingDayCodes)[number]> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
}

/**
 * Until a doctor first saves the Availability tab, `availability_schedule` is
 * empty (see the migration) — show a schedule derived from the working days
 * they picked at registration instead of an arbitrary default, so the tab
 * reflects what they already told us rather than resetting it.
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

export type DoctorAccountSettings = {
  id: string
  annualFeeNextDueAt: string | null
  fullName: string
  contactEmail: string
  contactPhone: string
  dateOfBirth: string | null
  gender: string | null
  specialties: string[]
  qualifications: string
  yearsOfExperience: number
  licenseNumber: string
  photoUrl: string | null
  bio: string
  languagesSpoken: string[]
  department: string
  role: string | null
  hospitalAffiliations: string[]
  availabilitySchedule: AvailabilityDay[]
  emailNotificationsEnabled: boolean
  smsNotificationsEnabled: boolean
}

export async function fetchDoctorAccountSettings(userId: string): Promise<DoctorAccountSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctors')
    .select(
      'id, full_name, contact_email, contact_phone, date_of_birth, gender, specialties, qualifications, years_experience, license_number, photo_url, bio, languages_spoken, department, role, working_days, availability_schedule, email_notifications_enabled, sms_notifications_enabled, annual_fee_next_due_at',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  const { data: affiliations } = await supabase
    .from('doctor_hospital_affiliations')
    .select('hospital_id')
    .eq('doctor_id', data.id)

  return {
    id: data.id,
    annualFeeNextDueAt: data.annual_fee_next_due_at,
    fullName: data.full_name ?? '',
    contactEmail: data.contact_email ?? '',
    contactPhone: data.contact_phone ?? '',
    dateOfBirth: data.date_of_birth,
    gender: data.gender,
    specialties: data.specialties ?? [],
    qualifications: data.qualifications ?? '',
    yearsOfExperience: data.years_experience ?? 0,
    licenseNumber: data.license_number ?? '',
    photoUrl: data.photo_url,
    bio: data.bio ?? '',
    languagesSpoken: data.languages_spoken ?? [],
    department: data.department ?? '',
    role: data.role,
    hospitalAffiliations: (affiliations ?? []).map((a) => a.hospital_id),
    availabilitySchedule:
      (data.availability_schedule as AvailabilityDay[] | null)?.length
        ? (data.availability_schedule as AvailabilityDay[])
        : deriveAvailabilityFromWorkingDays(data.working_days ?? []),
    emailNotificationsEnabled: data.email_notifications_enabled,
    smsNotificationsEnabled: data.sms_notifications_enabled,
  }
}
