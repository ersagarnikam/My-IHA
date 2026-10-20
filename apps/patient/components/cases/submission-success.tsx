'use client'

import Link from 'next/link'
import { CheckCircle2, Search, Building2, Stethoscope, Plane } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@iha/ui'

type Props = {
  caseId: string
  referenceNumber: string
}

const NEXT_STEP_ICONS = [Search, Building2, Stethoscope, Plane]

export function SubmissionSuccess({ caseId, referenceNumber }: Props) {
  const t = useTranslations('submissionSuccess')
  const nextStepKeys = ['review', 'specialists', 'options', 'visa'] as const

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <CheckCircle2 className="h-14 w-14 text-emerald-500" />

      <div>
        <h2 className="text-xl font-semibold text-slate-900">{t('title')}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {t('reference')} <span className="font-semibold text-slate-700">{referenceNumber}</span>
        </p>
        <p className="mt-2 text-sm text-slate-500">{t('body')}</p>
      </div>

      {/* Next steps */}
      <div className="w-full max-w-xl rounded-xl bg-slate-50 px-6 py-5">
        <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4">
          {nextStepKeys.map((key, i) => {
            const Icon = NEXT_STEP_ICONS[i]!
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <Icon className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="max-w-[100px] text-center text-xs text-slate-500">{t(`nextSteps.${key}`)}</p>
                </div>
                {i < nextStepKeys.length - 1 && (
                  <span className="mb-5 text-slate-300">→</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
          <Link href={`/cases/${caseId}`}>{t('trackStatus')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{t('returnToDashboard')}</Link>
        </Button>
      </div>
    </div>
  )
}
