'use server'

import { createClient } from '@iha/db/server'
import {
  sendProviderMessage,
  markProviderMessagesRead,
  requestProviderThreadReopen,
} from '@iha/db/provider-messages'
import { logAuditEvent } from '@iha/db/audit'
import { messageBodySchema } from '@iha/validations'
import type { Result } from '@iha/validations'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@iha/logger'
import { getAccountForUser } from '@/lib/auth/account'

const logger = createLogger('doctor:messages')

export async function sendProviderMessageAction(
  threadId: string,
  body: string,
): Promise<Result<{ success: true }>> {
  const parsed = messageBodySchema.safeParse({ body })
  if (!parsed.success) {
    return { data: null, error: 'Please enter a message.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const account = await getAccountForUser(user.id)
  if (!account) return { data: null, error: 'Unauthenticated.' }

  const { error } = await sendProviderMessage(threadId, account.role, user.id, parsed.data.body)
  if (error) {
    logger.error({ err: error }, 'sendProviderMessageAction failed')
    return { data: null, error: 'Failed to send message. Please try again.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'provider_message.sent',
    entityType: 'provider_message_thread',
    entityId: threadId,
  })

  revalidatePath('/messages')

  return { data: { success: true }, error: null }
}

export async function markProviderMessagesReadAction(threadId: string): Promise<void> {
  await markProviderMessagesRead(threadId)
  revalidatePath('/messages')
}

export async function requestProviderThreadReopenAction(
  threadId: string,
  reason: string,
): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Unauthenticated.' }

  const account = await getAccountForUser(user.id)
  if (!account) return { data: null, error: 'Unauthenticated.' }

  const trimmed = reason.trim()
  if (!trimmed) return { data: null, error: 'Reason is required.' }

  const { error } = await requestProviderThreadReopen(threadId, trimmed)
  if (error) {
    logger.error({ err: error }, 'requestProviderThreadReopenAction failed')
    return { data: null, error: 'Failed to send request. Please try again.' }
  }

  await logAuditEvent({
    app: 'doctor',
    action: 'provider_message.reopen_requested',
    entityType: 'provider_message_thread',
    entityId: threadId,
  })

  revalidatePath('/messages')

  return { data: { success: true }, error: null }
}
