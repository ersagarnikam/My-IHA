'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@iha/ui'
import { emergencyContactSchema, type EmergencyContactInput } from '@iha/validations'
import type { Patient } from '@iha/db/types'
import { updateEmergencyContact } from '@/lib/actions/profile'
import { PhoneInput } from '@/components/phone-input'

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
] as const

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export function EmergencyContactCard({ patient }: { patient: Patient }) {
  const t = useTranslations('profile')
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<EmergencyContactInput>({
    resolver: zodResolver(emergencyContactSchema),
    defaultValues: {
      emergency_contact_name: patient.emergency_contact_name ?? '',
      emergency_contact_relationship: patient.emergency_contact_relationship ?? '',
      emergency_contact_phone: patient.emergency_contact_phone ?? '',
    },
  })

  async function onSubmit(data: EmergencyContactInput) {
    setIsLoading(true)
    const result = await updateEmergencyContact(data)
    setIsLoading(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success(t('emergencyContact.saved'))
    setEditing(false)
  }

  const storedRel = patient.emergency_contact_relationship
  const relLabel = storedRel && RELATIONSHIPS.includes(storedRel as typeof RELATIONSHIPS[number])
    ? t(`emergencyContact.relationships.${storedRel}` as never)
    : storedRel

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t('emergencyContact.title')}</CardTitle>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            {t('edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('emergencyContact.fields.name')} value={patient.emergency_contact_name} />
            <Field label={t('emergencyContact.fields.relationship')} value={relLabel} />
            <Field label={t('emergencyContact.fields.phone')} value={patient.emergency_contact_phone} />
          </dl>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="emergency_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('emergencyContact.fields.contactName')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                          <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                            <SelectValue placeholder={t('select')} />
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
