'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import type { Patient } from '@iha/db/types'
import { updateNotificationPreferences } from '@/lib/actions/profile'

type ToggleRowProps = {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-cyan-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export function NotificationsTab({ patient }: { patient: Patient }) {
  const t = useTranslations('profile.notifications')
  const [emailEnabled, setEmailEnabled] = useState(patient.email_notifications_enabled)
  const [smsEnabled, setSmsEnabled] = useState(patient.sms_notifications_enabled)
  const [isSaving, setIsSaving] = useState(false)

  async function handleChange(next: { email_notifications_enabled: boolean; sms_notifications_enabled: boolean }) {
    setIsSaving(true)
    const result = await updateNotificationPreferences(next)
    setIsSaving(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      setEmailEnabled(patient.email_notifications_enabled)
      setSmsEnabled(patient.sms_notifications_enabled)
      return
    }

    toast.success(t('saved'))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500">{t('intro')}</p>
        <div className="mt-2 divide-y divide-slate-100">
          <ToggleRow
            label={t('email.label')}
            description={t('email.description')}
            checked={emailEnabled}
            disabled={isSaving}
            onChange={(checked) => {
              setEmailEnabled(checked)
              handleChange({ email_notifications_enabled: checked, sms_notifications_enabled: smsEnabled })
            }}
          />
          <ToggleRow
            label={t('sms.label')}
            description={t('sms.description')}
            checked={smsEnabled}
            disabled={isSaving}
            onChange={(checked) => {
              setSmsEnabled(checked)
              handleChange({ email_notifications_enabled: emailEnabled, sms_notifications_enabled: checked })
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
