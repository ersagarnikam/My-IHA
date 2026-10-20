'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@iha/ui'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount)
}

type CostItem = { label: string; amount: number }

type CheckoutFormProps = {
  caseId: string
  returnUrl: string
}

function CheckoutForm({ caseId, returnUrl }: CheckoutFormProps) {
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
  referenceNumber: string
  costItems: CostItem[]
  totalAud: number
  hospitalName: string
  treatmentSummary: string
  redirectStatus?: string | null
}

export function PaymentClient({
  caseId,
  referenceNumber,
  costItems,
  totalAud,
  hospitalName,
  treatmentSummary,
  redirectStatus,
}: Props) {
  const router = useRouter()
  const t = useTranslations('paymentPage')
  const [bankOpen, setBankOpen] = useState(false)

  const isSuccess = redirectStatus === 'succeeded'
  const isFailed = redirectStatus === 'failed'

  const { data: intent, error: intentError } = useQuery({
    queryKey: ['payment-intent', caseId],
    queryFn: async ({ signal }) => {
      let res: Response
      try {
        res = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId }),
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
    enabled: !isSuccess && !isFailed,
    retry: false,
    staleTime: Infinity,
  })

  const clientSecret = intent?.clientSecret ?? null
  const customerSessionClientSecret = intent?.customerSessionClientSecret ?? null
  const loadError = intentError instanceof Error ? intentError.message : null

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('successTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('successBody', { amount: formatAUD(totalAud) })}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{t('successReference', { ref: referenceNumber })}</p>
        </div>
        <Button
          onClick={() => router.push(`/cases/${caseId}`)}
          className="mt-2 bg-cyan-600 text-white hover:bg-cyan-700"
        >
          {t('backToCase')}
        </Button>
      </div>
    )
  }

  const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/cases/${caseId}/payment`

  return (
    <div className="space-y-5">
      {/* Payment summary card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">{t('paymentSummary')}</h2>
        <p className="mb-4 text-sm text-slate-500">
          {hospitalName} — {treatmentSummary}
        </p>
        <table className="w-full text-sm">
          <tbody>
            {costItems.map((item) => (
              <tr key={item.label} className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">{item.label}</td>
                <td className="py-2.5 text-right text-slate-800">{formatAUD(item.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-4 text-base font-bold text-slate-900">{t('totalDue')}</td>
              <td className="pt-4 text-right text-base font-bold text-cyan-700">
                {formatAUD(totalAud)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {isFailed && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('paymentFailed')}
        </div>
      )}

      {/* Card payment */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-900">{t('payByCard')}</h2>
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
            <CheckoutForm caseId={caseId} returnUrl={returnUrl} />
          </Elements>
        ) : (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingForm')}
          </div>
        )}
      </div>

      {/* Bank transfer (collapsible) */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setBankOpen((p) => !p)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-700"
        >
          {t('payByBankTransfer')}
          {bankOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {bankOpen && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 text-sm text-slate-600">
            <p className="mb-3 text-slate-500">
              {t('bankTransferInstructions')}
            </p>
            <dl className="space-y-2">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('bankLabel')}</dt>
                <dd className="font-medium">ANZ Bank Australia</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('accountNameLabel')}</dt>
                <dd className="font-medium">International Health Australia Pty Ltd</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('bsbLabel')}</dt>
                <dd className="font-medium font-mono">012-345</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('accountNumberLabel')}</dt>
                <dd className="font-medium font-mono">123456789</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('referenceLabel')}</dt>
                <dd className="font-medium font-mono text-cyan-700">{referenceNumber}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-slate-400">{t('amountLabel')}</dt>
                <dd className="font-medium">{formatAUD(totalAud)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              {t('bankTransferNote')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
