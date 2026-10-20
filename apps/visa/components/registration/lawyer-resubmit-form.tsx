'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, Textarea, cn, PhoneInput, DocumentUploadField } from '@iha/ui'
import { resubmitLawyerRegistration } from '@/lib/actions/registration'
import {
  lawyerRegistrationSchema,
  lawyerTypeLabels,
  lawyerTypes,
  type LawyerRegistrationInput,
} from '@/lib/validations/lawyer-registration'

type Props = {
  lawyerId: string
  userId: string
  defaultValues: LawyerRegistrationInput
}

/**
 * Minimal single-page resubmit form — a lightweight stand-in for what
 * Module 02's full lawyer profile edit form will eventually own. Uses the
 * same combined Zod schema and RPC as the registration wizard.
 */
export function LawyerResubmitForm({ lawyerId, userId, defaultValues }: Props) {
  const router = useRouter()
  const form = useForm<LawyerRegistrationInput>({
    resolver: zodResolver(lawyerRegistrationSchema),
    defaultValues,
  })

  const lawyerType = form.watch('lawyerType')

  async function onSubmit(values: LawyerRegistrationInput) {
    const result = await resubmitLawyerRegistration(lawyerId, values)
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
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
        <div className="grid gap-4 sm:grid-cols-2">
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
