import { Link } from 'react-router'
import { Empty, ErrorState, Loading, StatusBadge } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { isInProgress, type CaseSummary } from '../../lib/cases'
import { useFormat, useSpecialtyLabel } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { usePatient } from './PatientContext'

export function CasesPage() {
  const t = useT('cases')
  const { data: cases, error, reload } = useApi<CaseSummary[]>('/api/patient/cases')

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!cases) return <Loading />

  const active = cases.filter((c) => isInProgress(c.status))
  const past = cases.filter((c) => !isInProgress(c.status))

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <Link className="button" to="/patient/cases/new">
          + {t('addNewCase')}
        </Link>
      </div>

      {cases.length === 0 ? (
        <Empty title={t('noCasesYet')}>
          <p className="muted">{t('noCasesSubtext')}</p>
          <Link className="button" to="/patient/cases/new">
            {t('submitFirstCase')}
          </Link>
        </Empty>
      ) : (
        <>
          {active.length > 0 && <CaseList title={t('activeCases')} cases={active} />}
          {past.length > 0 && <CaseList title={t('pastCases')} cases={past} />}
        </>
      )}
    </section>
  )
}

export function CaseList({ title, cases }: { title: string; cases: CaseSummary[] }) {
  const tc = useT('common')
  const td = useT('caseDetail')
  const format = useFormat()
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  return (
    <section className="stack">
      <h2>{title}</h2>
      <ul className="case-list">
        {cases.map((c) => (
          <li key={c.id}>
            <Link to={`/patient/cases/${c.id}`} className="card case-row">
              <div>
                <p className="case-ref">{c.referenceNumber}</p>
                <p className="case-specialty">{specialtyLabel(c)}</p>
                <p className="muted small">
                  {td('submitted')} {format.date(c.createdAt)} ·{' '}
                  {tc(c.documentCount === 1 ? 'files_one' : 'files_other', {
                    count: c.documentCount,
                  })}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
