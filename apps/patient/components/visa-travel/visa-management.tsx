import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import type { VisaSubmissionWithCase } from '@iha/db/visa'
import type { Case } from '@iha/db/types'
import { fetchSpecialtyLabelMap } from '@iha/db/specialties'
import { getSpecialtyLabel } from '@/lib/specialty-label'

const VISA_ELIGIBLE_STATUSES = ['payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed']

const STATUS_STYLES: Record<string, string> = {
  not_started:               'bg-slate-100 text-slate-600',
  documents_submitted:       'bg-blue-100 text-blue-700',
  under_review:              'bg-blue-100 text-blue-700',
  additional_docs_requested: 'bg-orange-100 text-orange-700',
  application_submitted:     'bg-purple-100 text-purple-700',
  processing:                'bg-purple-100 text-purple-700',
  approved:                  'bg-emerald-100 text-emerald-700',
  rejected:                  'bg-red-100 text-red-700',
}

type Props = {
  submissions: VisaSubmissionWithCase[]
  cases: Case[]
  lettersReceivedByCase: Record<string, boolean>
}

export async function VisaManagement({ submissions, cases, lettersReceivedByCase }: Props) {
  const [t, locale, specialtyLabelMap] = await Promise.all([
    getTranslations('visaTravel'),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  const submissionCaseIds = new Set(submissions.map((s) => s.case_id))
  const eligibleWithoutSubmission = cases.filter(
    (c) => VISA_ELIGIBLE_STATUSES.includes(c.status) && !submissionCaseIds.has(c.id),
  )

  if (submissions.length === 0 && eligibleWithoutSubmission.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-600">{t('noVisaApps')}</p>
        <p className="mt-1 text-sm text-slate-400">{t('noVisaAppsSubtext')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {submissions.map((s) => {
        const statusKey = s.status as keyof typeof STATUS_STYLES
        const style = STATUS_STYLES[statusKey] ?? 'bg-slate-100 text-slate-600'
        const statusLabel = Object.keys(STATUS_STYLES).includes(s.status)
          ? t(`statusLabels.${statusKey}` as never)
          : s.status

        return (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">
                  {s.cases?.specialty
                    ? getSpecialtyLabel(s.cases.specialty, locale, specialtyLabelMap)
                    : 'Medical Treatment'} — {t('visaApplicationTitle')}
                </p>
                <p className="text-xs text-slate-500">{t('ref')} {s.cases?.reference_number ?? '—'}</p>
                <p className="text-xs text-slate-400">
                  {t('started')} {new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
                  {statusLabel}
                </span>
                <Link
                  href={`/visa-travel/${s.id}`}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-800"
                >
                  {t('viewDetails')}
                </Link>
                {s.status === 'not_started' && (
                  lettersReceivedByCase[s.case_id] ? (
                    <Link
                      href={`/cases/${s.case_id}/visa`}
                      className="inline-flex items-center rounded-lg bg-cyan-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-800"
                    >
                      {t('startApplication')}
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-lg bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-400"
                      title={t('startApplicationLocked')}
                    >
                      {t('startApplication')}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        )
      })}

      {eligibleWithoutSubmission.map((c) => {
        const canStart = lettersReceivedByCase[c.id]
        return (
          <div key={c.id} className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-700">
                  {getSpecialtyLabel(c.specialty, locale, specialtyLabelMap)}
                </p>
                <p className="text-xs text-slate-500">{t('ref')} {c.reference_number}</p>
                <p className="text-xs text-slate-400">
                  {canStart ? t('visaNotStarted') : t('startApplicationLocked')}
                </p>
              </div>
              {canStart ? (
                <Link
                  href={`/cases/${c.id}/visa`}
                  className="inline-flex items-center rounded-lg bg-cyan-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-800"
                >
                  {t('startApplication')}
                </Link>
              ) : (
                <span
                  className="inline-flex items-center rounded-lg bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-400"
                  title={t('startApplicationLocked')}
                >
                  {t('startApplication')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
