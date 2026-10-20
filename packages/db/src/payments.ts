import { createClient } from './server'
import type { Database } from '../types'

type PaymentRow = Database['public']['Tables']['payments']['Row']

export type PaymentWithCaseInfo = PaymentRow & {
  cases: { reference_number: string }
}

// Supabase TypeScript generics resolve .rpc() args as `never` for newly added
// functions in strict TS projects. Bypass with a manually-typed RpcClient —
// same pattern used in cases.ts/consultations.ts.
type SetPaymentStripeIntentRpcClient = {
  rpc: (
    fn: 'set_payment_stripe_intent',
    args: { p_payment_id: string; p_stripe_payment_intent_id: string },
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
}

export async function fetchPaymentsForPatient(
  patientId: string,
): Promise<{ data: PaymentWithCaseInfo[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*, cases(reference_number)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as PaymentWithCaseInfo[], error: null }
}

export async function fetchLatestPaymentsForCases(
  caseIds: string[],
): Promise<{ data: Record<string, PaymentRow>; error: string | null }> {
  if (!caseIds.length) return { data: {}, error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('case_id', caseIds)
    .order('created_at', { ascending: false })

  if (error) return { data: {}, error: error.message }

  // Rows arrive newest-first per case_id, so the first one seen per case is the latest.
  const latestByCase: Record<string, PaymentRow> = {}
  for (const row of (data ?? []) as PaymentRow[]) {
    if (row.case_id && !latestByCase[row.case_id]) {
      latestByCase[row.case_id] = row
    }
  }
  return { data: latestByCase, error: null }
}

export async function fetchPaymentForCase(
  caseId: string,
): Promise<{ data: PaymentRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data as PaymentRow | null, error: null }
}

export async function upsertPendingConsultationPayment(payload: {
  caseId: string
  consultationRequestId: string
  patientId: string
  amountAud: number
  // Omitted when the pending payment row is created at slot-selection time,
  // before a Stripe PaymentIntent exists — the payment page fills this in
  // later via the same function once the patient actually opens it.
  stripePaymentIntentId?: string
}): Promise<{ data: PaymentRow | null; error: string | null }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('payments')
    .select('*')
    .eq('consultation_request_id', payload.consultationRequestId)
    .eq('status', 'pending')
    .maybeSingle()

  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (v: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } }
    }
  }

  if (existing) {
    const existingRow = existing as PaymentRow
    if (!payload.stripePaymentIntentId || existingRow.stripe_payment_intent_id) {
      // Either we have nothing new to set, or another concurrent call already
      // claimed this row's intent id — never overwrite it, just report the winner.
      return { data: existingRow, error: null }
    }

    // set_payment_stripe_intent only ever transitions stripe_payment_intent_id
    // from null, never reassigns an already-claimed one — this is the RPC's
    // own concurrency gate. If a concurrent call already won it between our
    // SELECT above and this RPC call, it returns null and we fall through to
    // re-fetch and defer to whichever call actually won.
    const { data, error } = await (supabase as unknown as SetPaymentStripeIntentRpcClient).rpc(
      'set_payment_stripe_intent',
      { p_payment_id: existingRow.id, p_stripe_payment_intent_id: payload.stripePaymentIntentId },
    )
    if (error) return { data: null, error: error.message }
    if (data) return { data: data as PaymentRow, error: null }

    const { data: winner, error: refetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', existingRow.id)
      .single()
    if (refetchError) return { data: null, error: refetchError.message }
    return { data: winner as PaymentRow, error: null }
  }

  const { data, error } = await db
    .from('payments')
    .insert({
      case_id: payload.caseId,
      consultation_request_id: payload.consultationRequestId,
      patient_id: payload.patientId,
      amount_aud: payload.amountAud,
      payment_type: 'consultation_fee',
      status: 'pending',
      gateway: 'stripe',
      stripe_payment_intent_id: payload.stripePaymentIntentId ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as PaymentRow, error: null }
}

export async function upsertPendingPayment(payload: {
  caseId: string
  treatmentOptionId: string
  patientId: string
  amountAud: number
  // Omitted when the pending payment row is created at treatment-option-selection
  // time, before a Stripe PaymentIntent exists — the payment page fills this in
  // later via the same function once the patient actually opens it.
  stripePaymentIntentId?: string
}): Promise<{ data: PaymentRow | null; error: string | null }> {
  const supabase = await createClient()

  // Check for an existing pending *treatment* payment for this case — scoped to
  // payment_type so this never collides with an unrelated pending consultation_fee
  // row for the same case (a case can have both in flight at once).
  const { data: existing } = await supabase
    .from('payments')
    .select('*')
    .eq('case_id', payload.caseId)
    .eq('payment_type', 'full_payment')
    .eq('status', 'pending')
    .maybeSingle()

  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (v: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } }
    }
  }

  if (existing) {
    const existingRow = existing as PaymentRow
    if (!payload.stripePaymentIntentId || existingRow.stripe_payment_intent_id) {
      // Either we have nothing new to set, or another concurrent call already
      // claimed this row's intent id — never overwrite it, just report the winner.
      return { data: existingRow, error: null }
    }

    // set_payment_stripe_intent only ever transitions stripe_payment_intent_id
    // from null, never reassigns an already-claimed one — this is the RPC's
    // own concurrency gate. If a concurrent call already won it between our
    // SELECT above and this RPC call, it returns null and we fall through to
    // re-fetch and defer to whichever call actually won.
    const { data, error } = await (supabase as unknown as SetPaymentStripeIntentRpcClient).rpc(
      'set_payment_stripe_intent',
      { p_payment_id: existingRow.id, p_stripe_payment_intent_id: payload.stripePaymentIntentId },
    )
    if (error) return { data: null, error: error.message }
    if (data) return { data: data as PaymentRow, error: null }

    const { data: winner, error: refetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', existingRow.id)
      .single()
    if (refetchError) return { data: null, error: refetchError.message }
    return { data: winner as PaymentRow, error: null }
  }

  const { data, error } = await db
    .from('payments')
    .insert({
      case_id: payload.caseId,
      treatment_option_id: payload.treatmentOptionId,
      patient_id: payload.patientId,
      amount_aud: payload.amountAud,
      payment_type: 'full_payment',
      status: 'pending',
      gateway: 'stripe',
      stripe_payment_intent_id: payload.stripePaymentIntentId ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as PaymentRow, error: null }
}
