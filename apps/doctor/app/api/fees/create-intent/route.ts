import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { getOrCreatePendingFeePayment, setDoctorFeePaymentStripeIntent } from '@iha/db/doctor-fees'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import { stripe } from '@/lib/stripe'

const logger = createLogger('doctor:fees-create-intent')

const FEE_TYPES = new Set(['registration', 'annual'])

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { feeType } = await request.json()
    if (!FEE_TYPES.has(feeType)) {
      return NextResponse.json({ error: 'feeType must be "registration" or "annual"' }, { status: 400 })
    }

    // Validates eligibility (approved / not already paid / due date reached)
    // and reads the amount from platform_fee_settings server-side — the
    // client never supplies or sees an amount before this point.
    const { data: pendingPayment, error: rpcError } = await getOrCreatePendingFeePayment(feeType)
    if (rpcError || !pendingPayment) {
      logger.warn({ rpcError, userId: user.id, feeType }, 'create_doctor_fee_payment RPC failed')
      return NextResponse.json({ error: 'Payment not available' }, { status: 400 })
    }

    const amountCents = Math.round(pendingPayment.amount_aud * 100)

    let paymentIntentId: string
    let clientSecret: string

    if (pendingPayment.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(pendingPayment.stripe_payment_intent_id)
      if (intent.status === 'succeeded') {
        return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
      }
      paymentIntentId = intent.id
      clientSecret = intent.client_secret!
    } else {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        metadata: {
          doctor_id: pendingPayment.doctor_id,
          fee_type: pendingPayment.fee_type,
          doctor_fee_payment_id: pendingPayment.id,
        },
        description: `MTA doctor ${pendingPayment.fee_type} fee`,
      })
      paymentIntentId = intent.id
      clientSecret = intent.client_secret!

      const { data: claimed } = await setDoctorFeePaymentStripeIntent(pendingPayment.id, paymentIntentId)

      // Lost a creation race (reload/double-mount) — defer to whichever
      // request actually won, same reconciliation as
      // apps/patient/app/api/payments/create-intent/route.ts.
      if (claimed?.stripe_payment_intent_id && claimed.stripe_payment_intent_id !== paymentIntentId) {
        logger.warn(
          { userId: user.id, losingIntentId: paymentIntentId, winningIntentId: claimed.stripe_payment_intent_id },
          'lost payment-intent creation race; deferring to concurrent request',
        )
        try {
          await stripe.paymentIntents.cancel(paymentIntentId)
        } catch (cancelErr) {
          logger.warn({ cancelErr, paymentIntentId }, 'failed to cancel orphaned payment intent')
        }
        const winningIntent = await stripe.paymentIntents.retrieve(claimed.stripe_payment_intent_id)
        if (winningIntent.status === 'succeeded') {
          return NextResponse.json({ error: 'Payment already completed' }, { status: 400 })
        }
        paymentIntentId = winningIntent.id
        clientSecret = winningIntent.client_secret!
      }
    }

    await logAuditEvent({
      app: 'doctor',
      action: 'fee.intent_created',
      entityType: 'doctor_fee_payment',
      entityId: paymentIntentId,
      metadata: { fee_type: feeType, amount: pendingPayment.amount_aud },
    })

    return NextResponse.json({ clientSecret, amount: pendingPayment.amount_aud, feeType })
  } catch (err) {
    logger.error({ err }, 'create-intent failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
