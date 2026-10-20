'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, PhoneInput } from '@iha/ui'
import {
  hospitalBasicInfoStepSchema,
  type HospitalRegistrationInput,
} from '@/lib/validations/hospital-registration'

type StepValues = Pick<HospitalRegistrationInput, 'name' | 'registrationNumber' | 'abnNumber' | 'phone'>

type Props = {
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
}

export function HospitalBasicInfoStep({ defaultValues, onNext }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(hospitalBasicInfoStepSchema),
    defaultValues: {
      name: '',
      registrationNumber: '',
      abnNumber: '',
      phone: '',
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
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
        <div className="flex justify-end pt-2">
          <Button type="submit" className="bg-cyan-600 text-white hover:bg-cyan-700">
            Next
          </Button>
        </div>
      </form>
    </Form>
  )
}
