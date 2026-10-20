import { syncPatientNameFromAuth } from '@/lib/repositories/patients'

type AuthUserForSync = {
  id: string
  user_metadata?: Record<string, unknown>
  identities?: Array<{ identity_data?: Record<string, unknown> }>
}

/** Sync display name from auth metadata (e.g. Apple first OAuth login) onto patients row. */
export async function syncPatientProfileFromAuthUser(user: AuthUserForSync): Promise<void> {
  const identityData = user.identities?.[0]?.identity_data as
    | { full_name?: string; name?: string }
    | undefined

  const fullName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
    (typeof identityData?.full_name === 'string' && identityData.full_name) ||
    (typeof identityData?.name === 'string' && identityData.name) ||
    null

  if (!fullName) return

  await syncPatientNameFromAuth(fullName)
}
