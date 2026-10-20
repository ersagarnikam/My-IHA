'use client'

import { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { Button, Form, FormField, FormItem, FormLabel, FormMessage } from '@iha/ui'
import type { MedicalBackgroundInput } from '@iha/validations'
import { TagInput } from './tag-input'

type Props = {
  form: UseFormReturn<MedicalBackgroundInput>
  onNext: (data: MedicalBackgroundInput) => Promise<void>
  onBack: () => void
}

export function MedicalBackgroundStep({ form, onNext, onBack }: Props) {
  const t = useTranslations('profile')
  const tWizard = useTranslations('profile.setupWizard')

  return (
    <Form {...form}>
      <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('medicalBackground.sharedWithHospitals')}
      </p>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <FormField
          control={form.control}
          name="medical_history"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('medicalBackground.fields.medicalHistory')}</FormLabel>
              <textarea
                {...field}
                rows={3}
                placeholder={tWizard('medicalHistoryPlaceholder')}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="allergies"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('medicalBackground.fields.allergies')}</FormLabel>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('medicalBackground.tagPlaceholder')}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="current_medications"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('medicalBackground.fields.currentMedications')}</FormLabel>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('medicalBackground.tagPlaceholder')}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="past_surgeries"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('medicalBackground.fields.pastSurgeries')}</FormLabel>
              <textarea
                {...field}
                rows={3}
                placeholder={tWizard('pastSurgeriesPlaceholder')}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            {tWizard('back')}
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {tWizard('next')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
