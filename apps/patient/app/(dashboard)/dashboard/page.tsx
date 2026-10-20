import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  FileText,
  FolderOpen,
  PlusCircle,
  Stethoscope,
} from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import { fetchCurrentPatientContext } from '@/lib/repositories/patients'
import { fetchCasesForPatientId } from '@/lib/repositories/cases'
import { fetchDocumentCountsForCases } from '@iha/db/cases'
import { fetchLatestPaymentsForCases } from '@iha/db/payments'
import { fetchVisaSubmissionStatusesForCases } from '@iha/db/visa'
import { fetchSpecialtyLabelMap, type SpecialtyLabelMap } from '@iha/db/specialties'
import { getStatusColor, isInProgress } from '@/components/cases/case-status-badge'
import { ActiveCaseSection, type ActiveCaseSummary } from '@/components/dashboard/active-case-section'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import type { Case } from '@iha/db/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatAud(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount)
}

const PAYMENT_DUE_OR_PAST_STATUSES = ['payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed']
const VISA_NEEDED_STATUSES = ['payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed']

type PaymentRow = { status: string; amount_aud: number; paid_at: string | null }
type TFunc = Awaited<ReturnType<typeof getTranslations>>

const VISA_STATUS_KEYS = new Set([
  'documents_submitted', 'under_review', 'additional_docs_requested',
  'application_submitted', 'processing', 'approved', 'rejected',
])

function getPaymentDisplay(c: Case, latestPayment: PaymentRow | null, tCommon: TFunc) {
  if (latestPayment?.status === 'succeeded' || PAYMENT_DUE_OR_PAST_STATUSES.includes(c.status)) {
    return latestPayment ? `${tCommon('paid')} · ${formatAud(latestPayment.amount_aud)}` : tCommon('paid')
  }
  if (latestPayment) return tCommon('processing')
  return tCommon('pending')
}

function getVisaDisplay(c: Case, visaStatus: string | null, tDash: TFunc, tCommon: TFunc) {
  if (!visaStatus) {
    return VISA_NEEDED_STATUSES.includes(c.status) ? tCommon('notStarted') : '—'
  }
  if (VISA_STATUS_KEYS.has(visaStatus)) {
    return tDash(`visaStatus.${visaStatus}`)
  }
  return visaStatus
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DashboardCaseCard({ c, tStatus, locale, specialtyLabelMap }: { c: Case; tStatus: TFunc; locale: string; specialtyLabelMap: SpecialtyLabelMap }) {
  const color = getStatusColor(c.status)
  const label = tStatus.has(`${c.status}.label`) ? tStatus(`${c.status}.label`) : c.status
  const description = tStatus.has(`${c.status}.description`) ? tStatus(`${c.status}.description`) : ''
  const displaySpecialty =
    c.specialty === 'Other' && c.specialty_other
      ? c.specialty_other
      : getSpecialtyLabel(c.specialty, locale, specialtyLabelMap)

  return (
    <Link
      href={`/cases/${c.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-slate-400">{c.reference_number}</p>
          <p className="truncate text-sm font-semibold text-slate-900">{displaySpecialty}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(c.created_at)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
          {label}
        </span>
        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{description}</span>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const context = await fetchCurrentPatientContext()
  if (!context) redirect('/login')

  const patientId = context.patient?.id ?? ''

  const [allCases, t, tStatus, tCommon, locale, specialtyLabelMap] = await Promise.all([
    patientId ? fetchCasesForPatientId(patientId) : Promise.resolve([]),
    getTranslations('dashboard'),
    getTranslations('caseStatus'),
    getTranslations('common'),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  const firstName =
    context.patient?.full_name?.split(' ')[0] ??
    context.authFullName?.split(' ')[0] ??
    'there'

  // In-progress cases, most recently updated first
  const inProgressCases = allCases
    .filter((c) => isInProgress(c.status))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  // Fetch each active case's details (documents, payment, visa) in three batched
  // queries instead of 3 round trips per case.
  const inProgressCaseIds = inProgressCases.map((c) => c.id)
  const [docCounts, latestPayments, visaStatuses] = await Promise.all([
    fetchDocumentCountsForCases(inProgressCaseIds),
    fetchLatestPaymentsForCases(inProgressCaseIds),
    fetchVisaSubmissionStatusesForCases(inProgressCaseIds),
  ])

  const activeCases: ActiveCaseSummary[] = inProgressCases.map((c) => {
    const latestPayment = (latestPayments.data[c.id] as PaymentRow | undefined) ?? null
    const visaStatus = visaStatuses.data[c.id] ?? null

    return {
      id: c.id,
      referenceNumber: c.reference_number,
      status: c.status,
      createdAt: c.created_at,
      displaySpecialty:
        c.specialty === 'Other' && c.specialty_other
          ? c.specialty_other
          : getSpecialtyLabel(c.specialty, locale, specialtyLabelMap),
      documentCount: docCounts.data[c.id] ?? 0,
      paymentDisplay: getPaymentDisplay(c, latestPayment, tCommon),
      visaDisplay: getVisaDisplay(c, visaStatus, t, tCommon),
    }
  })

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <section>
        <h1 className="text-2xl font-bold text-slate-950">{t('welcomeBack', { name: firstName })}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </section>

      {/* Active Case + Next Action */}
      <ActiveCaseSection cases={activeCases} />

      {/* Quick Actions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('quickActions')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: t('submitNewCase'),  icon: PlusCircle,  href: '/cases/new',  desc: t('submitNewCaseDesc') },
            { label: t('myCases'),        icon: FolderOpen,  href: '/cases',      desc: t('myCasesDesc') },
            { label: t('myDocuments'),    icon: FileText,    href: '/documents',  desc: t('myDocumentsDesc') },
          ].map(({ label, icon: Icon, href, desc }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Your Cases */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {t('yourCases')}
            {allCases.length > 0 && (
              <span className="ml-2 text-slate-400">({allCases.length})</span>
            )}
          </h2>
          {allCases.length > 4 && (
            <Link href="/cases" className="text-xs font-medium text-cyan-700 hover:underline">
              {t('viewAll')}
            </Link>
          )}
        </div>

        {allCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">{t('noCasesYet')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('noCasesSubtext')}</p>
            <Button asChild className="mt-4 bg-cyan-700 hover:bg-cyan-800">
              <Link href="/cases/new">{t('submitFirstCase')}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {allCases.slice(0, 4).map((c) => (
              <DashboardCaseCard key={c.id} c={c} tStatus={tStatus} locale={locale} specialtyLabelMap={specialtyLabelMap} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
