import { z } from 'zod'

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')

export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[0-9]/, 'Password must include at least one number')

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
})

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z
    .string()
    .length(6, 'Enter the 6-digit code')
    .regex(/^\d{6}$/, 'OTP must be 6 digits'),
})

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type LoginInput = z.output<typeof loginSchema>
export type LoginFormValues = z.input<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const oauthProviders = ['google', 'apple', 'azure'] as const
export type OAuthProvider = (typeof oauthProviders)[number]
