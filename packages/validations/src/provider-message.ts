import { z } from 'zod'

export type MessageBodyMessages = {
  required: string
  maxLength: string
}

const defaultMessageBodyMessages: MessageBodyMessages = {
  required: 'Message can\'t be empty',
  maxLength: 'Message must be under 2000 characters',
}

export function getMessageBodySchema(messages: MessageBodyMessages = defaultMessageBodyMessages) {
  return z.object({
    body: z.string().min(1, messages.required).max(2000, messages.maxLength),
  })
}

export const messageBodySchema = getMessageBodySchema()
export type MessageBodyInput = z.infer<typeof messageBodySchema>
