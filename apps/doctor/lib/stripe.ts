import Stripe from 'stripe'

let stripeClient: Stripe | undefined

function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  stripeClient = new Stripe(key)
  return stripeClient
}

/**
 * Lazy Stripe client — constructed on first use, not at module import.
 * Keeps `next build` from failing when STRIPE_SECRET_KEY is unset in CI.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, property, _receiver) {
    const client = getStripeClient()
    const value = Reflect.get(client, property, client)
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client)
    }
    return value
  },
})
