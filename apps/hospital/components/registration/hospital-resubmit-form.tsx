'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getCountries } from 'react-phone-number-input'
import en from 'react-phone-number-input/locale/en.json'
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  PhoneInput,
  MultiSelectChecklist,
  TagInput,
  DocumentUploadField,
} from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import { resubmitHospitalRegistration } from '@/lib/actions/registration'
import {
  hospitalRegistrationSchema,
  hospitalTypeLabels,
  hospitalTypes,
  type HospitalRegistrationInput,
} from '@/lib/validations/hospital-registration'

const countryNames = en as Record<string, string>
const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryNames[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name))

type Props = {
  hospitalId: string
  userId: string
  defaultValues: HospitalRegistrationInput
  specialties: SpecialtyOption[]
}

/**
 * Minimal single-page resubmit form — a lightweight stand-in for what
 * Module 02's full hospital profile edit form will eventually own. Uses the
 * same combined Zod schema and RPC as the registration wizard.
 */
export function HospitalResubmitForm({ hospitalId, userId, defaultValues, specialties }: Props) {
  const router = useRouter()
  const form = useForm<HospitalRegistrationInput>({
    resolver: zodResolver(hospitalRegistrationSchema),
    defaultValues,
  })

  async function onSubmit(values: HospitalRegistrationInput) {
    const result = await resubmitHospitalRegistration(hospitalId, values)
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hospital Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="registrationNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Registration Number</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="abnNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ABN Number</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="phone"
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
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                  <FormControl>
                    <SelectTrigger className={cn(!field.value && 'text-slate-400')}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State / City</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="zipCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zip Code</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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
                <MultiSelectChecklist
                  options={specialties.map((s) => ({ value: s.name, label: s.label_en }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-3">
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
        </div>
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
        <div className="grid gap-4 sm:grid-cols-3">
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
        </div>
        <FormField
          control={form.control}
          name="certificates"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Documents</FormLabel>
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
