'use client'

import { UseFormReturn } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import {
  Button,
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
import type { EmergencyContactInput } from '@iha/validations'
import { PhoneInput } from '@/components/phone-input'

type Props = {
  form: UseFormReturn<EmergencyContactInput>
  onSubmit: (data: EmergencyContactInput) => Promise<void>
  onBack: () => void
}

const RELATIONSHIPS = [
  'Spouse',
  'Parent',
  'Child',
  'Sibling',
  'Grandparent',
  'Aunt / Uncle',
  'Cousin',
  'Friend',
  'Guardian',
  'Other',
]

export function EmergencyContactStep({ form, onSubmit, onBack }: Props) {
  const t = useTranslations('profile')
  const tWizard = useTranslations('profile.setupWizard')

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="emergency_contact_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('emergencyContact.fields.contactName')}</FormLabel>
              <FormControl>
                <Input placeholder="Full name" {...field} className="placeholder:text-slate-400" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="emergency_contact_relationship"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('emergencyContact.fields.relationship')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={field.disabled}>
                <FormControl>
                  <SelectTrigger className={cn(!field.value && 'text-slate-400')}>
                    <SelectValue placeholder={tWizard('selectRelationship')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`emergencyContact.relationships.${r}` as never)}
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
          name="emergency_contact_phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('emergencyContact.fields.phoneNumber')}</FormLabel>
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

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            {tWizard('back')}
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {tWizard('submit')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
