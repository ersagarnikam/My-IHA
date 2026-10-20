'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { TreatmentOptionWithDetails } from '@iha/db/treatments'
import type { ConsultationRequest } from '@iha/db/consultations'
import type { SpecialtyLabelMap } from '@iha/db/specialties'
import { TreatmentOptionCard } from './treatment-option-card'
import { TreatmentDetailModal } from './treatment-detail-modal'

type Props = {
  options: TreatmentOptionWithDetails[]
  caseId: string
  caseStatus: string
  consultations: Record<string, ConsultationRequest>
  specialtyLabelMap: SpecialtyLabelMap
}

export function TreatmentOptionsSection({ options, caseId, caseStatus, consultations, specialtyLabelMap }: Props) {
  const router = useRouter()
  const t = useTranslations('treatments')
  const [activeOption, setActiveOption] = useState<TreatmentOptionWithDetails | null>(null)

  const selectedOption = options.find((o) => o.is_selected) ?? null
  const selectionLocked = !!selectedOption || caseStatus !== 'treatment_plan'

  // After treatment_plan status, collapse to the selected option — but keep any
  // other option that still has a live consultation (e.g. already scheduled with
  // a Zoom link) visible, so the patient doesn't lose access to it.
  const displayOptions = selectedOption
    ? options.filter((o) => {
        if (o.is_selected) return true
        const consultation = consultations[o.id]
        return !!consultation && consultation.status !== 'cancelled'
      })
    : options

  if (options.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {t('finalisingOptions')}
      </p>
    )
  }

  return (
    <>
      {/* Post-selection banner */}
      {selectedOption && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="text-sm text-cyan-800">
            {t('youHaveSelectedHospital', { hospital: selectedOption.hospitals.name })}{' '}
            {caseStatus === 'treatment_confirmed' && t('proceedToPayment')}
          </p>
          {caseStatus === 'treatment_confirmed' && (
            <Link
              href={`/cases/${caseId}/payment`}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-cyan-700 hover:text-cyan-900"
            >
              {t('goToPayment')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {/* Option cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayOptions.map((option) => (
          <TreatmentOptionCard
            key={option.id}
            option={option}
            selectionLocked={selectionLocked}
            consultation={consultations[option.id] ?? null}
            specialtyLabelMap={specialtyLabelMap}
            onViewDetails={setActiveOption}
          />
        ))}
      </div>

      {/* Detail modal */}
      {activeOption && (
        <TreatmentDetailModal
          option={activeOption}
          caseId={caseId}
          selectionLocked={selectionLocked}
          consultation={consultations[activeOption.id] ?? null}
          specialtyLabelMap={specialtyLabelMap}
          onClose={() => setActiveOption(null)}
          onSelected={() => router.refresh()}
        />
      )}
    </>
  )
}
