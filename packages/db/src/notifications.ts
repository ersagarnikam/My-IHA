import { createClient } from './server'
import type { Database } from '../types'

type NotificationRow = Database['public']['Tables']['notifications']['Row']

// Supabase TypeScript generics resolve .update() params as `never` for this table
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern used in cases.ts.
type SimpleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string | boolean) => {
        eq: (col: string, val: string | boolean) => Promise<{ error: { message: string } | null }>
      }
    }
  }
}

export async function fetchNotificationsForUser(
  userId: string,
): Promise<{ data: NotificationRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data: (data as NotificationRow[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchNotificationsForCase(
  caseId: string,
  userId: string,
): Promise<{ data: NotificationRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('case_id', caseId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return { data: (data as NotificationRow[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchUnreadNotificationCount(
  userId: string,
): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  return { count: count ?? 0, error: error?.message ?? null }
}

export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', userId)
  return { error: error?.message ?? null }
}

export async function markAllNotificationsRead(userId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
  return { error: error?.message ?? null }
}
