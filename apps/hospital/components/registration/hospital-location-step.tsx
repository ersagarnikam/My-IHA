'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
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
} from '@iha/ui'
import {
  hospitalLocationStepSchema,
  type HospitalRegistrationInput,
} from '@/lib/validations/hospital-registration'

const countryNames = en as Record<string, string>
const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryNames[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name))

type StepValues = Pick<HospitalRegistrationInput, 'country' | 'city' | 'address' | 'zipCode'>

type Props = {
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack: () => void
}

export function HospitalLocationStep({ defaultValues, onNext, onBack }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(hospitalLocationStepSchema),
    defaultValues: { country: 'Australia', city: '', address: '', zipCode: '', ...defaultValues },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
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
