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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  MultiSelectDropdown,
  MultiSelectChecklist,
} from '@iha/ui'
import type { SpecialtyOption } from '@iha/db/specialties'
import type { HospitalOption } from '@/lib/data/hospitals'
import { doctorRoles, doctorRoleLabels } from '@/lib/validations/doctor-registration'
import {
  doctorProfessionalDetailsSchema,
  languageOptions,
  type DoctorProfessionalDetailsInput,
} from '@/lib/validations/account-settings'
import { updateDoctorProfessionalDetails } from '@/lib/actions/account-settings'
import type { DoctorAccountSettings } from '@/lib/data/account-settings'

type ProfessionalFields = DoctorProfessionalDetailsInput

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900 whitespace-pre-wrap">{value || '—'}</dd>
    </div>
  )
}

type Props = {
  doctor: DoctorAccountSettings
  specialtyOptions: SpecialtyOption[]
  hospitalOptions: HospitalOption[]
}

export function ProfessionalDetailsCard({ doctor, specialtyOptions, hospitalOptions }: Props) {
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const defaultValues: ProfessionalFields = {
    specialties: doctor.specialties,
    qualifications: doctor.qualifications,
    yearsOfExperience: doctor.yearsOfExperience,
    licenseNumber: doctor.licenseNumber,
    bio: doctor.bio,
    languagesSpoken: doctor.languagesSpoken,
    department: doctor.department,
    role: (doctor.role as ProfessionalFields['role']) ?? 'consultant',
    hospitalAffiliations: doctor.hospitalAffiliations,
  }

  const form = useForm<ProfessionalFields>({
    resolver: zodResolver(doctorProfessionalDetailsSchema),
    defaultValues,
  })

  async function onSubmit(data: ProfessionalFields) {
    setIsLoading(true)
    const result = await updateDoctorProfessionalDetails(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Professional details updated.')
    setEditing(false)
  }

  const specialtyLabel = (name: string) => specialtyOptions.find((s) => s.name === name)?.label_en ?? name
  const hospitalLabel = (id: string) => hospitalOptions.find((h) => h.id === id)?.name ?? id
  const roleLabel = doctor.role ? doctorRoleLabels[doctor.role as keyof typeof doctorRoleLabels] : null

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
            <Field label="Specialization" value={doctor.specialties.map(specialtyLabel).join(', ')} />
            <Field label="Qualification" value={doctor.qualifications} />
            <Field label="Experience (Years)" value={String(doctor.yearsOfExperience)} />
            <Field label="License Number" value={doctor.licenseNumber} />
            <Field label="Department" value={doctor.department} />
            <Field label="Role" value={roleLabel} />
            <Field label="Languages Spoken" value={doctor.languagesSpoken.join(', ')} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Hospital Affiliations" value={doctor.hospitalAffiliations.map(hospitalLabel).join(', ')} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Bio" value={doctor.bio} />
            </div>
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="specialties"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specialization</FormLabel>
                      <FormControl>
                        <MultiSelectDropdown
                          options={specialtyOptions.map((s) => ({ value: s.name, label: s.label_en }))}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="qualifications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qualification</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearsOfExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experience (Years)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={70} {...field} />
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
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                        <FormControl>
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {doctorRoles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {doctorRoleLabels[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="languagesSpoken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Languages Spoken</FormLabel>
                    <FormControl>
                      <MultiSelectChecklist
                        options={languageOptions.map((l) => ({ value: l, label: l }))}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hospitalAffiliations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hospital Affiliations</FormLabel>
                    <FormControl>
                      <MultiSelectChecklist
                        options={hospitalOptions.map((h) => ({
                          value: h.id,
                          label: h.name,
                          description: `${h.city}, ${h.country}`,
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                        emptyMessage="No hospitals available yet."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
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
