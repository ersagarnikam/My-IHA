'use client'

import { MapPin, CheckCircle2, Video } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@iha/ui'
import type { TreatmentOptionWithDetails } from '@iha/db/treatments'
import type { ConsultationRequest } from '@iha/db/consultations'
import type { SpecialtyLabelMap } from '@iha/db/specialties'
import { getSpecialtyLabel } from '@/lib/specialty-label'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount)
}

type Props = {
  option: TreatmentOptionWithDetails
  selectionLocked: boolean
  consultation?: ConsultationRequest | null
  specialtyLabelMap: SpecialtyLabelMap
  onViewDetails: (option: TreatmentOptionWithDetails) => void
  compact?: boolean
}

export function TreatmentOptionCard({ option, selectionLocked, consultation, specialtyLabelMap, onViewDetails, compact = false }: Props) {
  const t = useTranslations('treatments')
  const locale = useLocale()
  const hospital = option.hospitals
  const doctor = option.doctors
  const total = option.cost_breakdown.total

  const hasActiveConsultation = !!consultation && consultation.status !== 'cancelled'
  const isDisabled = selectionLocked && !option.is_selected && !hasActiveConsultation

  return (
    <div
      className={`flex flex-col rounded-xl border bg-white transition-shadow ${
        option.is_selected
          ? 'border-cyan-400 shadow-md shadow-cyan-100 ring-1 ring-inset ring-cyan-400'
          : isDisabled
            ? 'border-slate-200 opacity-60'
            : 'border-slate-200 hover:shadow-md'
      }`}
    >
      {/* Card header */}
      <div className="border-b border-slate-100 p-4">
        {option.is_selected && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('selected')}
          </span>
        )}
        {consultation && consultation.status !== 'cancelled' && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
            <Video className="h-3.5 w-3.5" />
            {t(`consultationStatus.${consultation.status}` as never)}
          </span>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{hospital.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {hospital.city}, {hospital.country}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-700">
            {doctor.full_name.split(' ').slice(-1)[0]?.[0] ?? 'D'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{doctor.full_name}</p>
            <p className="truncate text-xs text-slate-500">
              {getSpecialtyLabel(doctor.specialties?.[0] ?? '', locale, specialtyLabelMap)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      {!compact && (
        <div className="px-4 py-3">
          <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{option.treatment_summary}</p>
        </div>
      )}

      {/* Footer: cost + action */}
      <div className={`mt-auto flex items-center justify-between gap-3 px-4 pb-4 ${compact ? 'pt-4' : 'pt-2'}`}>
        <div>
          <p className="text-xs text-slate-400">{t('total')}</p>
          <p className="text-base font-bold text-slate-900">{formatAUD(total)}</p>
        </div>
        <Button
          size="sm"
          variant={option.is_selected ? 'outline' : 'default'}
          disabled={isDisabled}
          onClick={() => onViewDetails(option)}
          className={
            option.is_selected
              ? 'border-cyan-300 text-cyan-700 hover:bg-cyan-50'
              : isDisabled
                ? ''
                : 'bg-cyan-600 text-white hover:bg-cyan-700'
          }
        >
          {t('viewDetails')}
        </Button>
      </div>
    </div>
  )
}
