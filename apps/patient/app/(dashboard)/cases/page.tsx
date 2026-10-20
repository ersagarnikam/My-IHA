import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { Button } from '@iha/ui'
import { fetchSpecialtyLabelMap, type SpecialtyLabelMap } from '@iha/db/specialties'
import { fetchCasesForPatientId } from '@/lib/repositories/cases'
import { fetchCurrentPatientContext } from '@/lib/repositories/patients'
import { CaseStatusBadge, getStatusConfig, isInProgress } from '@/components/cases/case-status-badge'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import type { Case } from '@iha/db/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function CaseCard({ c, locale, specialtyLabelMap }: { c: Case; locale: string; specialtyLabelMap: SpecialtyLabelMap }) {
  const { description } = getStatusConfig(c.status)
  const displaySpecialty =
    c.specialty === 'Other' && c.specialty_other
      ? c.specialty_other
      : getSpecialtyLabel(c.specialty, locale, specialtyLabelMap)

  return (
    <Link
      href={`/cases/${c.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{c.reference_number}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{displaySpecialty}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(c.created_at)}</p>
        </div>
        <CaseStatusBadge status={c.status} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </Link>
  )
}

export default async function CasesPage() {
  const context = await fetchCurrentPatientContext()
  if (!context) redirect('/login')

  const patientId = context.patient?.id ?? ''

  const [cases, t, locale, specialtyLabelMap] = await Promise.all([
    patientId ? fetchCasesForPatientId(patientId) : Promise.resolve([]),
    getTranslations('cases'),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  const active = cases.filter((c) => isInProgress(c.status))
  const completed = cases.filter((c) => !isInProgress(c.status))


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700 sm:self-start">
          <Link href="/cases/new">
            <Plus className="mr-1.5 h-4 w-4" />
            {t('addNewCase')}
          </Link>
        </Button>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-500">{t('noCasesYet')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('noCasesSubtext')}</p>
          <Button asChild className="mt-4 bg-cyan-600 text-white hover:bg-cyan-700">
            <Link href="/cases/new">{t('submitFirstCase')}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                {t('activeCases')} <span className="text-slate-400">({active.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((c) => <CaseCard key={c.id} c={c} locale={locale} specialtyLabelMap={specialtyLabelMap} />)}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                {t('pastCases')} <span className="text-slate-400">({completed.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((c) => <CaseCard key={c.id} c={c} locale={locale} specialtyLabelMap={specialtyLabelMap} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
