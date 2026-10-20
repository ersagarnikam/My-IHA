import { createClient } from './server'

// Hand-declared to match the 20260826* migrations — swap for the generated
// `Database['public']['Tables']['doctor_fee_payments']['Row']` /
// `['platform_fee_settings']['Row']` once `pnpm db:types` has been run
// against a database with these migrations applied.
export type DoctorFeePaymentRow = {
  id: string
  doctor_id: string
  fee_type: 'registration' | 'annual'
  billing_period: string | null
  amount_aud: number
  status: 'pending' | 'completed' | 'failed'
  gateway: string
  gateway_reference: string | null
  stripe_payment_intent_id: string | null
  invoice_path: string | null
  paid_at: string | null
  created_at: string
}

export type PlatformFeeSettings = {
  doctorRegistrationFeeAud: number
  doctorAnnualFeeAud: number
}

// Supabase TypeScript generics resolve .rpc() args as `never` for newly added
// functions until `pnpm db:types` regenerates the client's function map.
// Bypass with a manually-typed RpcClient — same pattern used in payments.ts.
type CreateDoctorFeePaymentRpcClient = {
  rpc: (
    fn: 'create_doctor_fee_payment',
    args: { p_fee_type: 'registration' | 'annual' },
  ) => Promise<{ data: DoctorFeePaymentRow | null; error: { message: string } | null }>
}

type SetDoctorFeePaymentStripeIntentRpcClient = {
  rpc: (
    fn: 'set_doctor_fee_payment_stripe_intent',
    args: { p_payment_id: string; p_stripe_payment_intent_id: string },
  ) => Promise<{ data: DoctorFeePaymentRow | null; error: { message: string } | null }>
}

export async function fetchFeeSettings(): Promise<{
  data: PlatformFeeSettings | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platform_fee_settings')
    .select('fee_key, amount_aud')
    .in('fee_key', ['doctor_registration_fee', 'doctor_annual_fee'])

  if (error) return { data: null, error: error.message }

  const rows = (data ?? []) as { fee_key: string; amount_aud: number }[]
  const registration = rows.find((r) => r.fee_key === 'doctor_registration_fee')
  const annual = rows.find((r) => r.fee_key === 'doctor_annual_fee')

  if (!registration || !annual) {
    return { data: null, error: 'Fee settings not configured' }
  }

  return {
    data: {
      doctorRegistrationFeeAud: registration.amount_aud,
      doctorAnnualFeeAud: annual.amount_aud,
    },
    error: null,
  }
}

export async function fetchDoctorFeePayments(
  doctorId: string,
): Promise<{ data: DoctorFeePaymentRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctor_fee_payments')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as DoctorFeePaymentRow[], error: null }
}

// Get-or-creates the caller's pending payment row for the given fee type via
// create_doctor_fee_payment (security definer — validates eligibility and
// reads the amount from platform_fee_settings server-side, never from the
// client). Idempotent: a reload/double-mount of the payment page returns the
// same pending row instead of creating a second one.
export async function getOrCreatePendingFeePayment(
  feeType: 'registration' | 'annual',
): Promise<{ data: DoctorFeePaymentRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as CreateDoctorFeePaymentRpcClient).rpc(
    'create_doctor_fee_payment',
    { p_fee_type: feeType },
  )

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

// The only client-writable path onto stripe_payment_intent_id — see
// set_doctor_fee_payment_stripe_intent in
// 20260826000003_add_doctor_fee_rpcs.sql for the concurrency rationale
// (mirrors set_payment_stripe_intent in payments.ts).
export async function setDoctorFeePaymentStripeIntent(
  paymentId: string,
  stripePaymentIntentId: string,
): Promise<{ data: DoctorFeePaymentRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as SetDoctorFeePaymentStripeIntentRpcClient).rpc(
    'set_doctor_fee_payment_stripe_intent',
    { p_payment_id: paymentId, p_stripe_payment_intent_id: stripePaymentIntentId },
  )

  if (error) return { data: null, error: error.message }
  return { data, error: null }
}
