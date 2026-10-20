import { z } from 'zod'
import { isValidPhone } from '@iha/validations/phone'
import { doctorRoles } from '@/lib/validations/doctor-registration'

// Same fixed catalog as the registration wizard's Professional Details step
// (components/registration/doctor-professional-step.tsx) — kept as a
// separate constant here since that one isn't exported.
export const languageOptions = ['English', 'Mandarin (Chinese)'] as const

export const doctorGenders = ['male', 'female', 'other', 'prefer_not_to_say'] as const

export const doctorGenderLabels: Record<(typeof doctorGenders)[number], string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

export const doctorPersonalDetailsSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  contactPhone: z.string().refine(isValidPhone, 'Enter a valid phone number.'),
  dateOfBirth: z.string().trim().min(1, 'Date of birth is required'),
  gender: z.enum(doctorGenders, { message: 'Select a gender' }),
})

export type DoctorPersonalDetailsInput = z.infer<typeof doctorPersonalDetailsSchema>

export const doctorProfessionalDetailsSchema = z.object({
  specialties: z.array(z.string()).min(1, 'Select at least one specialty'),
  qualifications: z.string().trim().min(1, 'Qualifications are required'),
  yearsOfExperience: z.coerce.number().int().min(0).max(70),
  licenseNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) => /^[A-Z]{3}\d{10}$/.test(v),
      'Enter a valid AHPRA number (3 letters followed by 10 digits, e.g. MED0001234567)',
    ),
  bio: z.string().trim().min(1, 'A short professional bio is required'),
  languagesSpoken: z.array(z.string()).min(1, 'Select at least one language'),
  department: z.string().trim().min(1, 'Department is required'),
  role: z.enum(doctorRoles, { message: 'Select a role' }),
  hospitalAffiliations: z.array(z.string()),
})

export type DoctorProfessionalDetailsInput = z.infer<typeof doctorProfessionalDetailsSchema>

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

export const doctorAvailabilitySchema = z
  .array(availabilityDaySchema)
  .length(7)
  .refine((days) => days.some((d) => d.enabled), 'Select at least one working day')

export type AvailabilityDay = z.infer<typeof availabilityDaySchema>
export type DoctorAvailabilityInput = z.infer<typeof doctorAvailabilitySchema>

export const doctorNotificationPreferencesSchema = z.object({
  email_notifications_enabled: z.boolean(),
  sms_notifications_enabled: z.boolean(),
})

export type DoctorNotificationPreferencesInput = z.infer<typeof doctorNotificationPreferencesSchema>
