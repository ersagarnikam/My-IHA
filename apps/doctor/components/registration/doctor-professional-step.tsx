'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, MultiSelectChecklist, MultiSelectDropdown, TagInput } from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import { doctorProfessionalStepSchema, type DoctorRegistrationInput } from '@/lib/validations/doctor-registration'

const LANGUAGES = ['English', 'Mandarin (Chinese)']

type StepValues = Pick<
  DoctorRegistrationInput,
  'specialties' | 'qualifications' | 'yearsOfExperience' | 'licenseNumber' | 'bio' | 'languagesSpoken'
>

type Props = {
  specialties: SpecialtyOption[]
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack: () => void
}

export function DoctorProfessionalStep({ specialties, defaultValues, onNext, onBack }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(doctorProfessionalStepSchema),
    defaultValues: {
      specialties: [],
      qualifications: '',
      yearsOfExperience: 0,
      licenseNumber: '',
      bio: '',
      languagesSpoken: [],
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Professional Details</h2>
        <FormField
          control={form.control}
          name="specialties"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Specialization</FormLabel>
              <FormControl>
                <MultiSelectDropdown
                  options={specialties.map((s) => ({ value: s.name, label: s.label_en }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select specialization"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="yearsOfExperience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Experience (Years)</FormLabel>
              <FormControl>
                <Input type="number" min={0} max={70} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="qualifications"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Qualification</FormLabel>
              <FormControl>
                <TagInput
                  value={field.value ? field.value.split(',').map((s) => s.trim()).filter(Boolean) : []}
                  onChange={(tags) => field.onChange(tags.join(', '))}
                  placeholder="e.g. MBBS, MD — press Enter to add"
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
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Professional Bio / Summary</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="languagesSpoken"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Languages Spoken</FormLabel>
              <FormControl>
                <MultiSelectChecklist
                  options={LANGUAGES.map((l) => ({ value: l, label: l }))}
                  value={field.value}
                  onChange={field.onChange}
                />
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
