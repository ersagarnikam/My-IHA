import { createClient } from '@iha/db/server'
import type { LawyerStatus } from '@/types'

export type Account = {
  role: 'lawyer'
  id: string
  displayName: string
  status: LawyerStatus
  rejectionReason: string | null
  moreInfoMessage: string | null
}

/**
 * A signed-in user maps to exactly one lawyers row — this is the single
 * lookup both login redirect and dashboard gating use to find out whether
 * one exists yet, and what its approval status is.
 */
export async function getAccountForUser(userId: string): Promise<Account | null> {
  const supabase = await createClient()

  const { data: lawyer } = await supabase
    .from('lawyers')
    .select('id, name, status, rejection_reason, more_info_message')
    .eq('user_id', userId)
    .maybeSingle()

  if (!lawyer) return null

  return {
    role: 'lawyer',
    id: lawyer.id,
    displayName: lawyer.name,
    status: lawyer.status as LawyerStatus,
    rejectionReason: lawyer.rejection_reason,
    moreInfoMessage: lawyer.more_info_message,
  }
}
