import { z } from 'zod'
import { isValidPhone } from './phone'

// ICAO 9303 passport numbers are alphanumeric, typically 6-9 characters, up to 12 for some issuers.
const PASSPORT_NUMBER_REGEX = /^[A-Z0-9]{5,12}$/i

export type VisaFormMessages = {
  firstNameRequired: string
  lastNameRequired: string
  genderRequired: string
  nationalityRequired: string
  dateOfBirthRequired: string
  dateOfBirthInvalid: string
  passportNumberRequired: string
  passportNumberInvalid: string
  passportExpiryRequired: string
  passportExpiryFuture: string
  emailInvalid: string
  phoneInvalid: string
  answerRequired: string
  providerNameRequired: string
  organizationRequired: string
  addressRequired: string
  contactRequired: string
  sourceOfFundsRequired: string
  arrivalDateRequired: string
  arrivalDateFuture: string
  departureDateRequired: string
  companionFieldRequired: string
}

const defaultVisaFormMessages: VisaFormMessages = {
  firstNameRequired: 'First name is required',
  lastNameRequired: 'Last name is required',
  genderRequired: 'Gender is required',
  nationalityRequired: 'Nationality is required',
  dateOfBirthRequired: 'Date of birth is required',
  dateOfBirthInvalid: 'Please enter a valid date of birth',
  passportNumberRequired: 'Passport number is required',
  passportNumberInvalid: 'Please enter a valid passport number',
  passportExpiryRequired: 'Passport expiry is required',
  passportExpiryFuture: 'Passport expiry must be a future date',
  emailInvalid: 'Please enter a valid email address',
  phoneInvalid: 'Please enter a valid phone number',
  answerRequired: 'Please answer this question',
  providerNameRequired: 'Provider name is required',
  organizationRequired: 'Organization is required',
  addressRequired: 'Address is required',
  contactRequired: 'Contact is required',
  sourceOfFundsRequired: 'Source of funds is required',
  arrivalDateRequired: 'Arrival date is required',
  arrivalDateFuture: 'Arrival date must be today or a future date',
  departureDateRequired: 'Departure date is required',
  companionFieldRequired: 'This field is required',
}

const COMPANION_REQUIRED_FIELDS = [
  'companion_name',
  'companion_relationship',
  'companion_passport_number',
  'companion_passport_expiry',
] as const

export function getVisaFormSchema(messages: VisaFormMessages = defaultVisaFormMessages) {
  return z.object({
    // Step 0: Traveler Details
    first_name: z.string().min(1, messages.firstNameRequired),
    last_name: z.string().min(1, messages.lastNameRequired),
    gender: z.string().min(1, messages.genderRequired),
    nationality: z.string().min(1, messages.nationalityRequired),
    date_of_birth: z
      .string()
      .min(1, messages.dateOfBirthRequired)
      .refine((val) => {
        const d = new Date(val)
        if (isNaN(d.getTime())) return false
        const now = new Date()
        const min = new Date()
        min.setFullYear(now.getFullYear() - 120)
        return d < now && d > min
      }, messages.dateOfBirthInvalid),
    australian_provider_details: z.string().optional(),
    passport_number: z
      .string()
      .trim()
      .min(1, messages.passportNumberRequired)
      .regex(PASSPORT_NUMBER_REGEX, messages.passportNumberInvalid),
    passport_expiry: z
      .string()
      .min(1, messages.passportExpiryRequired)
      .refine((val) => {
        const d = new Date(val)
        return !isNaN(d.getTime()) && d > new Date()
      }, messages.passportExpiryFuture),
    email: z.string().email(messages.emailInvalid),
    phone: z.string().refine(isValidPhone, messages.phoneInvalid),

    // Step 1: Medical Information
    condition_summary: z.string().optional(),
    has_medical_conditions: z.string().min(1, messages.answerRequired),
    medical_conditions_details: z.string().optional(),
    health_examination_completed: z.string().min(1, messages.answerRequired),

    // Step 2: Australian Provider Details
    provider_name: z.string().min(1, messages.providerNameRequired),
    provider_organization: z.string().min(1, messages.organizationRequired),
    provider_address: z.string().min(1, messages.addressRequired),
    provider_contact: z
      .string()
      .min(1, messages.contactRequired)
      .refine(isValidPhone, messages.phoneInvalid),

    // Step 3: Financial Details (conditional requirements enforced in handleNext)
    source_of_funds: z.string().min(1, messages.sourceOfFundsRequired),
    bank_balance: z.string().optional(),
    sponsor_name: z.string().optional(),
    sponsor_relationship: z.string().optional(),
    sponsor_contact: z
      .string()
      .optional()
      .refine((val) => !val || isValidPhone(val), messages.phoneInvalid),

    // Step 4: Travel Details
    arrival_date: z
      .string()
      .min(1, messages.arrivalDateRequired)
      .refine((val) => {
        const d = new Date(val)
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        return !isNaN(d.getTime()) && d >= now
      }, messages.arrivalDateFuture),
    departure_date: z.string().min(1, messages.departureDateRequired),
    purpose_of_visit: z.string().optional(),
    flight_booking: z.string().optional(),
    accommodation: z.string().optional(),

    // Step 6: Legal & Compliance
    criminal_record: z.string().min(1, messages.answerRequired),
    criminal_record_details: z.string().optional(),
    previous_visa_issues: z.string().min(1, messages.answerRequired),
    previous_visa_issues_details: z.string().optional(),

    // Step 7: Companion Details (all optional)
    travelling_with_companion: z.string().optional(),
    companion_name: z.string().optional(),
    companion_relationship: z.string().optional(),
    companion_passport_number: z.string().optional().transform((val) => val?.trim()),
    companion_passport_expiry: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (data.travelling_with_companion !== 'Yes') return
    for (const field of COMPANION_REQUIRED_FIELDS) {
      if (!data[field]?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.companionFieldRequired,
          path: [field],
        })
      }
    }
    if (data.companion_passport_number && !PASSPORT_NUMBER_REGEX.test(data.companion_passport_number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: messages.passportNumberInvalid,
        path: ['companion_passport_number'],
      })
    }
  })
}

export const visaFormSchema = getVisaFormSchema()

export type VisaFormInput = z.infer<typeof visaFormSchema>

export const pendingVisaDocumentSchema = z.object({
  category: z.string().min(1),
  fileName: z.string().min(1),
  filePath: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
})

export const pendingVisaDocumentsSchema = z.array(pendingVisaDocumentSchema)

export type PendingVisaDocumentInput = z.infer<typeof pendingVisaDocumentSchema>
