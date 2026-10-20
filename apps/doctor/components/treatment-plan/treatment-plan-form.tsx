'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DateInput,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@iha/ui'
import {
  treatmentPlanDraftSchema,
  treatmentPlanSubmitSchema,
  treatmentTypes,
  type TreatmentPlanDraftInput,
  type TreatmentType,
} from '@iha/validations'
import type { HospitalOptionWithRoomTypes } from '@/lib/data/hospitals'
import type { TreatmentPlanStatus, TreatmentPlanWithSpecialists } from '@iha/db/treatment-plans'

const READ_ONLY_BANNER_TEXT: Partial<Record<TreatmentPlanStatus, string>> = {
  submitted_to_iha: 'This treatment plan has been submitted and is awaiting MTA Admin review — it can no longer be edited.',
  iha_review_in_progress: 'This treatment plan has been submitted and is awaiting MTA Admin review — it can no longer be edited.',
  iha_approved: 'This treatment plan has been approved by MTA Admin and is no longer editable.',
  rejected_by_iha: 'This treatment plan was rejected by MTA Admin and is no longer editable.',
  presented_to_patient: 'This treatment plan has been sent to the patient and is no longer editable.',
  patient_confirmed: 'The patient has confirmed this treatment plan. It is no longer editable.',
}
import { saveDraftTreatmentPlanAction, submitTreatmentPlanAction } from '@/lib/actions/treatment-plans'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import { CollapsibleSection } from './collapsible-section'
import { SpecialistsTable } from './specialists-table'
import { CostItemsTable } from './cost-items-table'
import { CostSummaryBar } from './cost-summary-bar'

const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
  medication_only: 'Medication Only',
  surgery: 'Surgery',
  therapy: 'Therapy',
}

function toDefaultValues(plan: TreatmentPlanWithSpecialists | null): TreatmentPlanDraftInput {
  if (!plan) {
    return {
      hospital_id: undefined,
      diagnosis: '',
      procedure_name: '',
      description: '',
      technique: '',
      expected_outcome: '',
      success_rate: '',
      treatment_start_date: '',
      treatment_end_date: '',
      recovery_time: '',
      estimated_length_of_stay: '',
      department: '',
      room_category: '',
      special_requirements: '',
      cost_notes: '',
      patient_instructions: '',
      aftercare: [],
      cost_items: [],
      specialists: [],
    }
  }

  return {
    hospital_id: plan.hospital_id ?? undefined,
    diagnosis: plan.diagnosis ?? '',
    treatment_type: plan.treatment_type ?? undefined,
    procedure_name: plan.procedure_name ?? '',
    description: plan.description ?? '',
    technique: plan.technique ?? '',
    expected_outcome: plan.expected_outcome ?? '',
    success_rate: plan.success_rate ?? '',
    treatment_start_date: plan.treatment_start_date ?? '',
    treatment_end_date: plan.treatment_end_date ?? '',
    recovery_time: plan.recovery_time ?? '',
    estimated_length_of_stay: plan.estimated_length_of_stay ?? '',
    department: plan.department ?? '',
    room_category: plan.room_category ?? '',
    special_requirements: plan.special_requirements ?? '',
    doctor_fees_aud: plan.doctor_fees_aud ?? undefined,
    hospital_fees_aud: plan.hospital_fees_aud ?? undefined,
    cost_items: plan.cost_breakdown.items,
    cost_notes: plan.cost_notes ?? '',
    patient_instructions: plan.patient_instructions ?? '',
    aftercare: plan.aftercare,
    specialists: plan.specialists.map((s) => ({
      specialist_type: s.specialist_type,
      specialist_name: s.specialist_name ?? '',
      cost_aud: s.cost_aud,
      notes: s.notes ?? '',
    })),
  }
}

function daysBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return Number.isFinite(diff) && diff >= 1 ? diff : null
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function DurationHint({ control }: { control: ReturnType<typeof useForm<TreatmentPlanDraftInput>>['control'] }) {
  const start = useWatch({ control, name: 'treatment_start_date' })
  const end = useWatch({ control, name: 'treatment_end_date' })
  const days = daysBetween(start, end)
  if (days === null) return null
  return <p className="text-xs text-slate-500">Duration: {days} {days === 1 ? 'day' : 'days'} (calculated automatically)</p>
}

type Props = {
  caseId: string
  plan: TreatmentPlanWithSpecialists | null
  hospitalOptions: HospitalOptionWithRoomTypes[]
}

export function TreatmentPlanForm({ caseId, plan, hospitalOptions }: Props) {
  const router = useRouter()
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const readOnly = plan !== null && plan.status !== 'draft'

  const form = useForm<TreatmentPlanDraftInput>({
    resolver: zodResolver(treatmentPlanDraftSchema),
    defaultValues: toDefaultValues(plan),
  })

  const selectedHospital = hospitalOptions.find((h) => h.id === form.watch('hospital_id'))
  const treatmentStartDate = form.watch('treatment_start_date')
  const today = todayDateString()

  const draftName = `treatment-plan:${caseId}`

  // Restore any unsaved edits from sessionStorage on mount (survives a
  // refresh; doesn't touch the DB draft saved via "Save Draft").
  useEffect(() => {
    if (readOnly) return
    const saved = loadDraft<TreatmentPlanDraftInput>(draftName)
    if (saved) form.reset(saved)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist form values on every change so a refresh doesn't lose in-progress typing.
  useEffect(() => {
    if (readOnly) return
    const sub = form.watch((values) => saveDraft(draftName, values))
    return () => sub.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // handleSubmitPlan sets field errors manually from the (stricter) submit
  // schema, outside RHF's own validate-on-change pipeline (the resolver above
  // uses the lenient draft schema, and native submit is disabled). Without
  // this, a "Submit Plan" error never clears even after the field is fixed.
  useEffect(() => {
    if (readOnly) return
    const sub = form.watch((values) => {
      const erroredFields = Object.keys(form.formState.errors)
      if (erroredFields.length === 0) return
      const parsed = treatmentPlanSubmitSchema.safeParse(values)
      const stillInvalid = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.')))
      for (const field of erroredFields) {
        if (!stillInvalid.has(field)) form.clearErrors(field as keyof TreatmentPlanDraftInput)
      }
    })
    return () => sub.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  async function handleSaveDraft() {
    setIsSavingDraft(true)
    const { data, error } = await saveDraftTreatmentPlanAction(caseId, form.getValues())
    setIsSavingDraft(false)
    if (error || !data) {
      toast.error(typeof error === 'string' ? error : 'Failed to save draft.')
      return
    }
    clearDraft(draftName)
    toast.success('Draft saved.')
    router.refresh()
  }

  async function handleSubmitPlan() {
    const parsed = treatmentPlanSubmitSchema.safeParse(form.getValues())
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path.join('.') as keyof TreatmentPlanDraftInput, { message: issue.message })
      }
      toast.error('Please complete all required fields before submitting.')
      return
    }

    setIsSubmitting(true)
    const { data: saved, error: saveError } = await saveDraftTreatmentPlanAction(caseId, parsed.data)
    if (saveError || !saved) {
      setIsSubmitting(false)
      toast.error(typeof saveError === 'string' ? saveError : 'Failed to save the plan before submitting.')
      return
    }

    const { error } = await submitTreatmentPlanAction(caseId, saved.id)
    setIsSubmitting(false)
    if (error) {
      toast.error(typeof error === 'string' ? error : 'Failed to submit the treatment plan.')
      return
    }
    clearDraft(draftName)
    toast.success('Treatment plan submitted to MTA Admin.')
    router.push(`/cases/${caseId}`)
  }

  return (
    <Form {...form}>
      <form className="space-y-4 pb-24" onSubmit={(e) => e.preventDefault()}>
        {readOnly && plan && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            {READ_ONLY_BANNER_TEXT[plan.status] ?? 'This treatment plan can no longer be edited.'}
          </div>
        )}

        <CollapsibleSection title="Diagnosis">
          <FormField
            control={form.control}
            name="diagnosis"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Diagnosis</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Treatment / Procedure">
          <FormField
            control={form.control}
            name="treatment_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Treatment Type</FormLabel>
                <FormControl>
                  <RadioGroup
                    disabled={readOnly}
                    className="flex flex-wrap gap-4"
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    {treatmentTypes.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                        <RadioGroupItem value={type} />
                        {TREATMENT_TYPE_LABELS[type]}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="procedure_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Procedure / Recommended Treatment</FormLabel>
                <FormControl>
                  <Input disabled={readOnly} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="technique"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Technique</FormLabel>
                  <FormControl>
                    <Input disabled={readOnly} placeholder="e.g. Minimally Invasive" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="success_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Success Rate</FormLabel>
                  <FormControl>
                    <Input disabled={readOnly} placeholder="e.g. 95%" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="expected_outcome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Outcome</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Timeline & Recovery">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="treatment_start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Treatment Start Date</FormLabel>
                  <FormControl>
                    <DateInput disabled={readOnly} min={today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="treatment_end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Treatment End Date</FormLabel>
                  <FormControl>
                    <DateInput disabled={readOnly} min={treatmentStartDate || today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DurationHint control={form.control} />
          <FormField
            control={form.control}
            name="recovery_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recovery Time</FormLabel>
                <FormControl>
                  <Input disabled={readOnly} placeholder="e.g. 4-6 weeks" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estimated_length_of_stay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Hospital Stay</FormLabel>
                <FormControl>
                  <Input disabled={readOnly} placeholder="e.g. 3 nights" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Hospital Information">
          <FormField
            control={form.control}
            name="hospital_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Hospital</FormLabel>
                <Select disabled={readOnly} onValueChange={field.onChange} value={field.value ?? undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a hospital" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {hospitalOptions.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name} — {h.city}, {h.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hospitalOptions.length === 0 && (
                  <p className="text-xs text-slate-500">
                    You have no affiliated hospitals yet — add one from your profile before building a plan.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <FormControl>
                  <Input disabled={readOnly} placeholder="e.g. Cardiology" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="room_category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Room Category</FormLabel>
                <FormControl>
                  {selectedHospital && selectedHospital.room_types.length > 0 ? (
                    <RadioGroup
                      disabled={readOnly}
                      className="flex flex-wrap gap-4"
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      {selectedHospital.room_types.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                          <RadioGroupItem value={type} />
                          {type}
                        </label>
                      ))}
                    </RadioGroup>
                  ) : (
                    <p className="text-xs text-slate-500">Select a hospital to see its available room categories.</p>
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="special_requirements"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Special Requirements</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Cost Estimation">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="doctor_fees_aud"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Doctor Fees (AUD)</FormLabel>
                  <FormControl>
                    <Input disabled={readOnly} type="number" min={0} step="0.01" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hospital_fees_aud"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hospital Fees (AUD)</FormLabel>
                  <FormControl>
                    <Input disabled={readOnly} type="number" min={0} step="0.01" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Itemised Costs</p>
            <CostItemsTable control={form.control} disabled={readOnly} />
          </div>
          <FormField
            control={form.control}
            name="cost_notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Specialists">
          <SpecialistsTable control={form.control} disabled={readOnly} />
        </CollapsibleSection>

        <CollapsibleSection title="Doctor Notes">
          <FormField
            control={form.control}
            name="patient_instructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instructions for Patient</FormLabel>
                <FormControl>
                  <Textarea disabled={readOnly} rows={3} placeholder="Anything the patient should know or prepare" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="aftercare"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Aftercare Instructions</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={readOnly}
                    rows={4}
                    placeholder={'One instruction per line, e.g.\nTake all medicines on time.\nKeep the wound clean and dry.'}
                    value={(field.value ?? []).join('\n')}
                    onChange={(e) => field.onChange(e.target.value.split('\n'))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleSection>

        <CostSummaryBar control={form.control} />

        {!readOnly && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ready to submit?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                I confirm this treatment plan is accurate
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push(`/cases/${caseId}`)}>
                  Cancel
                </Button>
                <Button type="button" variant="secondary" loading={isSavingDraft} onClick={handleSaveDraft}>
                  Save Draft
                </Button>
                <Button
                  type="button"
                  loading={isSubmitting}
                  disabled={!confirmed}
                  className="bg-cyan-600 text-white hover:bg-cyan-700"
                  onClick={handleSubmitPlan}
                >
                  Submit Plan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </Form>
  )
}
