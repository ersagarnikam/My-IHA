'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Loader2, Camera } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
} from '@iha/ui'
import { personalInfoSchema, type PersonalInfoInput } from '@iha/validations'
import type { Patient } from '@iha/db/types'
import { updatePersonalInfo, updateAvatarUrl } from '@/lib/actions/profile'
import { PhoneInput } from '@/components/phone-input'
import { getCountries } from 'react-phone-number-input'
import en from 'react-phone-number-input/locale/en.json'
import { createClient } from '@iha/db/client'

const countryNames = en as Record<string, string>
const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryNames[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name))

const GENDER_OPTION_KEYS = [
  { value: 'male',             key: 'male' },
  { value: 'female',           key: 'female' },
  { value: 'other',            key: 'other' },
  { value: 'prefer_not_to_say', key: 'prefer_not_to_say' },
] as const

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900 whitespace-pre-wrap">{value || '—'}</dd>
    </div>
  )
}

export function PersonalDetailsCard({ patient, email }: { patient: Patient; email: string }) {
  const t = useTranslations('profile')
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(patient.avatar_url ?? null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<PersonalInfoInput>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      full_name: patient.full_name ?? '',
      date_of_birth: patient.date_of_birth ?? '',
      gender: (patient.gender as PersonalInfoInput['gender']) ?? undefined,
      nationality: patient.nationality ?? '',
      country_of_residence: patient.country_of_residence ?? '',
      phone: patient.phone ?? '',
      address: patient.address ?? '',
    },
  })

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error(t('personalDetails.uploadPhotoError'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('personalDetails.photoTooLarge'))
      return
    }

    const localPreview = URL.createObjectURL(file)
    setAvatarPreview(localPreview)
    setIsUploading(true)

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${patient.user_id}/avatar.${ext}`

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error(t('personalDetails.uploadFailed'), { duration: Infinity })
      setAvatarPreview(patient.avatar_url ?? null)
      setIsUploading(false)
      return
    }

    const result = await updateAvatarUrl(ext)
    setIsUploading(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      setAvatarPreview(patient.avatar_url ?? null)
    }
  }

  async function onSubmit(data: PersonalInfoInput) {
    setIsLoading(true)
    const result = await updatePersonalInfo(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success(t('personalDetails.saved'))
    setEditing(false)
  }

  const genderLabel = patient.gender
    ? t(`personalDetails.genders.${patient.gender}` as never)
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          {/* Avatar with upload overlay */}
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
                  {patient.full_name?.charAt(0).toUpperCase() ?? '?'}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <CardTitle className="text-base">{t('personalDetails.title')}</CardTitle>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            {t('edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label={t('personalDetails.fields.fullName')} value={patient.full_name} />
            <Field label={t('personalDetails.fields.email')} value={email} />
            <Field label={t('personalDetails.fields.dateOfBirth')} value={patient.date_of_birth} />
            <Field label={t('personalDetails.fields.gender')} value={genderLabel} />
            <Field label={t('personalDetails.fields.nationality')} value={patient.nationality} />
            <Field label={t('personalDetails.fields.countryOfResidence')} value={patient.country_of_residence} />
            <Field label={t('personalDetails.fields.phone')} value={patient.phone} />
            {patient.address && (
              <div className="col-span-2 sm:col-span-3">
                <Field label={t('personalDetails.fields.address')} value={patient.address} />
              </div>
            )}
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('personalDetails.fields.fullName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none text-foreground">
                    {t('personalDetails.fields.email')}
                  </label>
                  <Input value={email} readOnly className="bg-slate-50 text-slate-500" />
                </div>
                <FormField
                  control={form.control}
                  name="date_of_birth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('personalDetails.fields.dateOfBirth')}</FormLabel>
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
                      <FormLabel>{t('personalDetails.fields.gender')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                        <FormControl>
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder={t('select')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GENDER_OPTION_KEYS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {t(`personalDetails.genders.${opt.key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('personalDetails.fields.nationality')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                        <FormControl>
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder={t('select')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country_of_residence"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('personalDetails.fields.countryOfResidence')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                        <FormControl>
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder={t('select')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('personalDetails.fields.phone')}</FormLabel>
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
                  name="address"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t('personalDetails.fields.address')}</FormLabel>
                      <FormControl>
                        <textarea
                          {...field}
                          rows={3}
                          placeholder={t('personalDetails.addressPlaceholder')}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" loading={isLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                  {t('save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.reset()
                    setEditing(false)
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
