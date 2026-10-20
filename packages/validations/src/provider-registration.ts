import { z } from 'zod'
import { emailField, passwordField } from './auth'

/** Step 1 of both wizards — identical shape for hospital and doctor registration. */
export const registrationAccountStepSchema = z
  .object({
    loginEmail: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type RegistrationAccountInput = z.infer<typeof registrationAccountStepSchema>

/** Final step of both wizards — client-side gate only, nothing persisted. */
export const agreementStepSchema = z.object({
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms & Conditions' }),
  }),
  confirmedAccuracy: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm the details provided are correct' }),
  }),
})

export type AgreementInput = z.infer<typeof agreementStepSchema>
