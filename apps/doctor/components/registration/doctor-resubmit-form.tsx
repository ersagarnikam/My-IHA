'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, cn, PhoneInput, MultiSelectChecklist, MultiSelectDropdown, TagInput, DocumentUploadField } from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import { resubmitDoctorRegistration } from '@/lib/actions/registration'
import {
  doctorRegistrationSchema,
  doctorRoleLabels,
  doctorRoles,
  workingDayLabels,
  workingDays,
  type DoctorRegistrationInput,
} from '@/lib/validations/doctor-registration'
import type { HospitalOption } from '@/lib/data/hospitals'

const LANGUAGES = ['English', 'Mandarin (Chinese)']

type Props = {
  doctorId: string
  userId: string
  defaultValues: DoctorRegistrationInput
  specialties: SpecialtyOption[]
  hospitalOptions: HospitalOption[]
}

/**
 * Minimal single-page resubmit form — a lightweight stand-in for what
 * Module 03's full doctor profile edit form will eventually own.
 */
export function DoctorResubmitForm({ doctorId, userId, defaultValues, specialties, hospitalOptions }: Props) {
  const router = useRouter()
  const form = useForm<DoctorRegistrationInput>({
    resolver: zodResolver(doctorRegistrationSchema),
    defaultValues,
  })

  async function onSubmit(values: DoctorRegistrationInput) {
    const result = await resubmitDoctorRegistration(doctorId, values)
    if (!result.data) {
      toast.error(result.error ?? 'Something went wrong.')
      return
    }
    toast.success('Registration resubmitted for review.')
    router.refresh()
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Number</FormLabel>
              <PhoneInput
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={field.disabled}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="profilePhoto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile Image</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={userId}
                  maxFiles={1}
                  value={field.value ? [field.value] : []}
                  onChange={(files) => field.onChange(files[0] ?? null)}
                />
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
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
        <FormField
          control={form.control}
          name="certificates"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Documents (Medical License, Degree Certificate)</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={userId}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Resubmitting…' : 'Resubmit for Review'}
        </Button>
      </form>
    </Form>
  )
}
