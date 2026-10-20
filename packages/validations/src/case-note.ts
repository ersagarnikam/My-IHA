import { z } from 'zod'

export type CaseNoteBodyMessages = {
  required: string
  maxLength: string
}

const defaultCaseNoteBodyMessages: CaseNoteBodyMessages = {
  required: 'Note can\'t be empty',
  maxLength: 'Note must be under 5000 characters',
}

export function getCaseNoteBodySchema(messages: CaseNoteBodyMessages = defaultCaseNoteBodyMessages) {
  return z.object({
    body: z.string().trim().min(1, messages.required).max(5000, messages.maxLength),
  })
}

export const caseNoteBodySchema = getCaseNoteBodySchema()
export type CaseNoteBodyInput = z.infer<typeof caseNoteBodySchema>
