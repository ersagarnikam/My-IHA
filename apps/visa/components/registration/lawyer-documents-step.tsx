'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, DocumentUploadField } from '@iha/ui'
import { lawyerDocumentsStepSchema } from '@/lib/validations/lawyer-registration'
import type { z } from 'zod'

type StepValues = z.infer<typeof lawyerDocumentsStepSchema>

type Props = {
  uploadPathPrefix: string
  defaultValues?: Partial<StepValues>
  onNext: (values: StepValues) => void
  onBack: () => void
}

export function LawyerDocumentsStep({ uploadPathPrefix, defaultValues, onNext, onBack }: Props) {
  const form = useForm({
    resolver: zodResolver(lawyerDocumentsStepSchema),
    defaultValues: {
      licenseCertificate: null,
      immigrationLawCertificationDocument: null,
      otherDocuments: [],
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-6">
        <FormField
          control={form.control}
          name="licenseCertificate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registration / License Certificate</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={uploadPathPrefix}
                  category="license_certificate"
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
          name="immigrationLawCertificationDocument"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Immigration Law Certification</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={uploadPathPrefix}
                  category="immigration_law_certification"
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
          name="otherDocuments"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Other Documents</FormLabel>
              <FormControl>
                <DocumentUploadField
                  bucket="registration-documents"
                  pathPrefix={uploadPathPrefix}
                  category="other"
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
