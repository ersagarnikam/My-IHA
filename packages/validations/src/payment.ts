import { z } from 'zod'

export const paymentInitiationSchema = z.object({
  case_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  payment_type: z.enum(['consultation_fee', 'treatment_deposit']),
})

export type PaymentInitiationInput = z.infer<typeof paymentInitiationSchema>
