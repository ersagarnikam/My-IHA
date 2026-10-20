import { z } from 'zod'
import { lawyerDetailsStepSchema } from '@/lib/validations/lawyer-registration'

// Reuses the registration wizard's step schema for the Personal Info tab's
// two cards — same fields, same validation rules, so a lawyer editing their
// account is held to the same bar as one registering for the first time.
// Contact email isn't part of either schema: like the registration wizard,
// the account settings page displays the account's login email read-only
// instead of collecting a separate one.
export const lawyerAccountBasicInfoSchema = lawyerDetailsStepSchema.pick({
  name: true,
  registrationNumber: true,
  abnNumber: true,
  phone: true,
  address: true,
  city: true,
  zipCode: true,
})
export type LawyerAccountBasicInfoInput = z.infer<typeof lawyerAccountBasicInfoSchema>

export const lawyerAccountProfessionalSchema = lawyerDetailsStepSchema.pick({
  lawyerType: true,
  immigrationLawCertification: true,
})
export type LawyerAccountProfessionalInput = z.infer<typeof lawyerAccountProfessionalSchema>

export const lawyerNotificationPreferencesSchema = z.object({
  email_notifications_enabled: z.boolean(),
  sms_notifications_enabled: z.boolean(),
})
export type LawyerNotificationPreferencesInput = z.infer<typeof lawyerNotificationPreferencesSchema>
