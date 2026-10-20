'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  Plane,
  PlusCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@iha/ui'
import { getStatusColor } from '@/components/cases/case-status-badge'

export type ActiveCaseSummary = {
  id: string
  referenceNumber: string
  status: string
  createdAt: string
  displaySpecialty: string
  documentCount: number
  paymentDisplay: string
  visaDisplay: string
}

// ─── Journey step keys ────────────────────────────────────────────────────────

const JOURNEY_STEP_KEYS = [
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

const STATUS_TO_STEP: Record<string, number> = {
  case_submitted:           0,
  under_review:             1,
  doctor_assigned:          2,
  evaluation:               3,
  treatment_plan:           4,
  treatment_confirmed:      5,
  payment_confirmed:        6,
  visa_documents_submitted: 7,
  visa_processing:          8,
  travel_ready:             9,
  completed:                10,
}

// ─── Next action config ───────────────────────────────────────────────────────

type NextAction = {
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  type: 'waiting' | 'action' | 'done'
}

type TFn = ReturnType<typeof useTranslations<'activeCaseSection'>>

function getNextAction(c: ActiveCaseSummary, t: TFn): NextAction {
  switch (c.status) {
    case 'case_submitted':
    case 'under_review':
      return {
        title: t('nextActions.underReview.title'),
        description: t('nextActions.underReview.description'),
        type: 'waiting',
      }
    case 'doctor_assigned':
      return {
        title: t('nextActions.doctorAssigned.title'),
        description: t('nextActions.doctorAssigned.description'),
        type: 'waiting',
      }
    case 'evaluation':
      return {
        title: t('nextActions.evaluation.title'),
        description: t('nextActions.evaluation.description'),
        type: 'waiting',
      }
    case 'treatment_plan':
      return {
        title: t('nextActions.treatmentPlan.title'),
        description: t('nextActions.treatmentPlan.description'),
        actionLabel: t('nextActions.treatmentPlan.actionLabel'),
        actionHref: `/cases/${c.id}`,
        type: 'action',
      }
    case 'treatment_confirmed':
      return {
        title: t('nextActions.treatmentConfirmed.title'),
        description: t('nextActions.treatmentConfirmed.description'),
        actionLabel: t('nextActions.treatmentConfirmed.actionLabel'),
        actionHref: `/cases/${c.id}/payment`,
        type: 'action',
      }
    case 'payment_confirmed':
      return {
        title: t('nextActions.paymentConfirmed.title'),
        description: t('nextActions.paymentConfirmed.description'),
        actionLabel: t('nextActions.paymentConfirmed.actionLabel'),
        actionHref: `/cases/${c.id}/visa`,
        type: 'action',
      }
    case 'visa_documents_submitted':
      return {
        title: t('nextActions.visaSubmitted.title'),
        description: t('nextActions.visaSubmitted.description'),
        type: 'waiting',
      }
    case 'visa_processing':
      return {
        title: t('nextActions.visaProcessing.title'),
        description: t('nextActions.visaProcessing.description'),
        type: 'waiting',
      }
    case 'travel_ready':
      return {
        title: t('nextActions.travelReady.title'),
        description: t('nextActions.travelReady.description'),
        actionLabel: t('nextActions.travelReady.actionLabel'),
        actionHref: '/visa-travel',
        type: 'action',
      }
    case 'completed':
      return {
        title: t('nextActions.completed.title'),
        description: t('nextActions.completed.description'),
        type: 'done',
      }
    default:
      return {
        title: t('nextActions.default.title'),
        description: t('nextActions.default.description'),
        type: 'waiting',
      }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function JourneyProgress({ status, t }: { status: string; t: TFn }) {
  const currentStep = STATUS_TO_STEP[status] ?? 0
  const pct = Math.round((currentStep / (JOURNEY_STEP_KEYS.length - 1)) * 100)
  const currentLabel = t(`journeySteps.${JOURNEY_STEP_KEYS[currentStep]}` as never).replace('\n', ' ')

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">{t('journeyProgress')}</p>
        <p className="text-xs text-slate-500">{t('pctCompleted', { pct })}</p>
      </div>

      {/* Mobile: compact progress bar + current step label */}
      <div className="sm:hidden">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-cyan-700 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {t('step', { current: currentStep + 1, total: JOURNEY_STEP_KEYS.length })} ·{' '}
          <span className="font-semibold text-cyan-700">{currentLabel}</span>
        </p>
      </div>

      {/* sm and up: full step row */}
      <div className="hidden w-full items-start sm:flex">
        {JOURNEY_STEP_KEYS.map((key, idx) => {
          const isComplete = idx < currentStep
          const isCurrent  = idx === currentStep
          const isLast     = idx === JOURNEY_STEP_KEYS.length - 1
          const label = t(`journeySteps.${key}` as never)
          return (
            <Fragment key={key}>
              {/* Step: circle + label */}
              <div className="flex shrink-0 flex-col items-center" style={{ width: 44 }}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  isComplete
                    ? 'bg-cyan-700 text-white'
                    : isCurrent
                    ? 'border-2 border-cyan-700 bg-white text-cyan-700'
                    : 'border border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <p className={`mt-1.5 whitespace-pre-line text-center text-[9px] leading-tight ${
                  isCurrent ? 'font-semibold text-slate-800' : isComplete ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {label}
                </p>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div className={`mt-3.5 h-0.5 min-w-0 flex-1 ${isComplete ? 'bg-slate-300' : 'bg-slate-200'}`} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function StatPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-xs font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

type TCommon = ReturnType<typeof useTranslations<'common'>>

function CaseSlide({ c, t, tStatus, tCommon }: { c: ActiveCaseSummary; t: TFn; tStatus: ReturnType<typeof useTranslations<'caseStatus'>>; tCommon: TCommon }) {
  const color = getStatusColor(c.status)
  const statusLabel = tStatus.has(`${c.status}.label`) ? tStatus(`${c.status}.label` as never) : c.status

  return (
    <div className="space-y-5">
      {/* Case header */}
      <div className="flex flex-col gap-4 rounded-lg border border-dashed border-cyan-200 bg-cyan-50/60 p-4 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-cyan-700 shadow-sm">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
            {statusLabel}
          </span>
          <h2 className="mt-1.5 text-base font-semibold text-slate-950">{c.displaySpecialty}</h2>
          <p className="text-xs text-slate-500">
            {c.referenceNumber} · {t('submitted')} {formatDate(c.createdAt)}
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 text-cyan-700 hover:text-cyan-800">
          <Link href={`/cases/${c.id}`}>
            {t('viewCase')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Journey progress */}
      <JourneyProgress status={c.status} t={t} />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatPill
          icon={FileText}
          label={tCommon('documents')}
          value={c.documentCount === 0 ? tCommon('noneUploaded') : tCommon(c.documentCount === 1 ? 'files_one' : 'files_other', { count: c.documentCount })}
          color="bg-blue-100 text-blue-700"
        />
        <StatPill icon={CreditCard} label={tCommon('payment')} value={c.paymentDisplay} color="bg-emerald-100 text-emerald-700" />
        <StatPill icon={Plane} label={tCommon('visa')} value={c.visaDisplay} color="bg-purple-100 text-purple-700" />
      </div>
    </div>
  )
}

function NextActionCard({ nextAction, t }: { nextAction: NextAction | null; t: TFn }) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm font-semibold text-slate-900">{t('nextActionRequired')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[240px] flex-col items-center justify-center p-6 text-center">
        {nextAction ? (
          <>
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${
              nextAction.type === 'action'  ? 'bg-amber-50 text-amber-600' :
              nextAction.type === 'done'    ? 'bg-emerald-50 text-emerald-600' :
                                              'bg-cyan-50 text-cyan-700'
            }`}>
              <ClipboardList className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-950">{nextAction.title}</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{nextAction.description}</p>
            {nextAction.actionLabel && nextAction.actionHref && (
              <Button asChild className="mt-6 bg-cyan-700 hover:bg-cyan-800">
                <Link href={nextAction.actionHref}>
                  {nextAction.actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
              <ClipboardList className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-950">{t('noActionRequired')}</h2>
            <p className="mt-2 text-sm text-slate-500">{t('noActionSubtext')}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function ActiveCaseSection({ cases }: { cases: ActiveCaseSummary[] }) {
  const t = useTranslations('activeCaseSection')
  const tStatus = useTranslations('caseStatus')
  const tCommon = useTranslations('common')
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!api) return
    setCurrent(api.selectedScrollSnap())
    const onSelect = () => setCurrent(api.selectedScrollSnap())
    api.on('select', onSelect)
    return () => {
      api.off('select', onSelect)
    }
  }, [api])

  const currentCase = cases[current] ?? null
  const nextAction = currentCase ? getNextAction(currentCase, t) : null

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      {/* Active Case */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-900">{t('activeCase')}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {cases.length > 0 ? (
            <Carousel setApi={setApi} className="px-1">
              <CarouselContent>
                {cases.map((c) => (
                  <CarouselItem key={c.id}>
                    <CaseSlide c={c} t={t} tStatus={tStatus} tCommon={tCommon} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              {cases.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    aria-label={t('previousCase')}
                    onClick={() => api?.scrollPrev()}
                    disabled={current === 0}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {cases.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-label={t('goToCase', { n: idx + 1 })}
                        onClick={() => api?.scrollTo(idx)}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === current ? 'w-5 bg-cyan-700' : 'w-1.5 bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={t('nextCase')}
                    onClick={() => api?.scrollNext()}
                    disabled={current === cases.length - 1}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </Carousel>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
                <FolderOpen className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{t('noActiveCases')}</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">{t('noActiveCasesSubtext')}</p>
              <Button asChild className="mt-5 bg-cyan-700 hover:bg-cyan-800">
                <Link href="/cases/new">
                  <PlusCircle className="h-4 w-4" />
                  {t('submitCase')}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Action Required */}
      <NextActionCard nextAction={nextAction} t={t} />
    </section>
  )
}
