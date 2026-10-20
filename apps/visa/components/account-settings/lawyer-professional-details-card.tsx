'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  cn,
} from '@iha/ui'
import {
  lawyerAccountProfessionalSchema,
  type LawyerAccountProfessionalInput,
} from '@/lib/validations/account-settings'
import { lawyerTypes, lawyerTypeLabels } from '@/lib/validations/lawyer-registration'
import { updateLawyerProfessionalDetails } from '@/lib/actions/account-settings'
import type { LawyerAccountSettings } from '@/lib/data/account-settings'

type Fields = LawyerAccountProfessionalInput

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export function LawyerProfessionalDetailsCard({ lawyer }: { lawyer: LawyerAccountSettings }) {
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const defaultValues: Fields = {
    lawyerType: (lawyer.lawyerType as Fields['lawyerType']) ?? 'individual',
    immigrationLawCertification: lawyer.immigrationLawCertification,
  }

  const form = useForm<Fields>({
    resolver: zodResolver(lawyerAccountProfessionalSchema),
    defaultValues,
  })

  async function onSubmit(data: Fields) {
    setIsLoading(true)
    const result = await updateLawyerProfessionalDetails(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Professional details updated.')
    setEditing(false)
  }

  const typeLabel = lawyer.lawyerType
    ? lawyerTypeLabels[lawyer.lawyerType as keyof typeof lawyerTypeLabels]
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Professional Details</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Registration Type" value={typeLabel} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Immigration Law Certification" value={lawyer.immigrationLawCertification} />
            </div>
          </dl>
        ) : (
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
                name="immigrationLawCertification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Immigration Law Certification</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" loading={isLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.reset(defaultValues)
                    setEditing(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
