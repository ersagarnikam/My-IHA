import { NextResponse } from 'next/server'
import { createServiceClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { createZoomMeeting } from '@/lib/zoom'
import { dispatchCaseStatusAlerts } from '@iha/db/cases'
import { createLogger } from '@iha/logger'
import type { Database } from '@iha/db/types'
import type Stripe from 'stripe'

const logger = createLogger('patient:payments-webhook')

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

// Supabase TypeScript generics resolve .insert()/.update() params as `never` for these
// tables in strict TS projects. Bypass with manually-typed views of the client, scoped to
// exactly the call shape used at each site — same pattern used in payments.ts/cases.ts.
type UpdateEqClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

type UpdateEqSelectClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>
        }
      }
    }
  }
}

type UpdateEqEqEqSelectSingleClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>
            }
          }
        }
      }
    }
  }
}

type UpdateEqEqSelectClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          select: (cols: string) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null
              error: { message: string } | null
            }>
          }
        }
      }
    }
  }
}

type InsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
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
    const caseId = intent.metadata.case_id
    const consultationRequestId = intent.metadata.consultation_request_id

    const paymentUpdatePayload = {
      status: 'completed',
      gateway_reference: intent.id,
      paid_at: new Date().toISOString(),
    }

    const { data: matchedPayment, error: paymentUpdateError } = await (supabase as unknown as UpdateEqSelectClient)
      .from('payments')
      .update(paymentUpdatePayload)
      .eq('stripe_payment_intent_id', intent.id)
      .select('id')
      .maybeSingle()

    if (paymentUpdateError) {
      logger.error({ paymentUpdateError, intentId: intent.id }, 'payments update by stripe_payment_intent_id failed')
    }

    if (!matchedPayment) {
      // Known failure mode: a race in the intent-creation route can leave a
      // payments row pointing at a different (orphaned) intent id than the one
      // Stripe actually confirmed. Fall back to matching the still-pending row
      // by whichever entity this intent belongs to, and log loudly either way
      // since this should be rare now that route.ts closes that race.
      const fallbackColumn = consultationRequestId ? 'consultation_request_id' : 'case_id'
      const fallbackValue = consultationRequestId ?? caseId
      // A case can have a pending consultation_fee row and a pending full_payment
      // row at the same time — without this, the fallback below could match either
      // one and .maybeSingle() would error out on two rows instead of reconciling.
      const fallbackPaymentType = consultationRequestId ? 'consultation_fee' : 'full_payment'

      logger.warn(
        { intentId: intent.id, caseId, consultationRequestId },
        'no payments row matched stripe_payment_intent_id; attempting metadata fallback match',
      )

      if (fallbackValue) {
        const { data: fallbackMatched, error: fallbackError } = await (supabase as unknown as UpdateEqEqEqSelectSingleClient)
          .from('payments')
          .update(paymentUpdatePayload)
          .eq(fallbackColumn, fallbackValue)
          .eq('payment_type', fallbackPaymentType)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle()

        if (fallbackError) {
          logger.error({ fallbackError, intentId: intent.id }, 'fallback payments update also failed')
        } else if (!fallbackMatched) {
          logger.error(
            { intentId: intent.id, caseId, consultationRequestId },
            'no pending payments row found for succeeded payment intent — manual reconciliation required',
          )
        } else {
          logger.warn(
            { intentId: intent.id, fallbackColumn, fallbackValue },
            'payments row reconciled via metadata fallback match',
          )
        }
      }
    }

    if (consultationRequestId) {
      await handleConsultationPaymentSucceeded(supabase, consultationRequestId, intent.id)
    } else if (caseId) {
      // In-portal notification is handled by the cases_notify_status_change DB
      // trigger, which fires on this update regardless of how it was made.
      // Only dispatch email/SMS when this app code is what made the change —
      // guarded by `.select().maybeSingle()` actually matching a row, so a
      // Stripe retry (which won't match treatment_confirmed a second time)
      // doesn't re-send alerts for an update that didn't happen.
      const { data: updatedCase } = await (supabase as unknown as UpdateEqEqSelectClient)
        .from('cases')
        .update({ status: 'payment_confirmed' })
        .eq('id', caseId)
        .eq('status', 'treatment_confirmed')
        .select('id')
        .maybeSingle()

      if (updatedCase) {
        await dispatchCaseStatusAlerts(supabase, caseId, 'payment_confirmed')

        // Advances the doctor's treatment plan to 'patient_confirmed' so the
        // doctor/hospital notification trigger (treatment_plans_notify_patient_confirmed,
        // 20260819010000) fires. treatment_option_id comes from the intent metadata
        // set in create-intent/route.ts; treatment_options.treatment_plan_id is the
        // link back to the plan this option was generated from (module 05).
        const treatmentOptionId = intent.metadata.treatment_option_id
        if (treatmentOptionId) {
          const { data: option } = await supabase
            .from('treatment_options')
            .select('treatment_plan_id')
            .eq('id', treatmentOptionId)
            .maybeSingle()

          if (option?.treatment_plan_id) {
            const { error: planUpdateError } = await (supabase as unknown as UpdateEqClient)
              .from('treatment_plans')
              .update({ status: 'patient_confirmed', updated_at: new Date().toISOString() })
              .eq('id', option.treatment_plan_id)

            if (planUpdateError) {
              logger.error({ planUpdateError, treatmentOptionId, caseId }, 'treatment_plans patient_confirmed update failed')
            }
          }
        }
      }
    }

    await (supabase as unknown as InsertClient).from('audit_logs').insert({
      app: 'patient',
      action: consultationRequestId ? 'consultation.payment_completed' : 'payment.completed',
      entity_type: 'payment',
      entity_id: intent.id,
      metadata: {
        case_id: caseId ?? null,
        consultation_request_id: consultationRequestId ?? null,
        amount: intent.amount,
      },
    })
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent

    await (supabase as unknown as UpdateEqClient)
      .from('payments')
      .update({ status: 'failed' })
      .eq('stripe_payment_intent_id', intent.id)
  }

  return NextResponse.json({ received: true })
}

async function handleConsultationPaymentSucceeded(
  supabase: ServiceClient,
  consultationRequestId: string,
  paymentIntentId: string,
) {
  // Atomically claim this consultation before touching Zoom or dispatching anything.
  // A conditioned update (only matching status = 'slot_selected') is the concurrency
  // gate: if two webhook deliveries for the same event race (a Stripe retry, or two
  // concurrent invocations), only one of them actually flips the row to 'scheduled'
  // and gets rows back here — the other sees zero rows matched and returns early,
  // before ever calling createZoomMeeting. zoom_link is filled in with a separate
  // update below; since that one doesn't touch `status`, the
  // `after update of status` notify trigger won't fire a second time for it.
  const { data: claimedData } = await (supabase as unknown as UpdateEqEqSelectClient)
    .from('consultation_requests')
    .update({ status: 'scheduled', updated_at: new Date().toISOString() })
    .eq('id', consultationRequestId)
    .eq('status', 'slot_selected')
    .select('id, case_id, patient_id, selected_slot_id')
    .maybeSingle()

  const consultation = claimedData as unknown as Pick<
    Database['public']['Tables']['consultation_requests']['Row'],
    'id' | 'case_id' | 'patient_id' | 'selected_slot_id'
  > | null

  if (!consultation || !consultation.selected_slot_id) {
    logger.warn({ consultationRequestId }, 'consultation not awaiting payment confirmation (already processed or in an unexpected state)')
    return
  }

  const { data: slotData } = await supabase
    .from('consultation_slots')
    .select('slot_time, slot_end_time')
    .eq('id', consultation.selected_slot_id)
    .single()

  const slot = slotData as unknown as Pick<
    Database['public']['Tables']['consultation_slots']['Row'],
    'slot_time' | 'slot_end_time'
  > | null

  const { data: caseRowData } = await supabase
    .from('cases')
    .select('reference_number')
    .eq('id', consultation.case_id)
    .single()

  const caseRow = caseRowData as Pick<
    Database['public']['Tables']['cases']['Row'],
    'reference_number'
  > | null

  let zoomLink: string | null = null
  if (slot) {
    try {
      const durationMinutes = Math.round(
        (new Date(slot.slot_end_time).getTime() - new Date(slot.slot_time).getTime()) / 60000,
      )
      const meeting = await createZoomMeeting({
        topic: caseRow ? `MTA Online Consultation — ${caseRow.reference_number}` : 'MTA Online Consultation',
        startTimeIso: slot.slot_time,
        durationMinutes,
      })
      zoomLink = meeting.joinUrl
    } catch (err) {
      logger.error({ err, consultationRequestId }, 'createZoomMeeting failed')
    }
  }

  await (supabase as unknown as UpdateEqClient)
    .from('consultation_requests')
    .update({ zoom_link: zoomLink, updated_at: new Date().toISOString() })
    .eq('id', consultationRequestId)

  // In-portal notification is handled by the consultation_requests_notify_status_change
  // DB trigger fired by the status update above; only dispatch email/SMS here.
  await dispatchCaseStatusAlerts(supabase, consultation.case_id, 'consultation_status_updated')

  await (supabase as unknown as InsertClient).from('audit_logs').insert({
    app: 'patient',
    action: 'consultation.scheduled',
    entity_type: 'case',
    entity_id: consultation.case_id,
    metadata: { consultation_request_id: consultationRequestId, payment_intent_id: paymentIntentId, zoom_scheduled: !!zoomLink },
  })
}
