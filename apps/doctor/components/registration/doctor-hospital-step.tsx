'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, cn, MultiSelectChecklist } from '@iha/ui'
import type { HospitalOption } from '@/lib/data/hospitals'
import {
  doctorHospitalStepSchema,
  doctorRoleLabels,
  doctorRoles,
  workingDayLabels,
  workingDays,
  type DoctorRegistrationInput,
} from '@/lib/validations/doctor-registration'

type StepValues = Pick<
  DoctorRegistrationInput,
  'department' | 'role' | 'hospitalAffiliations' | 'workingDays'
>

type Props = {
  hospitalOptions: HospitalOption[]
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack: () => void
}

export function DoctorHospitalStep({ hospitalOptions, defaultValues, onNext, onBack }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(doctorHospitalStepSchema),
    defaultValues: {
      department: '',
      role: undefined,
      hospitalAffiliations: [],
      workingDays: [],
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Hospital Details</h2>
        <FormField
          control={form.control}
          name="hospitalAffiliations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hospitals</FormLabel>
              <FormControl>
                <MultiSelectChecklist
                  options={hospitalOptions.map((h) => ({
                    value: h.id,
                    label: h.name,
                    description: `${h.city}, ${h.country}`,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  emptyMessage="No hospitals available yet — you can add affiliations later."
                />
              </FormControl>
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
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-3">
                  {doctorRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => field.onChange(role)}
                      className={cn(
                        'rounded-md border px-4 py-2 text-sm font-medium transition',
                        field.value === role
                          ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                          : 'border-input text-slate-600 hover:bg-accent',
                      )}
                    >
                      {doctorRoleLabels[role]}
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="workingDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Working Days</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-2">
                  {workingDays.map((day) => {
                    const checked = field.value.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            checked ? field.value.filter((d) => d !== day) : [...field.value, day],
                          )
                        }
                        className={cn(
                          'rounded-md border px-4 py-2 text-sm font-medium transition',
                          checked
                            ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                            : 'border-input text-slate-600 hover:bg-accent',
                        )}
                      >
                        {workingDayLabels[day]}
                      </button>
                    )
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" className="bg-cyan-600 text-white hover:bg-cyan-700">
            Next
          </Button>
        </div>
      </form>
    </Form>
  )
}
