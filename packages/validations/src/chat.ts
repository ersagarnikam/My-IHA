import { z } from 'zod'

export type ReopenRequestMessages = {
  reasonMinLength: string
  reasonMaxLength: string
}

const defaultReopenRequestMessages: ReopenRequestMessages = {
  reasonMinLength: 'Please describe your reason in at least 10 characters',
  reasonMaxLength: 'Reason must be under 500 characters',
}

export function getReopenRequestSchema(messages: ReopenRequestMessages = defaultReopenRequestMessages) {
  return z.object({
    reason: z.string().min(10, messages.reasonMinLength).max(500, messages.reasonMaxLength),
  })
}

export const reopenRequestSchema = getReopenRequestSchema()
export type ReopenRequestInput = z.infer<typeof reopenRequestSchema>
