'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import { markNotificationRead, markAllNotificationsRead } from '@iha/db/notifications'

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function markNotificationAsRead(id: string): Promise<{ error: string | null }> {
  const userId = await getAuthenticatedUserId()
  if (!userId) return { error: 'Unauthenticated' }

  const { error } = await markNotificationRead(id, userId)
  if (!error) revalidatePath('/notifications')
  return { error }
}

export async function markAllNotificationsAsRead(): Promise<{ error: string | null }> {
  const userId = await getAuthenticatedUserId()
  if (!userId) return { error: 'Unauthenticated' }

  const { error } = await markAllNotificationsRead(userId)
  if (!error) revalidatePath('/notifications')
  return { error }
}
