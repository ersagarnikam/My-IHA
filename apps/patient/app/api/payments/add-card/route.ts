import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:payments-add-card')

// Supabase TypeScript generics resolve .insert()/.update() params as `never` for these
// tables in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern
// used in cases.ts/chat.ts/payments.ts.
type SimpleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
    }
    insert: (payload: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{
          data: Record<string, unknown> | null
          error: { message: string } | null
        }>
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { paymentMethodId } = await request.json()
    if (!paymentMethodId) {
      return NextResponse.json({ error: 'paymentMethodId is required' }, { status: 400 })
    }

    // Get or create Stripe customer
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (patientError) {
      logger.error({ err: patientError }, 'fetch patient failed')
      return NextResponse.json({ error: 'Failed to load account details.' }, { status: 500 })
    }

    const typedPatient = patient as { stripe_customer_id: string | null } | null
    let customerId = typedPatient?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email })
      customerId = customer.id

      const { error: updateError } = await (supabase as unknown as SimpleClient)
        .from('patients')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)

      if (updateError) {
        logger.error({ err: updateError }, 'save stripe_customer_id failed')
        return NextResponse.json({ error: 'Failed to save payment method.' }, { status: 500 })
      }
    }

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })

    // Mark it eligible for redisplay so the Payment Element can show it as a saved card
    await stripe.paymentMethods.update(paymentMethodId, { allow_redisplay: 'always' })

    // Retrieve card details
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    const card = pm.card!

    // Determine if this is the first card
    const { count } = await supabase
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const isFirst = (count ?? 0) === 0

    // If this is the first card, set it as default on the Stripe customer too
    if (isFirst) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      })
    }

    const { data, error } = await (supabase as unknown as SimpleClient)
      .from('payment_methods')
      .insert({
        user_id: user.id,
        stripe_payment_method_id: paymentMethodId,
        last4: card.last4,
        brand: card.brand,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        is_default: isFirst,
      })
      .select()
      .single()

    if (error) {
      logger.error({ err: error }, 'insert payment_method failed')
      return NextResponse.json({ error: 'Failed to save payment method.' }, { status: 500 })
    }

    await logAuditEvent({
      app: 'patient',
      action: 'payment.method_added',
      entityType: 'payment_method',
      entityId: (data as { id: string }).id,
      metadata: { brand: card.brand, last4: card.last4 },
    })

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'add-card failed')
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
