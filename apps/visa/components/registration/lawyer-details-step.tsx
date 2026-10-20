'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, PhoneInput, Textarea } from '@iha/ui'
import { cn } from '@iha/ui'
import {
  lawyerDetailsStepSchema,
  lawyerTypeLabels,
  lawyerTypes,
  type LawyerRegistrationInput,
} from '@/lib/validations/lawyer-registration'

type StepValues = Pick<
  LawyerRegistrationInput,
  | 'lawyerType'
  | 'name'
  | 'registrationNumber'
  | 'abnNumber'
  | 'immigrationLawCertification'
  | 'phone'
  | 'address'
  | 'city'
  | 'zipCode'
>

type Props = {
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack?: () => void
}

export function LawyerDetailsStep({ defaultValues, onNext, onBack }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(lawyerDetailsStepSchema),
    defaultValues: {
      lawyerType: undefined,
      name: '',
      registrationNumber: '',
      abnNumber: '',
      immigrationLawCertification: '',
      phone: '',
      address: '',
      city: '',
      zipCode: '',
      ...defaultValues,
    },
  })

  const lawyerType = form.watch('lawyerType')

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <FormField
          control={form.control}
          name="lawyerType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registration Type</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-3">
                  {lawyerTypes.map((type) => (
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
                      {lawyerTypeLabels[type]}
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{lawyerType === 'law_firm' ? 'Firm Name' : 'Full Name'}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="registrationNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registration / License Number</FormLabel>
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
        <FormField
          control={form.control}
          name="immigrationLawCertification"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Immigration Law Certification Details</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
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
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City / State</FormLabel>
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
