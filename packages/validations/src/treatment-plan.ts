import { z } from 'zod'

export const treatmentTypes = ['medication_only', 'surgery', 'therapy'] as const
export type TreatmentType = (typeof treatmentTypes)[number]

export const costItemSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  amount: z.coerce.number().nonnegative('Amount must be 0 or more'),
})
export type CostItemInput = z.infer<typeof costItemSchema>

export const specialistSchema = z.object({
  specialist_type: z.string().min(1, 'Specialist role is required'),
  specialist_name: z.string().optional(),
  cost_aud: z.coerce.number().positive('Cost must be greater than 0'),
  notes: z.string().optional(),
})
export type SpecialistInput = z.infer<typeof specialistSchema>

function isNotInPast(val: string): boolean {
  const d = new Date(val)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return !isNaN(d.getTime()) && d >= today
}

const optionalTreatmentStartDate = z
  .string()
  .optional()
  .refine((val) => !val || isNotInPast(val), 'Treatment start date cannot be in the past')

const requiredTreatmentStartDate = z
  .string()
  .min(1, 'Treatment start date is required')
  .refine(isNotInPast, 'Treatment start date cannot be in the past')

function checkDateOrder(
  data: { treatment_start_date?: string; treatment_end_date?: string },
  ctx: z.RefinementCtx,
) {
  if (!data.treatment_start_date || !data.treatment_end_date) return
  const start = new Date(data.treatment_start_date)
  const end = new Date(data.treatment_end_date)
  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Treatment end date must be on or after the start date',
      path: ['treatment_end_date'],
    })
  }
}

// Draft: everything optional so a doctor can save partial progress at any
// time (module 05: "Draft save has no such gate").
const treatmentPlanShape = z.object({
  hospital_id: z.string().uuid().nullable().optional(),
  diagnosis: z.string().optional(),
  treatment_type: z.enum(treatmentTypes).optional(),
  procedure_name: z.string().optional(),
  description: z.string().optional(),
  technique: z.string().optional(),
  expected_outcome: z.string().optional(),
  success_rate: z.string().optional(),
  treatment_start_date: optionalTreatmentStartDate,
  treatment_end_date: z.string().optional(),
  recovery_time: z.string().optional(),
  estimated_length_of_stay: z.string().optional(),
  department: z.string().optional(),
  room_category: z.string().optional(),
  special_requirements: z.string().optional(),
  doctor_fees_aud: z.coerce.number().nonnegative().optional(),
  hospital_fees_aud: z.coerce.number().nonnegative().optional(),
  cost_items: z.array(costItemSchema).optional(),
  cost_notes: z.string().optional(),
  patient_instructions: z.string().optional(),
  aftercare: z.array(z.string()).optional(),
  specialists: z.array(specialistSchema).optional(),
})

export const treatmentPlanDraftSchema = treatmentPlanShape.superRefine(checkDateOrder)
export type TreatmentPlanDraftInput = z.infer<typeof treatmentPlanShape>

// Submit: the module 05 validation-rules table, enforced client-side as a
// mirror of the submit_treatment_plan() RPC's server-side gate.
export const treatmentPlanSubmitSchema = treatmentPlanShape
  .extend({
    hospital_id: z.string().uuid('Select a hospital before submitting'),
    diagnosis: z.string().min(10, 'Diagnosis must be at least 10 characters'),
    treatment_type: z.enum(treatmentTypes, { message: 'Select a treatment type' }),
    procedure_name: z.string().min(1, 'Recommended treatment is required'),
    doctor_fees_aud: z.coerce.number().positive('Doctor fees are required and must be greater than 0'),
    treatment_start_date: requiredTreatmentStartDate,
    treatment_end_date: z.string().min(1, 'Treatment end date is required'),
    estimated_length_of_stay: z.string().min(1, 'Estimated length of stay is required'),
  })
  .superRefine(checkDateOrder)
export type TreatmentPlanSubmitInput = z.infer<typeof treatmentPlanSubmitSchema>
