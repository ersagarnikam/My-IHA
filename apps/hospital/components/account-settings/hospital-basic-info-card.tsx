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
  PhoneInput,
} from '@iha/ui'
import {
  hospitalAccountBasicInfoSchema,
  type HospitalAccountBasicInfoInput,
} from '@/lib/validations/account-settings'
import { updateHospitalBasicInfo } from '@/lib/actions/account-settings'
import type { HospitalAccountSettings } from '@/lib/data/account-settings'

type Fields = HospitalAccountBasicInfoInput

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export function HospitalBasicInfoCard({ hospital, email }: { hospital: HospitalAccountSettings; email: string }) {
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const defaultValues: Fields = {
    name: hospital.name,
    registrationNumber: hospital.registrationNumber,
    abnNumber: hospital.abnNumber,
    phone: hospital.phone,
    country: hospital.country,
    city: hospital.city,
    address: hospital.address,
    zipCode: hospital.zipCode,
  }

  const form = useForm<Fields>({
    resolver: zodResolver(hospitalAccountBasicInfoSchema),
    defaultValues,
  })

  async function onSubmit(data: Fields) {
    setIsLoading(true)
    const result = await updateHospitalBasicInfo(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Hospital information updated.')
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Hospital Information</CardTitle>
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
            <Field label="Hospital Name" value={hospital.name} />
            <Field label="Registration Number" value={hospital.registrationNumber} />
            <Field label="ABN Number" value={hospital.abnNumber} />
            <Field label="Hospital Email" value={email} />
            <Field label="Contact Number" value={hospital.phone} />
            <Field label="Country" value={hospital.country} />
            <Field label="State/City" value={hospital.city} />
            <Field label="Zip Code" value={hospital.zipCode} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Full Address" value={hospital.address} />
            </div>
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none text-foreground">
                    Hospital Email
                  </label>
                  <Input value={email} readOnly className="bg-slate-50 text-slate-500" />
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
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
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
                      <FormLabel>State/City</FormLabel>
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
