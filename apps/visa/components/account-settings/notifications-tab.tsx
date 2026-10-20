'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, ToggleSwitch } from '@iha/ui'
import { updateLawyerNotificationPreferences } from '@/lib/actions/account-settings'

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
      <ToggleSwitch checked={checked} disabled={disabled} onChange={onChange} label={label} />
    </div>
  )
}

type Props = {
  emailEnabled: boolean
  smsEnabled: boolean
}

export function NotificationsTab({ emailEnabled: initialEmailEnabled, smsEnabled: initialSmsEnabled }: Props) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled)
  const [smsEnabled, setSmsEnabled] = useState(initialSmsEnabled)
  const [isSaving, setIsSaving] = useState(false)

  async function handleChange(next: { email_notifications_enabled: boolean; sms_notifications_enabled: boolean }) {
    setIsSaving(true)
    const result = await updateLawyerNotificationPreferences(next)
    setIsSaving(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      setEmailEnabled(initialEmailEnabled)
      setSmsEnabled(initialSmsEnabled)
      return
    }

    toast.success('Notification preferences updated.')
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Notification Preferences</CardTitle>
        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500">
          In-portal notifications are always on. Choose which additional channels you&apos;d like to receive
          updates on.
        </p>
        <div className="mt-2 divide-y divide-slate-100">
          <ToggleRow
            label="Email notifications"
            description="Receive emails for case assignments, messages, and document requests."
            checked={emailEnabled}
            disabled={isSaving}
            onChange={(checked) => {
              setEmailEnabled(checked)
              handleChange({ email_notifications_enabled: checked, sms_notifications_enabled: smsEnabled })
            }}
          />
          <ToggleRow
            label="SMS notifications"
            description="Receive text messages for time-sensitive updates like new case assignments."
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
