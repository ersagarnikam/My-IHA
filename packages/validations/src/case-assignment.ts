import { z } from 'zod'

export type DeclineReasonMessages = {
  reasonMaxLength: string
}

const defaultDeclineReasonMessages: DeclineReasonMessages = {
  reasonMaxLength: 'Reason must be under 500 characters',
}

export function getDeclineReasonSchema(messages: DeclineReasonMessages = defaultDeclineReasonMessages) {
  return z.object({
    reason: z.string().max(500, messages.reasonMaxLength).optional(),
  })
}

export const declineReasonSchema = getDeclineReasonSchema()
export type DeclineReasonInput = z.infer<typeof declineReasonSchema>

export type AdditionalInfoRequestMessages = {
  messageMinLength: string
  messageMaxLength: string
}

const defaultAdditionalInfoRequestMessages: AdditionalInfoRequestMessages = {
  messageMinLength: 'Please describe what you need in at least 10 characters',
  messageMaxLength: 'Message must be under 1000 characters',
}

export function getAdditionalInfoRequestSchema(
  messages: AdditionalInfoRequestMessages = defaultAdditionalInfoRequestMessages,
) {
  return z.object({
    message: z.string().min(10, messages.messageMinLength).max(1000, messages.messageMaxLength),
  })
}

export const additionalInfoRequestSchema = getAdditionalInfoRequestSchema()
export type AdditionalInfoRequestInput = z.infer<typeof additionalInfoRequestSchema>
