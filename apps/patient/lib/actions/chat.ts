'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { sendPatientChatMessage, markChatMessagesRead, requestChatThreadReopen } from '@iha/db/chat'
import { getTranslations } from 'next-intl/server'
import { createLogger } from '@iha/logger'
import type { Result } from '@iha/validations'

const logger = createLogger('patient:chat')

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function sendChatMessage(threadId: string, body: string): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const trimmed = body.trim()
  if (!trimmed) return { data: null, error: t('chat.messageEmpty') }

  const { error } = await sendPatientChatMessage(threadId, userId, trimmed)
  if (error) {
    logger.error({ err: error, threadId }, 'sendChatMessage failed')
    return { data: null, error: t('chat.sendFailed') }
  }

  revalidatePath('/messages')
  return { data: { success: true }, error: null }
}

export async function markChatMessagesAsRead(threadId: string): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const { error } = await markChatMessagesRead(threadId)
  if (error) {
    logger.error({ err: error, threadId }, 'markChatMessagesAsRead failed')
    return { data: null, error: t('chat.markReadFailed') }
  }

  revalidatePath('/messages')
  return { data: { success: true }, error: null }
}

export async function requestThreadReopen(threadId: string, reason: string): Promise<Result<{ success: true }>> {
  const t = await getTranslations('actionErrors')
  const userId = await getAuthenticatedUserId()
  if (!userId) return { data: null, error: t('common.unauthenticated') }

  const trimmed = reason.trim()
  if (!trimmed) return { data: null, error: t('chat.reasonRequired') }

  const { error } = await requestChatThreadReopen(threadId, trimmed)
  if (error) {
    logger.error({ err: error, threadId }, 'requestThreadReopen failed')
    return { data: null, error: t('chat.reopenRequestFailed') }
  }

  revalidatePath('/messages')
  return { data: { success: true }, error: null }
}
