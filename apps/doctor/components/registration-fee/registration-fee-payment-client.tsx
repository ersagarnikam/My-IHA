'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@iha/ui'
import { BankTransferPanel } from '@/components/payments/bank-transfer-panel'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function CheckoutForm({ returnUrl }: { returnUrl: string }) {
  const stripe = useStripe()
  const elements = useElements()
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
      setErrorMessage('Your card could not be charged. Please try again.')
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
        {submitting ? 'Processing…' : 'Pay now'}
      </Button>
    </form>
  )
}

type Props = {
  amountAud: number
  redirectStatus?: string | null
  reference: string
}

export function RegistrationFeePaymentClient({ amountAud, redirectStatus, reference }: Props) {
  const router = useRouter()
  const isSuccess = redirectStatus === 'succeeded'
  const isFailed = redirectStatus === 'failed'

  const { data: intent, error: intentError } = useQuery({
    queryKey: ['doctor-registration-fee-intent'],
    queryFn: async ({ signal }) => {
      let res: Response
      try {
        res = await fetch('/api/fees/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feeType: 'registration' }),
          signal,
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        throw new Error('Could not start the payment. Please try again.')
      }
      const body = await res.json()
      if (body.error) throw new Error(body.error)
      return body as { clientSecret: string }
    },
    enabled: !isSuccess,
    retry: false,
    staleTime: Infinity,
  })

  const clientSecret = intent?.clientSecret ?? null
  const loadError = intentError instanceof Error ? intentError.message : null

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Payment received</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your registration fee of {formatAUD(amountAud)} has been received. Your dashboard is unlocking now.
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard')} className="mt-2 bg-cyan-600 text-white hover:bg-cyan-700">
          Continue to dashboard
        </Button>
      </div>
    )
  }

  const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/registration-fee`

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">Registration fee</h2>
          <span className="text-lg font-bold text-cyan-700">{formatAUD(amountAud)}</span>
        </div>

        {isFailed && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Your last payment attempt failed. Please try again.
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
            options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#0891b2' } } }}
          >
            <CheckoutForm returnUrl={returnUrl} />
          </Elements>
        ) : (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payment form…
          </div>
        )}
      </div>

      <BankTransferPanel amountAud={amountAud} reference={reference} />
    </div>
  )
}
