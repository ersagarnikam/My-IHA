import { z } from 'zod'
import { isValidPhone } from './phone'

export const personalInfoSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be under 100 characters')
    .regex(/[a-zA-Z]/, 'Full name must contain at least one letter'),
  date_of_birth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((val) => {
      const date = new Date(val)
      if (isNaN(date.getTime())) return false
      const now = new Date()
      const minDate = new Date()
      minDate.setFullYear(now.getFullYear() - 120)
      return date < now && date > minDate
    }, 'Please enter a valid date of birth'),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say'], {
    required_error: 'Please select a gender',
  }),
  nationality: z.string().min(1, 'Nationality is required'),
  country_of_residence: z.string().min(1, 'Country of residence is required'),
  phone: z
    .string()
    .refine(isValidPhone, 'Enter a valid phone number.'),
  address: z.string().optional(),
})

export const medicalBackgroundSchema = z.object({
  medical_history: z.string().optional(),
  allergies: z
    .array(z.string().max(100, 'Each tag must be under 100 characters'))
    .max(20, 'Maximum 20 items')
    .optional(),
  current_medications: z
    .array(z.string().max(100, 'Each tag must be under 100 characters'))
    .max(20, 'Maximum 20 items')
    .optional(),
  past_surgeries: z.string().optional(),
})

export const emergencyContactSchema = z.object({
  emergency_contact_name: z.string().min(1, 'Contact name is required'),
  emergency_contact_relationship: z.string().min(1, 'Relationship is required'),
  emergency_contact_phone: z
    .string()
    .refine(isValidPhone, 'Enter a valid phone number.'),
})

export const profileSetupSchema = personalInfoSchema
  .merge(medicalBackgroundSchema)
  .merge(emergencyContactSchema)

// Kept for backwards compat with existing usages
export const patientProfileSchema = personalInfoSchema

export type PersonalInfoInput = z.infer<typeof personalInfoSchema>
export type MedicalBackgroundInput = z.infer<typeof medicalBackgroundSchema>
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>
export type ProfileSetupInput = z.infer<typeof profileSetupSchema>
export type PatientProfileInput = z.infer<typeof patientProfileSchema>
