import { createServiceClient } from './server'

// The `email_already_registered` RPC is not present in the generated Database
// types (see packages/db/types/database.types.ts), so `.rpc()` is typed
// explicitly here instead of falling back to `any`.
type EmailLookupClient = {
  rpc(
    fn: 'email_already_registered',
    args: { p_email: string },
  ): Promise<{ data: boolean | null; error: { message: string } | null }>
}

/** Shared across every portal's self-registration flow — checks the `email_already_registered` RPC via the service-role client. */
export async function checkEmailAlreadyRegistered(
  email: string,
): Promise<{ data: boolean | null; error: string | null }> {
  const serviceClient = createServiceClient() as unknown as EmailLookupClient
  const { data, error } = await serviceClient.rpc('email_already_registered', { p_email: email })
  return { data, error: error?.message ?? null }
}
