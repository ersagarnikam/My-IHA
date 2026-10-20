import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { stripe } from '@/lib/stripe'
import { logAuditEvent } from '@iha/db/audit'

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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { id } = await params

  // Fetch the record to get the Stripe PM id
  const { data: pm, error: fetchError } = await supabase
    .from('payment_methods')
    .select('stripe_payment_method_id, is_default')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !pm) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const typedPm = pm as { stripe_payment_method_id: string; is_default: boolean }

  // Detach from Stripe
  await stripe.paymentMethods.detach(typedPm.stripe_payment_method_id)

  // Delete from DB
  await supabase.from('payment_methods').delete().eq('id', id).eq('user_id', user.id)

  // If it was the default, promote the next card
  if (typedPm.is_default) {
    const { data: next } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const typedNext = next as { id: string } | null
    if (typedNext) {
      await (supabase as unknown as SimpleClient)
        .from('payment_methods')
        .update({ is_default: true })
        .eq('id', typedNext.id)
    }
  }

  await logAuditEvent({
    app: 'patient',
    action: 'payment.method_removed',
    entityType: 'payment_method',
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
