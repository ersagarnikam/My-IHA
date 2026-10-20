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
  'license_certificate',
  'immigration_law_certification',
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

export const lawyerTypes = ['individual', 'law_firm'] as const

export const lawyerTypeLabels: Record<(typeof lawyerTypes)[number], string> = {
  individual: 'Individual Lawyer',
  law_firm: 'Law Firm',
}

// Step — Lawyer / Firm Details
export const lawyerDetailsStepSchema = z.object({
  lawyerType: z.enum(lawyerTypes, { message: 'Select a registration type' }),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  registrationNumber: z
    .string()
    .trim()
    .min(4, 'Registration/license number must be at least 4 characters')
    .max(20, 'Registration/license number must be at most 20 characters')
    .regex(/^[A-Za-z0-9-]+$/, 'Registration/license number can only contain letters, numbers, and hyphens'),
  abnNumber: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'ABN must be 11 digits')
    .refine(isValidAbn, 'Enter a valid ABN'),
  immigrationLawCertification: z.string().trim().min(1, 'Immigration law certification details are required'),
  phone: z.string().refine(isValidPhone, 'Enter a valid phone number.'),
  address: z.string().trim().min(1, 'Address is required'),
  city: z.string().trim().min(1, 'City/State is required'),
  zipCode: z.string().trim().min(1, 'Zip code is required'),
})

// Step — Documents
export const lawyerDocumentsStepSchema = z.object({
  licenseCertificate: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload your registration/license certificate',
  }),
  immigrationLawCertificationDocument: fileMetaSchema.nullable().refine((v) => v !== null, {
    message: 'Upload your immigration law certification',
  }),
  otherDocuments: z.array(fileMetaSchema),
})

export const lawyerRegistrationSchema = lawyerDetailsStepSchema.extend({
  certificates: z.array(fileMetaSchema).min(1, 'At least one document is required'),
})

export type LawyerRegistrationInput = z.infer<typeof lawyerRegistrationSchema>
