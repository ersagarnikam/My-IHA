'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Video, CheckCircle2, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@iha/ui'
import type { ConsultationRequest } from '@iha/db/consultations-shared'
import { CONSULTATION_FEE_AUD } from '@iha/db/consultations-shared'
import { requestConsultation, chooseConsultationSlot } from '@/lib/actions/consultations'
import { SlotTimeZones } from '@/components/treatments/slot-time-zones'

const JOIN_WINDOW_MINUTES_BEFORE = 15

type Props = {
  consultation: ConsultationRequest | null
  treatmentOptionId: string
  caseId: string
}

export function ConsultationPanel({ consultation, treatmentOptionId, caseId }: Props) {
  const router = useRouter()
  const t = useTranslations('consultation')
  const [submitting, setSubmitting] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [isChangingSlot, setIsChangingSlot] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  async function handleRequest() {
    setSubmitting(true)
    const result = await requestConsultation(treatmentOptionId, caseId)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error, { duration: 6000 })
      return
    }

    toast.success(t('successToast'))
    router.refresh()
  }

  async function handleConfirmSlot() {
    if (!consultation || !selectedSlotId) return
    setSubmitting(true)
    const result = await chooseConsultationSlot(consultation.id, selectedSlotId, caseId)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error, { duration: 6000 })
      return
    }

    setIsChangingSlot(false)
    toast.success(t('timeConfirmed'))
    router.refresh()
  }

  function handleStartChangingSlot() {
    setSelectedSlotId(consultation?.selected_slot_id ?? null)
    setIsChangingSlot(true)
  }

  const selectedSlot = consultation?.slots.find((s) => s.id === consultation.selected_slot_id)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Video className="h-4 w-4 text-cyan-600" />
        {t('onlineConsultation')}
      </h3>

      {!consultation && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {t('preRequestText')}
          </p>
          <Button
            onClick={handleRequest}
            loading={submitting}
            variant="outline"
            className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
          >
            {submitting ? t('requesting') : t('requestButton')}
          </Button>
        </>
      )}

      {consultation?.status === 'requested' && (
        <p className="text-sm text-slate-600">
          {t('requestSent')}
        </p>
      )}

      {(consultation?.status === 'slots_proposed' ||
        (consultation?.status === 'slot_selected' && isChangingSlot)) && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t('selectTimePrompt')}</p>
          <div className="space-y-2">
            {consultation.slots.map((slot) => (
              <label
                key={slot.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  selectedSlotId === slot.id
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="consultation-slot"
                  className="mt-1 accent-cyan-600"
                  checked={selectedSlotId === slot.id}
                  onChange={() => setSelectedSlotId(slot.id)}
                />
                <SlotTimeZones startIso={slot.slot_time} endIso={slot.slot_end_time} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleConfirmSlot}
              disabled={!selectedSlotId}
              loading={submitting}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              {submitting ? t('confirmingTime') : t('confirmSelectedTime')}
            </Button>
            {isChangingSlot && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setIsChangingSlot(false)}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t('cancelChange')}
              </Button>
            )}
          </div>
        </div>
      )}

      {consultation?.status === 'slot_selected' && !isChangingSlot && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            {selectedSlot ? (
              <div>
                <p className="mb-1">{t('selectedTimeLabel')}</p>
                <SlotTimeZones startIso={selectedSlot.slot_time} endIso={selectedSlot.slot_end_time} />
              </div>
            ) : (
              <p>{t('selectedTime', { time: t('selectedTimeDefault') })}</p>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {t('payFeeText', { fee: CONSULTATION_FEE_AUD.toFixed(2) })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/cases/${caseId}/consultations/${consultation.id}/payment`}>
              <Button className="bg-cyan-600 text-white hover:bg-cyan-700">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                {t('payFeeButton', { fee: CONSULTATION_FEE_AUD.toFixed(2) })}
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={handleStartChangingSlot}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {t('changeTimeButton')}
            </Button>
          </div>
        </div>
      )}

      {consultation?.status === 'scheduled' && (() => {
        const slotStart = selectedSlot ? new Date(selectedSlot.slot_time) : null
        const slotEnd = selectedSlot ? new Date(selectedSlot.slot_end_time) : null
        const joinOpensAt = slotStart ? new Date(slotStart.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60000) : null
        const hasEnded = !!(now && slotEnd && now > slotEnd)
        const canJoin = !!(now && joinOpensAt && slotEnd && now >= joinOpensAt && now <= slotEnd)

        return (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              {selectedSlot ? (
                <div>
                  <p className="mb-1">{t('scheduledForLabel')}</p>
                  <SlotTimeZones startIso={selectedSlot.slot_time} endIso={selectedSlot.slot_end_time} />
                </div>
              ) : (
                <p>{t('scheduledFor', { time: t('scheduledForDefault') })}</p>
              )}
            </div>
            {consultation.zoom_link && now && (
              hasEnded ? (
                <p className="text-sm text-slate-400">{t('consultationEnded')}</p>
              ) : canJoin ? (
                <a
                  href={consultation.zoom_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
                >
                  <Video className="h-4 w-4" />
                  {t('joinZoom')}
                </a>
              ) : (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400">
                    <Video className="h-4 w-4" />
                    {t('joinZoom')}
                  </span>
                  <p className="text-xs text-slate-400">
                    {t('joinLinkEnabled', { minutes: JOIN_WINDOW_MINUTES_BEFORE })}
                  </p>
                </div>
              )
            )}
          </div>
        )
      })()}

      {consultation?.status === 'cancelled' && (
        <p className="text-sm text-slate-400">{t('cancelled')}</p>
      )}
    </div>
  )
}
