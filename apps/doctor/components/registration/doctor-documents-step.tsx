'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, DocumentUploadField } from '@iha/ui'
import { doctorDocumentsStepSchema } from '@/lib/validations/doctor-registration'
import type { z } from 'zod'

type StepValues = z.infer<typeof doctorDocumentsStepSchema>

type Props = {
  uploadPathPrefix: string
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack: () => void
}

export function DoctorDocumentsStep({ uploadPathPrefix, defaultValues, onNext, onBack }: Props) {
  const form = useForm({
    resolver: zodResolver(doctorDocumentsStepSchema),
    defaultValues: { medicalLicense: null, degreeCertificate: null, ...defaultValues },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Verification & Setup</h2>
        <FormField
          control={form.control}
          name="medicalLicense"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Medical License</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={uploadPathPrefix}
                  maxFiles={1}
                  category="medical_license"
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
          name="degreeCertificate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Degree Certificate</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={uploadPathPrefix}
                  maxFiles={1}
                  category="degree_certificate"
                  value={field.value ? [field.value] : []}
                  onChange={(files) => field.onChange(files[0] ?? null)}
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
