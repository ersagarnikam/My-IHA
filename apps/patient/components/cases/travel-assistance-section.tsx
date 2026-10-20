'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button, Checkbox } from '@iha/ui'
import { updateTravelAssistance } from '@/lib/actions/cases'

type Props = {
  caseId: string
  needTravelAssistance: boolean
  needStayBookingAssistance: boolean
  needTransportationAssistance: boolean
}

export function TravelAssistanceSection({
  caseId,
  needTravelAssistance,
  needStayBookingAssistance,
  needTransportationAssistance,
}: Props) {
  const t = useTranslations('caseDetail')
  const router = useRouter()
  const [needTravel, setNeedTravel] = useState(needTravelAssistance)
  const [needStay, setNeedStay] = useState(needStayBookingAssistance)
  const [needTransportation, setNeedTransportation] = useState(needTransportationAssistance)
  const [isSaving, setIsSaving] = useState(false)

  const dirty =
    needTravel !== needTravelAssistance ||
    needStay !== needStayBookingAssistance ||
    needTransportation !== needTransportationAssistance

  async function handleSave() {
    setIsSaving(true)
    const result = await updateTravelAssistance(caseId, needTravel, needStay, needTransportation)
    setIsSaving(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }

    toast.success(t('travelAssistanceSaved'))
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t('travelAssistance')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('travelAssistanceDesc')}</p>
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <Checkbox checked={needTravel} onCheckedChange={(checked: boolean | 'indeterminate') => setNeedTravel(checked === true)} />
          {t('needTravelAssistance')}
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <Checkbox checked={needStay} onCheckedChange={(checked: boolean | 'indeterminate') => setNeedStay(checked === true)} />
          {t('needStayBookingAssistance')}
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <Checkbox
            checked={needTransportation}
            onCheckedChange={(checked: boolean | 'indeterminate') => setNeedTransportation(checked === true)}
          />
          {t('needTransportationAssistance')}
        </label>
      </div>
      <Button
        onClick={handleSave}
        disabled={!dirty}
        loading={isSaving}
        className="mt-4 h-8 bg-cyan-600 px-3 text-xs text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        {t('save')}
      </Button>
    </section>
  )
}
