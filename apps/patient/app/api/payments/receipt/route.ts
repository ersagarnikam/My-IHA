import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { createLogger } from '@iha/logger'
import type Stripe from 'stripe'

const logger = createLogger('patient:payments-receipt')

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const intentId = searchParams.get('intentId')

    if (!intentId) {
      return NextResponse.json({ error: 'intentId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { data: paymentData } = await supabase
      .from('payments')
      .select('id, status, patient_id')
      .eq('stripe_payment_intent_id', intentId)
      .eq('status', 'completed')
      .maybeSingle()

    const payment = paymentData as unknown as { id: string; status: string; patient_id: string } | null

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Verify this payment belongs to the current user
    const { data: patientData } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const patient = patientData as unknown as { id: string } | null

    if (!patient || patient.id !== payment.patient_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ['latest_charge'],
    })

    const charge = intent.latest_charge as Stripe.Charge | null
    const receiptUrl = charge?.receipt_url

    if (!receiptUrl) {
      return NextResponse.json({ error: 'Receipt not available yet' }, { status: 404 })
    }

    return NextResponse.json({ receiptUrl })
  } catch (err) {
    logger.error({ err }, 'receipt fetch failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
