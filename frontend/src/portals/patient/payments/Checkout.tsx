import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { FormError } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { ApiError, apiPost } from '../../../lib/api'
import type { Checkout as CheckoutData } from '../../../lib/types'

const stripePromises = new Map<string, Promise<Stripe | null>>()

function stripeFor(publishableKey: string) {
  if (!stripePromises.has(publishableKey))
    stripePromises.set(publishableKey, loadStripe(publishableKey))
  return stripePromises.get(publishableKey)!
}

/**
 * Starts checkout (`checkoutPath` creates/reuses the payment intent) and shows
 * the provider's form: Stripe's Payment Element with saved cards, or — with
 * the simulated provider in development — a "simulate payment" button that
 * runs the same completion logic as Stripe's webhook.
 */
export function Checkout({ checkoutPath, onPaid }: { checkoutPath: string; onPaid: () => void }) {
  const t = useT('paymentPage')
  const [checkout, setCheckout] = useState<CheckoutData | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    apiPost<CheckoutData>(checkoutPath)
      .then((data) => !cancelled && setCheckout(data))
      .catch((err) => !cancelled && setError(err))
    return () => {
      cancelled = true
    }
  }, [checkoutPath])

  if (error)
    return (
      <FormError
        error={error instanceof ApiError ? error : new ApiError(500, 'init', t('failedToInit'))}
      />
    )
  if (!checkout) return <p className="muted">{t('loadingForm')}</p>
  if (checkout.provider === 'fake') return <SimulatedCheckout checkout={checkout} onPaid={onPaid} />
  if (!checkout.publishableKey)
    return <FormError error={new ApiError(500, 'init', t('failedToInit'))} />
  return <StripeCheckout checkout={checkout} onPaid={onPaid} />
}

function StripeCheckout({ checkout, onPaid }: { checkout: CheckoutData; onPaid: () => void }) {
  const options = useMemo(
    () => ({
      clientSecret: checkout.clientSecret,
      ...(checkout.customerSessionClientSecret
        ? { customerSessionClientSecret: checkout.customerSessionClientSecret }
        : {}),
      appearance: {
        theme: 'stripe' as const,
        variables: { colorPrimary: '#0f6e8c', borderRadius: '8px' },
      },
    }),
    [checkout],
  )
  return (
    <Elements stripe={stripeFor(checkout.publishableKey!)} options={options}>
      <StripeForm onPaid={onPaid} />
    </Elements>
  )
}

function StripeForm({ onPaid }: { onPaid: () => void }) {
  const t = useT('paymentPage')
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!stripe || !elements) return
    setPending(true)
    setError(null)
    // Cards confirm in place; redirect-based methods come back to this page.
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    setPending(false)
    if (result.error) setError(result.error.message ?? t('cardFailed'))
    else onPaid()
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <PaymentElement />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={!stripe || pending}>
        {pending ? t('processing') : t('payNow')}
      </button>
      <p className="small muted">{t('securePaymentNote')}</p>
    </form>
  )
}

function SimulatedCheckout({ checkout, onPaid }: { checkout: CheckoutData; onPaid: () => void }) {
  const t = useT('paymentPage')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function pay() {
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/patient/payments/simulate/${checkout.intentId}`)
      onPaid()
    } catch (err) {
      setError(err)
      setPending(false)
    }
  }

  return (
    <div className="stack">
      <p className="notice">
        Development mode: payments are simulated (<code>iha.payments.provider=fake</code>). No card
        is charged.
      </p>
      <FormError error={error} />
      <button type="button" onClick={pay} disabled={pending}>
        {pending ? t('processing') : t('payNow')}
      </button>
    </div>
  )
}
