import { z } from 'zod'
import { emailField } from '@iha/validations/auth'
import { isValidPhone } from '@iha/validations/phone'
import { fileMetaSchema, type UploadedFileMeta } from './hospital-registration'

export const doctorRoles = ['consultant', 'surgeon'] as const

export const doctorRoleLabels: Record<(typeof doctorRoles)[number], string> = {
  consultant: 'Consultant',
  surgeon: 'Surgeon',
}

export const workingDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const workingDayLabels: Record<(typeof workingDays)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

// Step 1 — Basic Information
export const doctorBasicInfoStepSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  contactEmail: emailField,
  contactPhone: z.string().refine(isValidPhone, 'Enter a valid phone number.'),
  profilePhoto: fileMetaSchema.nullable(),
})

// Step 2 — Professional Details
export const doctorProfessionalStepSchema = z.object({
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
})

// Step 3 — Hospital Details & Availability
export const doctorHospitalStepSchema = z.object({
  department: z.string().trim().min(1, 'Department is required'),
  role: z.enum(doctorRoles, { message: 'Select a role' }),
  hospitalAffiliations: z.array(z.string()),
  workingDays: z.array(z.enum(workingDays)).min(1, 'Select at least one working day'),
})

// Step 5 — Documents
export const doctorDocumentsStepSchema = z.object({
  medicalLicense: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload your medical license',
  }),
  degreeCertificate: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload your degree certificate',
  }),
})

export const doctorRegistrationSchema = doctorBasicInfoStepSchema
  .merge(doctorProfessionalStepSchema)
  .merge(doctorHospitalStepSchema)
  .extend({
    certificates: z.array(fileMetaSchema).min(1, 'At least one document is required'),
  })

export type DoctorRegistrationInput = z.infer<typeof doctorRegistrationSchema>
export type { UploadedFileMeta }
