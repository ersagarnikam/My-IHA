import { Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { Case } from '@iha/db/types'

const STATUS_KEYS = [
  'case_submitted',
  'under_review',
  'doctor_assigned',
  'evaluation',
  'treatment_plan',
  'treatment_confirmed',
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
] as const

type StatusKey = (typeof STATUS_KEYS)[number]

const STATUS_ORDER = STATUS_KEYS as readonly string[]

export async function StatusTimeline({ caseData }: { caseData: Case }) {
  const t = await getTranslations('caseStatus')
  const currentIndex = STATUS_ORDER.indexOf(caseData.status)

  return (
    <div className="space-y-0">
      {STATUS_KEYS.map((key, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex

        return (
          <div key={key} className="flex gap-4">
            {/* Spine */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  isDone
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : isCurrent
                      ? 'border-cyan-500 bg-white text-cyan-600'
                      : 'border-slate-200 bg-white text-slate-300'
                }`}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px] font-bold">{i + 1}</span>
                )}
              </div>
              {i < STATUS_KEYS.length - 1 && (
                <div className={`my-1 w-0.5 flex-1 ${isDone ? 'bg-cyan-300' : 'bg-slate-200'}`} style={{ minHeight: '24px' }} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 ${i === STATUS_KEYS.length - 1 ? 'pb-0' : ''}`}>
              <p
                className={`text-sm font-semibold ${
                  isCurrent ? 'text-cyan-700' : isFuture ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {t(`${key}.label` as StatusKey)}
                {isCurrent && (
                  <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-700">
                    {t('current')}
                  </span>
                )}
              </p>
              <p className={`text-xs ${isFuture ? 'text-slate-300' : 'text-slate-500'}`}>
                {t(`${key}.description` as StatusKey)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
