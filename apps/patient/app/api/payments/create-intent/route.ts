import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { upsertPendingPayment } from '@iha/db/payments'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import { fetchTreatmentOptionsForCurrentCase } from '@/lib/repositories/treatments'

const logger = createLogger('patient:payments-create-intent')

// Supabase TypeScript generics resolve .update() params as `never` for this table
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern
// used in cases.ts/chat.ts/payments.ts.
type SimpleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
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

    const { caseId } = await request.json()
    if (!caseId) {
      return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
    }

    // Verify the case belongs to this user and is in treatment_confirmed status
    const { data: patient } = await supabase
      .from('patients')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, status, reference_number')
      .eq('id', caseId)
      .eq('patient_id', (patient as { id: string }).id)
      .single()

    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    const typedCase = caseRow as { id: string; status: string; reference_number: string }
    if (!['treatment_confirmed', 'payment_confirmed'].includes(typedCase.status)) {
      return NextResponse.json({ error: 'Payment not available for this case' }, { status: 400 })
    }

    if (typedCase.status === 'payment_confirmed') {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
    }

    // Get the confirmed treatment option for this case
    const treatmentOptions = await fetchTreatmentOptionsForCurrentCase(caseId)
    const typedOption = treatmentOptions.find((o) => o.is_selected)

    if (!typedOption) {
      return NextResponse.json({ error: 'No confirmed treatment option found' }, { status: 404 })
    }

    const totalAud = typedOption.cost_breakdown?.total ?? 0
    const amountCents = Math.round(totalAud * 100)

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
    }

    // Get or create Stripe customer
    let customerId = (patient as { id: string; stripe_customer_id: string | null }).stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email })
      customerId = customer.id
      await (supabase as unknown as SimpleClient)
        .from('patients')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

    // Fetch the patient's default saved payment method (if any)
    const { data: defaultPm } = await supabase
      .from('payment_methods')
      .select('stripe_payment_method_id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle()
    const defaultPaymentMethodId = (defaultPm as { stripe_payment_method_id: string } | null)?.stripe_payment_method_id ?? null

    // Self-heal cards saved before allow_redisplay was set on attach, so the
    // Payment Element can actually redisplay them
    if (defaultPaymentMethodId) {
      await stripe.paymentMethods.update(defaultPaymentMethodId, { allow_redisplay: 'always' })
    }

    // Customer Session lets the Payment Element show the customer's saved cards
    // (with their Stripe default pre-selected) instead of a blank card form
    const customerSession = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'disabled',
          },
        },
      },
    })

    // Check for an existing pending payment intent for this case's treatment payment
    // — scoped to payment_type so this never collides with an unrelated pending
    // consultation_fee row for the same case (a case can have both in flight at once).
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('case_id', caseId)
      .eq('payment_type', 'full_payment')
      .eq('status', 'pending')
      .maybeSingle()

    const existingTyped = existingPayment as { stripe_payment_intent_id: string | null } | null

    let paymentIntentId: string
    let clientSecret: string

    if (existingTyped?.stripe_payment_intent_id) {
      // Retrieve existing intent so the patient can resume
      const intent = await stripe.paymentIntents.retrieve(existingTyped.stripe_payment_intent_id)
      if (intent.status === 'succeeded') {
        return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
      }
      // Attach default payment method to the existing intent if not already set
      if (defaultPaymentMethodId && intent.payment_method !== defaultPaymentMethodId) {
        await stripe.paymentIntents.update(intent.id, { payment_method: defaultPaymentMethodId })
      }
      paymentIntentId = intent.id
      clientSecret = intent.client_secret!
    } else {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        customer: customerId,
        ...(defaultPaymentMethodId ? { payment_method: defaultPaymentMethodId } : {}),
        metadata: {
          case_id: caseId,
          patient_id: (patient as { id: string }).id,
          treatment_option_id: typedOption.id,
          reference_number: typedCase.reference_number,
        },
        description: `MTA treatment payment — ${typedCase.reference_number}`,
      })
      paymentIntentId = intent.id
      clientSecret = intent.client_secret!
    }

    const { data: upsertedPayment } = await upsertPendingPayment({
      caseId,
      treatmentOptionId: typedOption.id,
      patientId: (patient as { id: string }).id,
      amountAud: totalAud,
      stripePaymentIntentId: paymentIntentId,
    })

    // If a concurrent request (reload, double-mount, second tab) already claimed
    // this payments row with a different intent, defer to it — never let two live
    // intents exist for the same pending row, or the webhook's lookup by
    // stripe_payment_intent_id can miss the one that actually gets paid.
    if (upsertedPayment?.stripe_payment_intent_id && upsertedPayment.stripe_payment_intent_id !== paymentIntentId) {
      logger.warn(
        { caseId, losingIntentId: paymentIntentId, winningIntentId: upsertedPayment.stripe_payment_intent_id },
        'lost payment-intent creation race; deferring to concurrent request',
      )
      try {
        await stripe.paymentIntents.cancel(paymentIntentId)
      } catch (cancelErr) {
        logger.warn({ cancelErr, paymentIntentId }, 'failed to cancel orphaned payment intent')
      }
      const winningIntent = await stripe.paymentIntents.retrieve(upsertedPayment.stripe_payment_intent_id)
      if (winningIntent.status === 'succeeded') {
        return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
      }
      paymentIntentId = winningIntent.id
      clientSecret = winningIntent.client_secret!
    }

    await logAuditEvent({
      app: 'patient',
      action: 'payment.intent_created',
      entityType: 'payment',
      entityId: paymentIntentId,
      metadata: { case_id: caseId, amount: totalAud },
    })

    return NextResponse.json({
      clientSecret,
      customerSessionClientSecret: customerSession.client_secret,
      amount: totalAud,
      hospitalName: typedOption.hospitals?.name ?? '',
      defaultPaymentMethodId,
    })
  } catch (err) {
    logger.error({ err }, 'create-intent failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
