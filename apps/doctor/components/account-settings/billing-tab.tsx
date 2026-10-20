'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@iha/ui'
import { BankTransferPanel } from '@/components/payments/bank-transfer-panel'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function CheckoutForm({ returnUrl, onCancel }: { returnUrl: string; onCancel: () => void }) {
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!stripe}
          loading={submitting}
          className="flex-1 bg-cyan-600 text-white hover:bg-cyan-700"
        >
          {submitting ? 'Processing…' : 'Pay now'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

type Props = {
  annualFeeNextDueAt: string | null
  annualFeeAud: number
  reference: string
}

export function BillingTab({ annualFeeNextDueAt, annualFeeAud, reference }: Props) {
  const searchParams = useSearchParams()
  const redirectStatus = searchParams.get('redirect_status')
  const [payingNow, setPayingNow] = useState(false)

  const isSuccess = redirectStatus === 'succeeded'
  const isDue = !!annualFeeNextDueAt && new Date(annualFeeNextDueAt) <= new Date()

  const { data: intent, error: intentError } = useQuery({
    queryKey: ['doctor-annual-fee-intent'],
    queryFn: async ({ signal }) => {
      let res: Response
      try {
        res = await fetch('/api/fees/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feeType: 'annual' }),
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
    enabled: payingNow,
    retry: false,
    staleTime: Infinity,
  })

  const clientSecret = intent?.clientSecret ?? null
  const loadError = intentError instanceof Error ? intentError.message : null
  const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/account-settings?tab=billing`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Billing</h2>
        <p className="mt-0.5 text-sm text-slate-500">Your annual renewal fee.</p>
      </div>

      {isSuccess && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Payment received — thank you.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-50 text-cyan-600">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Annual renewal fee — {formatAUD(annualFeeAud)}</p>
            <p className="text-sm text-slate-500">
              {annualFeeNextDueAt
                ? isDue
                  ? `Due since ${new Date(annualFeeNextDueAt).toLocaleDateString()}`
                  : `Next due ${new Date(annualFeeNextDueAt).toLocaleDateString()}`
                : 'No renewal date set yet.'}
            </p>
          </div>
          {isDue && !payingNow && (
            <Button onClick={() => setPayingNow(true)} className="bg-cyan-600 text-white hover:bg-cyan-700">
              Pay now
            </Button>
          )}
        </div>

        {payingNow && (
          <div className="mt-5 border-t border-slate-100 pt-5">
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
                <CheckoutForm returnUrl={returnUrl} onCancel={() => setPayingNow(false)} />
              </Elements>
            ) : (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading payment form…
              </div>
            )}
          </div>
        )}
      </div>

      {isDue && <BankTransferPanel amountAud={annualFeeAud} reference={reference} />}
    </div>
  )
}
