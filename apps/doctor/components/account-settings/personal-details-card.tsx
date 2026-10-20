'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Loader2, Camera } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateInput,
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
  cn,
  PhoneInput,
} from '@iha/ui'
import { createClient } from '@iha/db/client'
import {
  doctorPersonalDetailsSchema,
  doctorGenders,
  doctorGenderLabels,
  type DoctorPersonalDetailsInput,
} from '@/lib/validations/account-settings'
import { updateDoctorProfile, updateDoctorAvatarUrl } from '@/lib/actions/account-settings'
import type { DoctorAccountSettings } from '@/lib/data/account-settings'

type PersonalFields = DoctorPersonalDetailsInput

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export function PersonalDetailsCard({ doctor, email }: { doctor: DoctorAccountSettings; email: string }) {
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(doctor.photoUrl)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultValues: Partial<PersonalFields> = {
    fullName: doctor.fullName,
    contactPhone: doctor.contactPhone,
    dateOfBirth: doctor.dateOfBirth ?? '',
    gender: doctor.gender ? (doctor.gender as PersonalFields['gender']) : undefined,
  }

  const form = useForm<PersonalFields>({
    resolver: zodResolver(doctorPersonalDetailsSchema),
    defaultValues,
  })

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB.')
      return
    }

    const localPreview = URL.createObjectURL(file)
    setAvatarPreview(localPreview)
    setIsUploading(true)

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const path = `${user?.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error('Failed to upload photo.', { duration: Infinity })
      setAvatarPreview(doctor.photoUrl)
      setIsUploading(false)
      return
    }

    const result = await updateDoctorAvatarUrl(ext)
    setIsUploading(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      setAvatarPreview(doctor.photoUrl)
    }
  }

  async function onSubmit(data: PersonalFields) {
    setIsLoading(true)
    const result = await updateDoctorProfile(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Personal details updated.')
    setEditing(false)
  }

  const genderLabel = doctor.gender ? doctorGenderLabels[doctor.gender as keyof typeof doctorGenderLabels] : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400 transition hover:ring-2 hover:ring-cyan-400 disabled:opacity-60"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-base font-semibold text-slate-500">
                  {doctor.fullName?.charAt(0).toUpperCase() ?? '?'}
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition group-hover:opacity-100">
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Camera className="h-4 w-4 text-white" />
                )}
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <CardTitle className="text-base">Personal Details</CardTitle>
        </div>
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
            <Field label="Full Name" value={doctor.fullName} />
            <Field label="Email" value={email} />
            <Field label="Phone Number" value={doctor.contactPhone} />
            <Field label="Date of Birth" value={doctor.dateOfBirth} />
            <Field label="Gender" value={genderLabel} />
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none text-foreground">Email</label>
                  <Input value={email} readOnly className="bg-slate-50 text-slate-500" />
                </div>
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <PhoneInput
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={field.disabled}
                        placeholder="400 000 000"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <DateInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                        <FormControl>
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {doctorGenders.map((g) => (
                            <SelectItem key={g} value={g}>
                              {doctorGenderLabels[g]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
