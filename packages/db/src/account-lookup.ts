import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types'

export type AccountRole = 'patient' | 'hospital' | 'doctor' | 'lawyer'

const ROLE_TABLES: ReadonlyArray<readonly [AccountRole, 'patients' | 'hospitals' | 'doctors' | 'lawyers']> = [
  ['patient', 'patients'],
  ['hospital', 'hospitals'],
  ['doctor', 'doctors'],
  ['lawyer', 'lawyers'],
]

/**
 * Every portal shares one Supabase auth pool, so a valid credential doesn't
 * imply the right role — only a row in that role's own table does. A missing
 * row in *your own* table is ambiguous (no account at all vs. mid-registration
 * wizard), so login checks can't rely on it alone. This checks the *other*
 * role tables for a positive match, which unambiguously means "this
 * credential belongs to a different portal" — used to reject cross-portal
 * logins (e.g. a patient signing into the hospital/doctor/visa portal)
 * instead of silently treating them as a new registrant.
 */
export async function findOtherRoleAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  excludeRoles: readonly AccountRole[],
): Promise<AccountRole | null> {
  for (const [role, table] of ROLE_TABLES) {
    if (excludeRoles.includes(role)) continue
    const { data } = await supabase.from(table).select('id').eq('user_id', userId).maybeSingle()
    if (data) return role
  }

  return null
}
