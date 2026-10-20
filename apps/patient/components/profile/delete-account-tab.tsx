'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button, Input } from '@iha/ui'
import { deletePatientAccountAction } from '@/lib/actions/profile'

const CONFIRM_TEXT = 'DELETE'

export function DeleteAccountTab() {
  const t = useTranslations('profile.deleteAccount')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const ready = confirm === CONFIRM_TEXT

  async function handleDelete() {
    if (!ready) return
    setIsLoading(true)
    const result = await deletePatientAccountAction()
    if (result.error) {
      toast.error(t('failedToast'), { duration: Infinity })
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">{t('warningTitle')}</p>
            <p className="mt-1 text-sm text-red-700">{t('warningBody')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {t('confirmInstruction')}{' '}
          <span className="font-mono font-semibold text-slate-900">{CONFIRM_TEXT}</span>{' '}
          {t('confirmSuffix')}
        </p>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={CONFIRM_TEXT}
          className="font-mono"
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={!ready}
          loading={isLoading}
          onClick={handleDelete}
        >
          {t('deleteButton')}
        </Button>
      </div>
    </div>
  )
}
