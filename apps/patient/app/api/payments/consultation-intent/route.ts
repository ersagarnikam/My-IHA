import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { upsertPendingConsultationPayment } from '@iha/db/payments'
import { CONSULTATION_FEE_AUD } from '@iha/db/consultations'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:payments-consultation-intent')

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

    const { consultationRequestId } = await request.json()
    if (!consultationRequestId) {
      return NextResponse.json({ error: 'consultationRequestId is required' }, { status: 400 })
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }
    const typedPatient = patient as { id: string; stripe_customer_id: string | null }

    const { data: consultation } = await supabase
      .from('consultation_requests')
      .select('id, case_id, status, patient_id, cases(reference_number)')
      .eq('id', consultationRequestId)
      .eq('patient_id', typedPatient.id)
      .single()

    if (!consultation) {
      return NextResponse.json({ error: 'Consultation request not found' }, { status: 404 })
    }

    const typedConsultation = consultation as {
      id: string
      case_id: string
      status: string
      patient_id: string
      cases: { reference_number: string } | null
    }

    if (typedConsultation.status !== 'slot_selected') {
      return NextResponse.json({ error: 'This consultation is not awaiting payment' }, { status: 400 })
    }

    const amountCents = Math.round(CONSULTATION_FEE_AUD * 100)

    let customerId = typedPatient.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email })
      customerId = customer.id
      await (supabase as unknown as SimpleClient)
        .from('patients')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

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

    const { data: existingPayment } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('consultation_request_id', consultationRequestId)
      .eq('status', 'pending')
      .maybeSingle()

    const existingTyped = existingPayment as { stripe_payment_intent_id: string | null } | null

    let paymentIntentId: string
    let clientSecret: string

    if (existingTyped?.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(existingTyped.stripe_payment_intent_id)
      if (intent.status === 'succeeded') {
        return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
      }
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
          consultation_request_id: consultationRequestId,
          case_id: typedConsultation.case_id,
          patient_id: typedPatient.id,
        },
        description: `MTA online consultation fee — ${typedConsultation.cases?.reference_number ?? ''}`,
      })
      paymentIntentId = intent.id
      clientSecret = intent.client_secret!
    }

    const { data: upsertedPayment } = await upsertPendingConsultationPayment({
      caseId: typedConsultation.case_id,
      consultationRequestId,
      patientId: typedPatient.id,
      amountAud: CONSULTATION_FEE_AUD,
      stripePaymentIntentId: paymentIntentId,
    })

    // If a concurrent request (reload, double-mount, second tab) already claimed
    // this payments row with a different intent, defer to it — never let two live
    // intents exist for the same pending row, or the webhook's lookup by
    // stripe_payment_intent_id can miss the one that actually gets paid.
    if (upsertedPayment?.stripe_payment_intent_id && upsertedPayment.stripe_payment_intent_id !== paymentIntentId) {
      logger.warn(
        { consultationRequestId, losingIntentId: paymentIntentId, winningIntentId: upsertedPayment.stripe_payment_intent_id },
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
      metadata: { consultation_request_id: consultationRequestId, amount: CONSULTATION_FEE_AUD },
    })

    return NextResponse.json({
      clientSecret,
      customerSessionClientSecret: customerSession.client_secret,
      amount: CONSULTATION_FEE_AUD,
      defaultPaymentMethodId,
    })
  } catch (err) {
    logger.error({ err }, 'consultation-intent failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
