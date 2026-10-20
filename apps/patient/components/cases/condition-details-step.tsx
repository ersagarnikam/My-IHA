'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from '@iha/ui'
import { getMedicalDetailsSchema, type MedicalDetailsInput } from '@iha/validations'
import type { SpecialtyOption } from '@iha/db/specialties'
import { SpecialtyCombobox } from './specialty-combobox'

type Props = {
  specialties: SpecialtyOption[]
  defaultValues?: Partial<MedicalDetailsInput>
  onNext: (data: MedicalDetailsInput) => void
}

export function ConditionDetailsStep({ specialties, defaultValues, onNext }: Props) {
  const t = useTranslations('caseWizard.conditionDetails')

  const medicalDetailsSchema = useMemo(() => getMedicalDetailsSchema({
    specialtyRequired: t('validation.specialtyRequired'),
    specialtyOtherMaxLength: t('validation.specialtyOtherMaxLength'),
    descriptionMinLength: t('validation.descriptionMinLength'),
    descriptionMaxLength: t('validation.descriptionMaxLength'),
    specialtyOtherRequired: t('validation.specialtyOtherRequired'),
  }), [t])

  const form = useForm<MedicalDetailsInput>({
    resolver: zodResolver(medicalDetailsSchema),
    defaultValues: {
      specialty: defaultValues?.specialty ?? '',
      specialty_other: defaultValues?.specialty_other ?? '',
      description: defaultValues?.description ?? '',
    },
  })

  useEffect(() => {
    const erroredFields = Object.keys(form.formState.errors) as Array<keyof MedicalDetailsInput>
    if (erroredFields.length > 0) {
      void form.trigger(erroredFields)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicalDetailsSchema])

  const watchedSpecialty = form.watch('specialty')

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
        </div>

        <FormField
          control={form.control}
          name="specialty"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('medicalCondition')}</FormLabel>
              <SpecialtyCombobox
                specialties={specialties}
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {watchedSpecialty === 'Other' && (
          <FormField
            control={form.control}
            name="specialty_other"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('describeCondition')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('describePlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('describeSymptoms')}</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={6}
                  placeholder={t('symptomsPlaceholder')}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </FormControl>
              <div className="flex justify-between">
                <FormMessage />
                <span className="ml-auto text-xs text-slate-400">
                  {field.value?.length ?? 0} / 2000
                </span>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={form.formState.isSubmitting} className="bg-cyan-600 text-white hover:bg-cyan-700">
            {t('next')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
