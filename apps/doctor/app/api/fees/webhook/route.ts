import { NextResponse } from 'next/server'
import { createServiceClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { createLogger } from '@iha/logger'
import type Stripe from 'stripe'

const logger = createLogger('doctor:fees-webhook')

// Supabase TypeScript generics resolve .insert()/.update() params as `never` for
// these tables in strict TS projects. Bypass with manually-typed views of the
// client, scoped to exactly the call shape used at each site — same pattern
// used in apps/patient/app/api/payments/webhook/route.ts.
type UpdateEqSelectClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: { id: string; doctor_id: string; fee_type: string } | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

type UpdateEqClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

type InsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  }
}

type SelectSingleClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { user_id: string | null } | null
          error: { message: string } | null
        }>
      }
    }
  }
}

export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error({}, 'STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature!, webhookSecret)
  } catch (err) {
    logger.error({ err }, 'signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent

    const { data: matchedPayment, error: paymentUpdateError } = await (supabase as unknown as UpdateEqSelectClient)
      .from('doctor_fee_payments')
      .update({ status: 'completed', gateway_reference: intent.id, paid_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', intent.id)
      .select('id, doctor_id, fee_type')
      .maybeSingle()

    if (paymentUpdateError) {
      logger.error({ paymentUpdateError, intentId: intent.id }, 'doctor_fee_payments update failed')
    }

    if (!matchedPayment) {
      logger.error({ intentId: intent.id }, 'no doctor_fee_payments row matched stripe_payment_intent_id')
      return NextResponse.json({ received: true })
    }

    const nowIso = new Date().toISOString()

    if (matchedPayment.fee_type === 'registration') {
      const { error: doctorUpdateError } = await (supabase as unknown as UpdateEqClient)
        .from('doctors')
        .update({
          registration_fee_paid_at: nowIso,
          annual_fee_next_due_at: addYears(new Date(), 1),
        })
        .eq('id', matchedPayment.doctor_id)

      if (doctorUpdateError) {
        logger.error({ doctorUpdateError, doctorId: matchedPayment.doctor_id }, 'registration fee doctor update failed')
      }
    } else if (matchedPayment.fee_type === 'annual') {
      const { data: doctorRow } = await supabase
        .from('doctors')
        .select('annual_fee_next_due_at')
        .eq('id', matchedPayment.doctor_id)
        .maybeSingle()

      const currentDueAt = (doctorRow as { annual_fee_next_due_at: string | null } | null)?.annual_fee_next_due_at

      const { error: doctorUpdateError } = await (supabase as unknown as UpdateEqClient)
        .from('doctors')
        .update({
          annual_fee_next_due_at: addYears(currentDueAt ? new Date(currentDueAt) : new Date(), 1),
          annual_fee_reminder_sent_for: null,
        })
        .eq('id', matchedPayment.doctor_id)

      if (doctorUpdateError) {
        logger.error({ doctorUpdateError, doctorId: matchedPayment.doctor_id }, 'annual fee doctor update failed')
      }
    }

    const { data: doctorAccount } = await (supabase as unknown as SelectSingleClient)
      .from('doctors')
      .select('user_id')
      .eq('id', matchedPayment.doctor_id)
      .maybeSingle()

    if (doctorAccount?.user_id) {
      const { error: notifyError } = await (supabase as unknown as InsertClient).from('notifications').insert({
        user_id: doctorAccount.user_id,
        type: matchedPayment.fee_type === 'registration' ? 'registration_fee_paid' : 'annual_fee_paid',
        title: matchedPayment.fee_type === 'registration' ? 'Registration fee paid' : 'Annual fee paid',
        message:
          matchedPayment.fee_type === 'registration'
            ? 'Your registration fee has been received. Welcome to MTA — your dashboard is now unlocked.'
            : 'Your annual renewal fee has been received. Thank you.',
      })
      if (notifyError) {
        logger.error({ notifyError, doctorId: matchedPayment.doctor_id }, 'doctor fee notification insert failed')
      }
    }

    await (supabase as unknown as InsertClient).from('audit_logs').insert({
      app: 'doctor',
      action: 'fee.payment_completed',
      entity_type: 'doctor_fee_payment',
      entity_id: matchedPayment.id,
      metadata: { doctor_id: matchedPayment.doctor_id, fee_type: matchedPayment.fee_type, amount: intent.amount },
    })
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent

    await (supabase as unknown as UpdateEqClient)
      .from('doctor_fee_payments')
      .update({ status: 'failed' })
      .eq('stripe_payment_intent_id', intent.id)
  }

  return NextResponse.json({ received: true })
}

function addYears(date: Date, years: number): string {
  const result = new Date(date)
  result.setFullYear(result.getFullYear() + years)
  return result.toISOString().slice(0, 10)
}
