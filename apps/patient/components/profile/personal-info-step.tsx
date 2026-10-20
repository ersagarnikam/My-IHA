'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  Button,
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
import type { PersonalInfoInput } from '@iha/validations'
import { getCountries } from 'react-phone-number-input'
import en from 'react-phone-number-input/locale/en.json'
import { createClient } from '@iha/db/client'

const countryNames = en as Record<string, string>
const COUNTRIES = getCountries()
  .map((code) => ({ code, name: countryNames[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name))
import { updateAvatarUrl } from '@/lib/actions/profile'
import { PhoneInput } from '@/components/phone-input'

type Props = {
  form: UseFormReturn<PersonalInfoInput>
  userEmail: string
  userId: string
  avatarUrl: string | null
  onAvatarChange: (url: string) => void
  onNext: (data: PersonalInfoInput) => Promise<void>
}

const GENDER_VALUES = ['male', 'female', 'other', 'prefer_not_to_say'] as const

export function PersonalInfoStep({ form, userEmail, userId, avatarUrl, onAvatarChange, onNext }: Props) {
  const t = useTranslations('profile')
  const tWizard = useTranslations('profile.setupWizard')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(avatarUrl)
  const [isUploading, setIsUploading] = useState(false)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
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
    setPreview(localPreview)
    setIsUploading(true)

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${userId}/avatar.${ext}`

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error(t('personalDetails.uploadFailed'), { duration: Infinity })
      setPreview(avatarUrl)
      setIsUploading(false)
      return
    }

    const result = await updateAvatarUrl(ext)
    setIsUploading(false)

    if (result.error || !result.data) {
      toast.error(result.error ?? t('personalDetails.uploadFailed'), { duration: Infinity })
      setPreview(avatarUrl)
      return
    }

    onAvatarChange(result.data.avatarUrl)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        {/* Avatar upload */}
        <div className="flex flex-col items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-cyan-400 hover:bg-slate-100 disabled:opacity-60"
          >
            {preview ? (
              <img src={preview} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition group-hover:opacity-100">
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          </button>
          <span className="text-xs text-slate-500">
            {isUploading ? tWizard('uploadingPhoto') : tWizard('clickToUploadPhoto')}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('personalDetails.fields.fullName')}</FormLabel>
              <FormControl>
                <Input placeholder="William Sam" {...field} className="placeholder:text-slate-400" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date_of_birth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('personalDetails.fields.dateOfBirth')}{' '}
                <span className="text-xs font-normal text-amber-600">{tWizard('importantForVisa')}</span>
              </FormLabel>
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
                  <SelectTrigger className={cn(!field.value && 'text-slate-400')}>
                    <SelectValue placeholder={t('select')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {GENDER_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`personalDetails.genders.${value}`)}
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
              <FormLabel>
                {t('personalDetails.fields.nationality')}{' '}
                <span className="text-xs font-normal text-amber-600">{tWizard('importantForVisa')}</span>
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                <FormControl>
                  <SelectTrigger className={cn(!field.value && 'text-slate-400')}>
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
                  <SelectTrigger className={cn(!field.value && 'text-slate-400')}>
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

        <div>
          <label className="mb-1.5 block text-sm font-medium leading-none text-foreground">
            {tWizard('emailLabel')}
          </label>
          <Input value={userEmail} readOnly className="bg-slate-50 text-slate-500" />
        </div>

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
            <FormItem>
              <FormLabel>{t('personalDetails.fields.address')} <span className="text-xs font-normal text-slate-400">{tWizard('optional')}</span></FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={3}
                  placeholder={t('personalDetails.addressPlaceholder')}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={form.formState.isSubmitting} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {tWizard('next')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
