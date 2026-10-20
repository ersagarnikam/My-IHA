'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
} from '@iha/ui'
import { medicalBackgroundSchema, type MedicalBackgroundInput } from '@iha/validations'
import type { Patient } from '@iha/db/types'
import { updateMedicalBackground } from '@/lib/actions/profile'
import { TagInput } from './tag-input'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function TagsField({ label, tags }: { label: string; tags: string[] | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1">
        {tags && tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex rounded bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-slate-900">—</span>
        )}
      </dd>
    </div>
  )
}

export function MedicalBackgroundCard({ patient }: { patient: Patient }) {
  const t = useTranslations('profile')
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<MedicalBackgroundInput>({
    resolver: zodResolver(medicalBackgroundSchema),
    defaultValues: {
      medical_history: patient.medical_history ?? '',
      allergies: patient.allergies ?? [],
      current_medications: patient.current_medications ?? [],
      past_surgeries: patient.past_surgeries ?? '',
    },
  })

  async function onSubmit(data: MedicalBackgroundInput) {
    setIsLoading(true)
    const result = await updateMedicalBackground(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success(t('medicalBackground.saved'))
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t('medicalBackground.title')}</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            {t('edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <>
            <p className="mb-3 text-xs text-slate-500 italic">
              {t('medicalBackground.sharedWithHospitals')}
            </p>
            <dl className="space-y-4">
              <Field label={t('medicalBackground.fields.medicalHistory')} value={patient.medical_history} />
              <TagsField label={t('medicalBackground.fields.allergies')} tags={patient.allergies} />
              <TagsField label={t('medicalBackground.fields.currentMedications')} tags={patient.current_medications} />
              <Field label={t('medicalBackground.fields.pastSurgeries')} value={patient.past_surgeries} />
            </dl>
          </>
        ) : (
          <Form {...form}>
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('medicalBackground.sharedWithHospitals')}
            </p>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="medical_history"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('medicalBackground.fields.medicalHistory')}</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>{t('medicalBackground.fields.allergies')}</FormLabel>
                <Controller
                  control={form.control}
                  name="allergies"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? []}
                      onChange={field.onChange}
                      placeholder={t('medicalBackground.tagPlaceholder')}
                    />
                  )}
                />
              </FormItem>

              <FormItem>
                <FormLabel>{t('medicalBackground.fields.currentMedications')}</FormLabel>
                <Controller
                  control={form.control}
                  name="current_medications"
                  render={({ field }) => (
                    <TagInput
                      value={field.value ?? []}
                      onChange={field.onChange}
                      placeholder={t('medicalBackground.tagPlaceholder')}
                    />
                  )}
                />
              </FormItem>

              <FormField
                control={form.control}
                name="past_surgeries"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('medicalBackground.fields.pastSurgeries')}</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
