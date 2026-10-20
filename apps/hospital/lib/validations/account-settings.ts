import { z } from 'zod'
import {
  hospitalBasicInfoStepSchema,
  hospitalLocationStepSchema,
  hospitalDetailsStepSchema,
} from '@/lib/validations/hospital-registration'

// Doctor gender/availability display constants — still needed here because
// Doctor Management (hospital-only) renders a read-only view of a doctor's
// profile, even though the doctor's own editable account-settings page now
// lives in apps/doctor.
export const doctorGenders = ['male', 'female', 'other', 'prefer_not_to_say'] as const

export const doctorGenderLabels: Record<(typeof doctorGenders)[number], string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

export const availabilityDays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export const availabilityDayLabels: Record<(typeof availabilityDays)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const availabilityDaySchema = z.object({
  day: z.enum(availabilityDays),
  enabled: z.boolean(),
  start_time: z.string(),
  end_time: z.string(),
})

export type AvailabilityDay = z.infer<typeof availabilityDaySchema>

// Reuses the registration wizard's step schemas for the two Profile-tab cards
// — same fields, same validation rules, so a hospital editing its profile is
// held to the same bar as one registering for the first time. Contact email
// isn't part of this schema: like the registration wizard, the account
// settings page displays the account's login email read-only instead of
// collecting a separate one.
export const hospitalAccountBasicInfoSchema = hospitalBasicInfoStepSchema.merge(hospitalLocationStepSchema)
export type HospitalAccountBasicInfoInput = z.infer<typeof hospitalAccountBasicInfoSchema>

export const hospitalAccountDetailsSchema = hospitalDetailsStepSchema
export type HospitalAccountDetailsInput = z.infer<typeof hospitalAccountDetailsSchema>

export const hospitalNotificationPreferencesSchema = z.object({
  email_notifications_enabled: z.boolean(),
  sms_notifications_enabled: z.boolean(),
})

export type HospitalNotificationPreferencesInput = z.infer<typeof hospitalNotificationPreferencesSchema>
