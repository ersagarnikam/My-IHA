'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { CreditCard, Loader2, Plus, Trash2, Check } from 'lucide-react'
import { Button } from '@iha/ui'
import type { PaymentMethod } from '@iha/db/types'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Brand helpers ────────────────────────────────────────────────────────────

function brandLabel(brand: string) {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    diners: 'Diners Club',
  }
  return map[brand.toLowerCase()] ?? brand
}

// ─── Add-card form ────────────────────────────────────────────────────────────

function AddCardForm({ onAdded }: { onAdded: (card: PaymentMethod) => void }) {
  const t = useTranslations('profile.payment')
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [cardReady, setCardReady] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!stripe || !elements) return

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) return

    setLoading(true)

    const { paymentMethod, error } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    })

    if (error || !paymentMethod) {
      toast.error(t('toasts.failedToCreate'))
      setLoading(false)
      return
    }

    const res = await fetch('/api/payments/add-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(data.error ?? t('toasts.failedToSave'))
      return
    }

    toast.success(t('toasts.cardAdded'))
    // Defer unmount by one frame so Stripe finishes its internal message handling
    requestAnimationFrame(() => onAdded(data as PaymentMethod))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '14px',
                color: '#0f172a',
                fontFamily: 'inherit',
                '::placeholder': { color: '#94a3b8' },
              },
              invalid: { color: '#dc2626' },
            },
          }}
          onChange={(e) => setCardReady(e.complete && !e.error)}
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={!cardReady || !stripe}
        loading={loading}
        className="bg-cyan-600 hover:bg-cyan-700 text-white"
      >
        {t('saveCard')}
      </Button>
    </form>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

const CARDS_QUERY_KEY = ['payment-cards'] as const

async function fetchCards(): Promise<PaymentMethod[]> {
  const res = await fetch('/api/payments/cards')
  if (!res.ok) throw new Error('Failed to load cards')
  return res.json()
}

function PaymentBillingTabInner() {
  const t = useTranslations('profile.payment')
  const queryClient = useQueryClient()
  const [selectedIdOverride, setSelectedIdOverride] = useState<string | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)

  const { data: cards = [], isLoading } = useQuery({
    queryKey: CARDS_QUERY_KEY,
    queryFn: fetchCards,
  })

  const selectedId =
    selectedIdOverride ?? cards.find((c) => c.is_default)?.id ?? cards[0]?.id ?? null

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/payments/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to set default')
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<PaymentMethod[]>(CARDS_QUERY_KEY, (prev) =>
        prev?.map((c) => ({ ...c, is_default: c.id === id })),
      )
      toast.success(t('toasts.defaultUpdated'))
    },
    onError: () => toast.error(t('toasts.failedToSetDefault')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payments/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove card')
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<PaymentMethod[]>(CARDS_QUERY_KEY, (prev) =>
        prev?.filter((c) => c.id !== id),
      )
      setSelectedIdOverride((prev) => (prev === id ? null : prev))
      toast.success(t('toasts.cardRemoved'))
    },
    onError: () => toast.error(t('toasts.failedToRemove')),
  })

  function handleSetDefault() {
    if (!selectedId) return
    const current = cards.find((c) => c.id === selectedId)
    if (current?.is_default) return
    setDefaultMutation.mutate(selectedId)
  }

  function handleCardAdded(card: PaymentMethod) {
    queryClient.setQueryData<PaymentMethod[]>(CARDS_QUERY_KEY, (prev) => [
      card,
      ...(prev ?? []).map((c) => ({ ...c, is_default: card.is_default ? false : c.is_default })),
    ])
    setSelectedIdOverride(card.id)
    setShowAddCard(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  const selectedIsAlreadyDefault = cards.find((c) => c.id === selectedId)?.is_default ?? false

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {/* Saved cards */}
      {cards.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{t('savedCards')}</p>
          <div className="space-y-2">
            {cards.map((card) => (
              <label
                key={card.id}
                className={[
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                  selectedId === card.id
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="card"
                  value={card.id}
                  checked={selectedId === card.id}
                  onChange={() => setSelectedIdOverride(card.id)}
                  className="accent-cyan-600"
                />
                <CreditCard className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1 text-sm text-slate-700">
                  {brandLabel(card.brand)} •••• {card.last4}
                  <span className="ml-2 text-xs text-slate-400">
                    {String(card.exp_month).padStart(2, '0')}/{card.exp_year}
                  </span>
                </span>
                {card.is_default && (
                  <span className="flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
                    <Check className="h-3 w-3" /> {t('defaultBadge')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    deleteMutation.mutate(card.id)
                  }}
                  disabled={deleteMutation.isPending && deleteMutation.variables === card.id}
                  className="ml-1 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                  aria-label="Remove card"
                >
                  {deleteMutation.isPending && deleteMutation.variables === card.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </label>
            ))}
          </div>

          <Button
            size="sm"
            onClick={handleSetDefault}
            disabled={selectedIsAlreadyDefault || !selectedId}
            loading={setDefaultMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50"
          >
            {t('saveAsDefault')}
          </Button>
        </div>
      )}

      {/* Add new card */}
      <div className="space-y-3">
        {!showAddCard ? (
          <button
            type="button"
            onClick={() => setShowAddCard(true)}
            className="flex items-center gap-2 text-sm font-medium text-cyan-600 hover:text-cyan-700"
          >
            <Plus className="h-4 w-4" />
            {t('addNewCard')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{t('newCard')}</p>
            <AddCardForm onAdded={handleCardAdded} />
            <button
              type="button"
              onClick={() => setShowAddCard(false)}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              {t('cancel')}
            </button>
          </div>
        )}
      </div>

      {cards.length === 0 && !showAddCard && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <CreditCard className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">{t('noCards')}</p>
        </div>
      )}
    </div>
  )
}

export function PaymentBillingTab() {
  return (
    <Elements stripe={stripePromise}>
      <PaymentBillingTabInner />
    </Elements>
  )
}
