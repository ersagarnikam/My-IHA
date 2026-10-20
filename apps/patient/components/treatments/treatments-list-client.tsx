'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TreatmentOptionWithCaseInfo } from '@iha/db/treatments'
import type { ConsultationRequest } from '@iha/db/consultations'
import type { SpecialtyLabelMap } from '@iha/db/specialties'
import { TreatmentOptionCard } from './treatment-option-card'
import { TreatmentDetailModal } from './treatment-detail-modal'

type Props = {
  groups: {
    caseId: string
    referenceNumber: string
    specialty: string
    options: TreatmentOptionWithCaseInfo[]
  }[]
  consultations: Record<string, ConsultationRequest>
  specialtyLabelMap: SpecialtyLabelMap
}

export function TreatmentsListClient({ groups, consultations, specialtyLabelMap }: Props) {
  const router = useRouter()
  const t = useTranslations('treatments')
  const [activeOption, setActiveOption] = useState<TreatmentOptionWithCaseInfo | null>(null)

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-600">{t('noOptions')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('noOptionsSubtext')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
        {groups.map((group) => {
          const selectedOption = group.options.find((o) => o.is_selected) ?? null
          const selectionLocked = !!selectedOption

          return (
            <div key={group.caseId}>
              {/* Case header */}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{group.referenceNumber}</h2>
                    {selectedOption && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {t('optionSelected')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{group.specialty}</p>
                </div>
                <Link
                  href={`/cases/${group.caseId}`}
                  className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800"
                >
                  {t('viewCase')}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Option cards grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.options.map((option) => (
                  <TreatmentOptionCard
                    key={option.id}
                    option={option}
                    selectionLocked={selectionLocked}
                    consultation={consultations[option.id] ?? null}
                    specialtyLabelMap={specialtyLabelMap}
                    onViewDetails={(o) => setActiveOption(o as TreatmentOptionWithCaseInfo)}
                    compact
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      {activeOption && (
        <TreatmentDetailModal
          option={activeOption}
          caseId={activeOption.case_id}
          specialtyLabelMap={specialtyLabelMap}
          selectionLocked={
            !!activeOption &&
            groups
              .find((g) => g.caseId === activeOption.case_id)
              ?.options.some((o) => o.is_selected && o.id !== activeOption.id) === true
          }
          consultation={consultations[activeOption.id] ?? null}
          onClose={() => setActiveOption(null)}
          onSelected={() => router.refresh()}
        />
      )}
    </>
  )
}
