'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@iha/ui'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

type CheckoutFormProps = {
  returnUrl: string
}

function CheckoutForm({ returnUrl }: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const t = useTranslations('paymentPage')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    if (error) {
      setErrorMessage(t('cardFailed'))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe}
        loading={submitting}
        className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
      >
        {submitting ? t('processing') : t('payNow')}
      </Button>
      <p className="text-center text-xs text-slate-400">
        {t('securePaymentNote')}
      </p>
    </form>
  )
}

type Props = {
  caseId: string
  consultationRequestId: string
  redirectStatus: string | null
}

export function ConsultationPaymentClient({ caseId, consultationRequestId, redirectStatus }: Props) {
  const t = useTranslations('paymentPage')

  const isSuccess = redirectStatus === 'succeeded'
  const isFailed = redirectStatus === 'failed'

  const { data: intent, error: intentError } = useQuery({
    queryKey: ['consultation-payment-intent', consultationRequestId],
    queryFn: async ({ signal }) => {
      let res: Response
      try {
        res = await fetch('/api/payments/consultation-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultationRequestId }),
          signal,
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        throw new Error(t('failedToInit'))
      }
      const body = await res.json()
      if (body.error) throw new Error(body.error)
      return body as { clientSecret: string; customerSessionClientSecret: string | null }
    },
    enabled: !isSuccess,
    retry: false,
    staleTime: Infinity,
  })

  const clientSecret = intent?.clientSecret ?? null
  const customerSessionClientSecret = intent?.customerSessionClientSecret ?? null
  const loadError = intentError instanceof Error ? intentError.message : null

  if (isSuccess) return null

  const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/cases/${caseId}/consultations/${consultationRequestId}/payment`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{t('payByCard')}</h2>

      {isFailed && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('consultationPaymentFailed')}
        </div>
      )}

      {loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      ) : clientSecret ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            ...(customerSessionClientSecret ? { customerSessionClientSecret } : {}),
            appearance: { theme: 'stripe', variables: { colorPrimary: '#0891b2' } },
          }}
        >
          <CheckoutForm returnUrl={returnUrl} />
        </Elements>
      ) : (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loadingForm')}
        </div>
      )}
    </div>
  )
}
