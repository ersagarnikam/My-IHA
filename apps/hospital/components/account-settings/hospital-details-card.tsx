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
  MultiSelectDropdown,
  TagInput,
} from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import {
  hospitalAccountDetailsSchema,
  type HospitalAccountDetailsInput,
} from '@/lib/validations/account-settings'
import { hospitalTypeLabels, hospitalTypes } from '@/lib/validations/hospital-registration'
import { updateHospitalDetails } from '@/lib/actions/account-settings'
import type { HospitalAccountSettings } from '@/lib/data/account-settings'

type Fields = HospitalAccountDetailsInput

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

type Props = {
  hospital: HospitalAccountSettings
  specialtyOptions: SpecialtyOption[]
}

export function HospitalDetailsCard({ hospital, specialtyOptions }: Props) {
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const defaultValues: Fields = {
    registrationType: (hospital.registrationType as Fields['registrationType']) ?? 'multi_specialty',
    specialties: hospital.specialties,
    bedCount: hospital.bedCount,
    roomTypes: hospital.roomTypes,
    licenseNumber: hospital.licenseNumber,
    accreditationBody: hospital.accreditationBody,
  }

  const form = useForm<Fields>({
    resolver: zodResolver(hospitalAccountDetailsSchema),
    defaultValues,
  })

  async function onSubmit(data: Fields) {
    setIsLoading(true)
    const result = await updateHospitalDetails(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Hospital details updated.')
    setEditing(false)
  }

  const specialtyLabel = (name: string) => specialtyOptions.find((s) => s.name === name)?.label_en ?? name
  const typeLabel = hospital.registrationType
    ? hospitalTypeLabels[hospital.registrationType as keyof typeof hospitalTypeLabels]
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Hospital Details</CardTitle>
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
            <Field label="Hospital Type" value={typeLabel} />
            <Field label="Number of Beds" value={String(hospital.bedCount)} />
            <Field label="License Number" value={hospital.licenseNumber} />
            <Field label="Accreditation" value={hospital.accreditationBody} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Specialties" value={hospital.specialties.map(specialtyLabel).join(', ')} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Room Types" value={hospital.roomTypes.join(', ')} />
            </div>
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <MultiSelectDropdown
                        options={specialtyOptions.map((s) => ({ value: s.name, label: s.label_en }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select specialties"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
