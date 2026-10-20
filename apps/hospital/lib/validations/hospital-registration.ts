import { z } from 'zod'
import { isValidPhone } from '@iha/validations/phone'

/** Australian Business Number checksum (weighted modulus 89). */
function isValidAbn(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const digits = value.split('').map(Number)
  digits[0] = (digits[0] ?? 0) - 1
  const total = digits.reduce((sum, digit, i) => sum + digit * (weights[i] ?? 0), 0)
  return total % 89 === 0
}

export const documentCategories = [
  'license',
  'registration_certificate',
  'medical_license',
  'degree_certificate',
  'other',
] as const
export type DocumentCategory = (typeof documentCategories)[number]

export type UploadedFileMeta = {
  fileName: string
  filePath: string
  mimeType: string
  fileSizeBytes: number
  category?: DocumentCategory
}

export const fileMetaSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
  category: z.enum(documentCategories).optional(),
})

export const hospitalTypes = ['multi_specialty', 'single_specialty'] as const

export const hospitalTypeLabels: Record<(typeof hospitalTypes)[number], string> = {
  multi_specialty: 'Multi-specialty',
  single_specialty: 'Single specialty',
}

// Step 1 — Basic Information
export const hospitalBasicInfoStepSchema = z.object({
  name: z.string().trim().min(2, 'Hospital name must be at least 2 characters'),
  registrationNumber: z
    .string()
    .trim()
    .min(4, 'Registration number must be at least 4 characters')
    .max(20, 'Registration number must be at most 20 characters')
    .regex(/^[A-Za-z0-9-]+$/, 'Registration number can only contain letters, numbers, and hyphens'),
  abnNumber: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'ABN must be 11 digits')
    .refine(isValidAbn, 'Enter a valid ABN'),
  phone: z.string().refine(isValidPhone, 'Enter a valid phone number.'),
})

// Step 2 — Location
export const hospitalLocationStepSchema = z.object({
  country: z.string().trim().min(1, 'Country is required'),
  city: z.string().trim().min(1, 'State/City is required'),
  address: z.string().trim().min(1, 'Full address is required'),
  zipCode: z.string().trim().min(1, 'Zip code is required'),
})

// Step 3 — Hospital Details
export const hospitalDetailsStepSchema = z.object({
  registrationType: z.enum(hospitalTypes, { message: 'Select a hospital type' }),
  specialties: z.array(z.string()).min(1, 'Select at least one specialty'),
  bedCount: z.coerce.number().int().min(1, 'Number of beds must be greater than 0'),
  roomTypes: z.array(z.string().trim().min(1)).min(1, 'Add at least one room type'),
  licenseNumber: z
    .string()
    .trim()
    .min(4, 'License number must be at least 4 characters')
    .max(20, 'License number must be at most 20 characters')
    .regex(/^[A-Za-z0-9-]+$/, 'License number can only contain letters, numbers, and hyphens'),
  accreditationBody: z.string().trim().min(1, 'Accreditation body is required'),
})

// Step 5 — Document
export const hospitalDocumentsStepSchema = z.object({
  hospitalLicense: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload the hospital license',
  }),
  registrationCertificate: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload the registration certificate',
  }),
  otherDocuments: z.array(fileMetaSchema),
})

export const hospitalRegistrationSchema = hospitalBasicInfoStepSchema
  .merge(hospitalLocationStepSchema)
  .merge(hospitalDetailsStepSchema)
  .extend({
    certificates: z.array(fileMetaSchema).min(1, 'At least one document is required'),
  })

export type HospitalRegistrationInput = z.infer<typeof hospitalRegistrationSchema>
