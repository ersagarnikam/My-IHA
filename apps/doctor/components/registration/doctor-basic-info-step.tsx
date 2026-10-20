'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, PhoneInput, DocumentUploadField } from '@iha/ui'
import { doctorBasicInfoStepSchema, type DoctorRegistrationInput } from '@/lib/validations/doctor-registration'

type StepValues = Pick<DoctorRegistrationInput, 'fullName' | 'contactPhone' | 'profilePhoto'>

type Props = {
  uploadPathPrefix: string
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
}

export function DoctorBasicInfoStep({ uploadPathPrefix, defaultValues, onNext }: Props) {
  const form = useForm<StepValues>({
    resolver: zodResolver(doctorBasicInfoStepSchema),
    defaultValues: {
      fullName: '',
      contactPhone: '',
      profilePhoto: null,
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Basic Information</h2>
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
                  pathPrefix={uploadPathPrefix}
                  maxFiles={1}
                  value={field.value ? [field.value] : []}
                  onChange={(files) => field.onChange(files[0] ?? null)}
                />
              </FormControl>
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
