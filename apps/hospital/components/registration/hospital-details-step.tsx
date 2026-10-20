'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, MultiSelectDropdown, TagInput } from '@iha/ui'
import { cn } from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import {
  hospitalDetailsStepSchema,
  hospitalTypeLabels,
  hospitalTypes,
  type HospitalRegistrationInput,
} from '@/lib/validations/hospital-registration'

type StepValues = Pick<
  HospitalRegistrationInput,
  'registrationType' | 'specialties' | 'bedCount' | 'roomTypes' | 'licenseNumber' | 'accreditationBody'
>

type Props = {
  specialties: SpecialtyOption[]
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack?: () => void
}

export function HospitalDetailsStep({ specialties, defaultValues, onNext, onBack }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(hospitalDetailsStepSchema),
    defaultValues: {
      registrationType: undefined,
      specialties: [],
      bedCount: 0,
      roomTypes: [],
      licenseNumber: '',
      accreditationBody: '',
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <FormField
          control={form.control}
          name="registrationType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hospital Type</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-3">
                  {hospitalTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => field.onChange(type)}
                      className={cn(
                        'rounded-md border px-4 py-2 text-sm font-medium transition',
                        field.value === type
                          ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                          : 'border-input text-slate-600 hover:bg-accent',
                      )}
                    >
                      {hospitalTypeLabels[type]}
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
          name="specialties"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Specialties</FormLabel>
              <FormControl>
                <MultiSelectDropdown
                  options={specialties.map((s) => ({ value: s.name, label: s.label_en }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select specialties"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bedCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Beds</FormLabel>
              <FormControl>
                <Input type="number" min={1} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roomTypes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Room Types</FormLabel>
              <FormControl>
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="e.g. General, Private, Deluxe — press Enter to add"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="licenseNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>License Number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accreditationBody"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Accreditation</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between pt-2">
          {onBack ? (
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" className="bg-cyan-600 text-white hover:bg-cyan-700">
            Next
          </Button>
        </div>
      </form>
    </Form>
  )
}
