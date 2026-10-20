import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:payments-set-default')

// Supabase TypeScript generics resolve .update() params as `never` for this table
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern
// used in cases.ts/chat.ts/payments.ts. `eq` is both awaitable directly and further
// chainable, matching the real (thenable) Postgrest builder.
type EqChain = Promise<{ error: { message: string } | null }> & {
  eq: (col: string, val: string) => EqChain
}

type SimpleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => EqChain
    }
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Fetch the row being set as default to get the Stripe PM id
  const { data: pmRow } = await supabase
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!pmRow) {
    return NextResponse.json({ error: 'Payment method not found' }, { status: 404 })
  }

  // Also fetch the patient's Stripe customer id
  const { data: patient } = await supabase
    .from('patients')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  const typedPatient = patient as { stripe_customer_id: string | null } | null
  const customerId = typedPatient?.stripe_customer_id
  const stripePmId = (pmRow as { stripe_payment_method_id: string }).stripe_payment_method_id

  // Tell Stripe which card is the customer's default so PaymentElement pre-selects it
  if (customerId && stripePmId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: stripePmId },
    })
  }

  // Unset all existing defaults in our DB
  await (supabase as unknown as SimpleClient)
    .from('payment_methods')
    .update({ is_default: false })
    .eq('user_id', user.id)

  // Set the selected one as default
  const { error } = await (supabase as unknown as SimpleClient)
    .from('payment_methods')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    logger.error({ err: error }, 'set-default failed')
    return NextResponse.json({ error: 'Failed to update default payment method.' }, { status: 500 })
  }

  await logAuditEvent({
    app: 'patient',
    action: 'payment.method_set_default',
    entityType: 'payment_method',
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
