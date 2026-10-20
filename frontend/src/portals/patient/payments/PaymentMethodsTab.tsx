import { useMemo, useState, type FormEvent } from 'react'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useToast } from '../../../components/Toasts'
import { Badge, FormError, Loading } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { apiDelete, apiPost } from '../../../lib/api'
import type { SavedCard } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'

/** Profile → Payment & Billing: saved cards (Stripe only). */
export function PaymentMethodsTab() {
  const t = useT('profile.payment')
  const toast = useToast()
  const config = useApi<{ provider: string; publishableKey: string | null }>(
    '/api/patient/payments/config',
  )
  const cards = useApi<SavedCard[]>('/api/patient/payment-methods')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const stripe = useMemo(
    () => (config.data?.publishableKey ? loadStripe(config.data.publishableKey) : null),
    [config.data?.publishableKey],
  )

  async function act(action: () => Promise<unknown>, success: string) {
    setError(null)
    try {
      await action()
      await cards.reload()
      toast({ title: success, tone: 'good' })
    } catch (err) {
      setError(err)
    }
  }

  if (!config.data || !cards.data) return <Loading />

  return (
    <section className="card stack narrow">
      <div>
        <h2>{t('title')}</h2>
        <p className="muted">{t('subtitle')}</p>
      </div>
      {config.data.provider !== 'stripe' && (
        <p className="notice">
          Saved cards need Stripe. This environment simulates payments (
          <code>iha.payments.provider=fake</code>).
        </p>
      )}
      <h3>{t('savedCards')}</h3>
      {cards.data.length === 0 && <p className="muted">{t('noCards')}</p>}
      <ul className="card-list">
        {cards.data.map((card) => (
          <li key={card.id} className="row-between">
            <span>
              <strong className="capitalize">{card.brand}</strong> •••• {card.last4}{' '}
              <span className="muted small">
                {String(card.expMonth).padStart(2, '0')}/{card.expYear}
              </span>{' '}
              {card.isDefault && <Badge tone="info">{t('defaultBadge')}</Badge>}
            </span>
            <span className="actions">
              {!card.isDefault && (
                <button
                  type="button"
                  className="button-link"
                  onClick={() =>
                    act(
                      () => apiPost(`/api/patient/payment-methods/${card.id}/default`),
                      t('toasts.defaultUpdated'),
                    )
                  }
                >
                  {t('saveAsDefault')}
                </button>
              )}
              <button
                type="button"
                className="button-link danger"
                onClick={() =>
                  act(
                    () => apiDelete(`/api/patient/payment-methods/${card.id}`),
                    t('toasts.cardRemoved'),
                  )
                }
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
      <FormError error={error} />
      {stripe &&
        (adding ? (
          <Elements stripe={stripe}>
            <AddCardForm
              onCancel={() => setAdding(false)}
              onSaved={async () => {
                setAdding(false)
                await cards.reload()
                toast({ title: t('toasts.cardAdded'), tone: 'good' })
              }}
            />
          </Elements>
        ) : (
          <button type="button" className="button-secondary" onClick={() => setAdding(true)}>
            + {t('addNewCard')}
          </button>
        ))}
    </section>
  )
}

function AddCardForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const t = useT('profile.payment')
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const card = elements?.getElement(CardElement)
    if (!stripe || !card) return
    setPending(true)
    setError(null)
    const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
      type: 'card',
      card,
    })
    if (stripeError || !paymentMethod) {
      setError(new Error(stripeError?.message ?? t('toasts.failedToCreate')))
      setPending(false)
      return
    }
    try {
      await apiPost('/api/patient/payment-methods', { paymentMethodId: paymentMethod.id })
      onSaved()
    } catch (err) {
      setError(err)
      setPending(false)
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h3>{t('newCard')}</h3>
      <div className="card-element">
        <CardElement />
      </div>
      <FormError error={error} />
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="submit" disabled={!stripe || pending}>
          {t('saveCard')}
        </button>
      </div>
    </form>
  )
}
