import { z } from 'zod'

export const treatmentPlanReviewSchema = z.object({
  plan_id: z.string().uuid(),
  status: z.enum(['iha_approved', 'rejected_by_iha']),
  rejection_reason: z.string().optional(),
})

export type TreatmentPlanReviewInput = z.infer<typeof treatmentPlanReviewSchema>
