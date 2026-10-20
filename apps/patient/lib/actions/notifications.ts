'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { markNotificationRead, markAllNotificationsRead } from '@iha/db/notifications'
import { fetchVisaSubmissionForCase } from '@iha/db/visa'
import type { Result } from '@iha/validations'
import type { Notification } from '@iha/db/types'
import { getTranslations } from 'next-intl/server'
import { VISA_NOTIFICATION_TYPES } from '@/lib/notification-routing'

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function markNotificationAsRead(id: string): Promise<Result<{ success: true }>> {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    const t = await getTranslations('actionErrors')
    return { data: null, error: t('common.unauthenticated') }
  }

  const { error } = await markNotificationRead(id, userId)
  if (error) return { data: null, error }
  revalidatePath('/notifications')
  return { data: { success: true }, error: null }
}

/**
 * Resolves where a notification click should land. Visa notifications only
 * carry a case_id, not the visa_submission_id that /visa-travel/[id] needs —
 * resolved here (server-side, RLS-scoped) so the client can router.push
 * straight to the final URL instead of bouncing through a redirect page.
 */
export async function resolveNotificationHref(
  notification: Pick<Notification, 'case_id' | 'type'>,
): Promise<string | null> {
  if (!notification.case_id) return null
  if (!VISA_NOTIFICATION_TYPES.has(notification.type)) return `/cases/${notification.case_id}`

  const { data: submission } = await fetchVisaSubmissionForCase(notification.case_id)
  return submission ? `/visa-travel/${submission.id}` : '/visa-travel?tab=visa'
}

export async function markAllNotificationsAsRead(): Promise<Result<{ success: true }>> {
  const userId = await getAuthenticatedUserId()
  if (!userId) {
    const t = await getTranslations('actionErrors')
    return { data: null, error: t('common.unauthenticated') }
  }

  const { error } = await markAllNotificationsRead(userId)
  if (error) return { data: null, error }
  revalidatePath('/notifications')
  return { data: { success: true }, error: null }
}
