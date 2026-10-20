import { Link, useSearchParams } from 'react-router'
import { Badge, Empty, ErrorState, Loading, Tabs } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { useFormat, useSpecialtyLabel } from '../../../lib/format'
import type { VisaSubmissionSummary } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'
import { usePatient } from '../PatientContext'

export const VISA_TONE: Record<string, 'info' | 'warn' | 'accent' | 'good' | 'bad' | 'muted'> = {
  not_started: 'muted',
  documents_submitted: 'info',
  under_review: 'info',
  additional_docs_requested: 'warn',
  application_submitted: 'accent',
  processing: 'accent',
  approved: 'good',
  rejected: 'bad',
}

type Overview = {
  submissions: VisaSubmissionSummary[]
  eligibleCases: {
    caseId: string
    referenceNumber: string
    specialty: string
    specialtyOther: string | null
    lettersReady: boolean
  }[]
}

export function VisaTravelPage() {
  const t = useT('visaTravel')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'visa' ? 'visa' : 'travel'
  return (
    <section className="stack">
      <div>
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
      </div>
      <Tabs
        tabs={[
          { id: 'travel', label: t('travelGuide') },
          { id: 'visa', label: t('visaManagement') },
        ]}
        active={tab}
        onChange={(id) => setParams(id === 'visa' ? { tab: 'visa' } : {})}
      />
      {tab === 'travel' ? <TravelGuide /> : <VisaManagement />}
    </section>
  )
}

function VisaManagement() {
  const t = useT('visaTravel')
  const format = useFormat()
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const { data, error, reload } = useApi<Overview>('/api/patient/visa-submissions')

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <Loading />
  if (data.submissions.length === 0 && data.eligibleCases.length === 0) {
    return (
      <Empty title={t('noVisaApps')}>
        <p className="muted">{t('noVisaAppsSubtext')}</p>
      </Empty>
    )
  }

  return (
    <div className="stack">
      {data.submissions.map((s) => (
        <article key={s.id} className="card row-between">
          <div>
            <h3>
              {t('visaApplicationTitle')} —{' '}
              {s.specialty
                ? specialtyLabel({ specialty: s.specialty, specialtyOther: s.specialtyOther })
                : ''}
            </h3>
            <p className="muted small">
              {t('ref')} {s.caseReference} · {t('started')} {format.date(s.createdAt)}
            </p>
          </div>
          <div className="actions">
            <Badge tone={VISA_TONE[s.status] ?? 'info'}>{t(`statusLabels.${s.status}`)}</Badge>
            <Link to={`/patient/visa-travel/${s.id}`}>{t('viewDetails')}</Link>
          </div>
        </article>
      ))}
      {data.eligibleCases.map((c) => (
        <article key={c.caseId} className="card row-between">
          <div>
            <h3>{specialtyLabel(c)}</h3>
            <p className="muted small">
              {t('ref')} {c.referenceNumber} · {t('visaNotStarted')}
            </p>
          </div>
          {c.lettersReady ? (
            <Link className="button" to={`/patient/cases/${c.caseId}/visa`}>
              {t('startApplication')}
            </Link>
          ) : (
            <button type="button" disabled>
              {t('startApplicationLocked')}
            </button>
          )}
        </article>
      ))}
    </div>
  )
}

function TravelGuide() {
  const t = useT('visaTravel.guide')
  const bold = { '*': (chunk: string) => <strong>{chunk}</strong> }
  const sections = [
    'visa',
    'documents',
    'flights',
    'accommodation',
    'airport',
    'checklist',
  ] as const
  return (
    <div className="guide">
      <nav className="card guide-toc">
        <strong>{t('contents')}</strong>
        <ol>
          {sections.map((s) => (
            <li key={s}>
              <a href={`#guide-${s}`}>{t(`sectionLabels.${s}`)}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="stack">
        <section id="guide-visa" className="card stack">
          <h2>{t('visa.title')}</h2>
          <p>{t.rich('visa.intro', bold)}</p>
          <dl className="details">
            {(
              [
                'whoItIsFor:whoBody',
                'processingTime:processingBody',
                'lengthOfStay:lengthBody',
                'companions:companionsBody',
              ] as const
            ).map((pair) => {
              const [term, body] = pair.split(':') as [string, string]
              return (
                <div key={term}>
                  <dt>
                    <strong>{t(`visa.${term}`)}</strong>
                  </dt>
                  <dd className="muted">{t(`visa.${body}`)}</dd>
                </div>
              )
            })}
          </dl>
          <a
            href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/medical-treatment-602"
            target="_blank"
            rel="noreferrer"
          >
            {t('visa.officialPage')} ↗
          </a>
        </section>
        <GuideList
          id="documents"
          title={t('documents.title')}
          intro={t('documents.intro')}
          items={range(8).map((i) => t(`documents.item${i}`))}
        />
        <GuideList
          id="flights"
          title={t('flights.title')}
          intro={t('flights.intro')}
          items={range(3).map((i) => t.rich(`flights.tip${i}`, bold))}
        />
        <GuideList
          id="accommodation"
          title={t('accommodation.title')}
          intro={t('accommodation.intro')}
          items={range(4).map((i) => t.rich(`accommodation.tip${i}`, bold))}
        />
        <GuideList
          id="airport"
          title={t('airport.title')}
          intro={t('airport.intro')}
          items={range(4).map((i) => t.rich(`airport.tip${i}`, bold))}
        />
        <GuideList
          id="checklist"
          title={t('preArrival.title')}
          intro={t('preArrival.intro')}
          items={range(9).map((i) => t(`preArrival.item${i}`))}
          checklist
        />
      </div>
    </div>
  )
}

function GuideList({
  id,
  title,
  intro,
  items,
  checklist,
}: {
  id: string
  title: string
  intro: string
  items: React.ReactNode[]
  checklist?: boolean
}) {
  return (
    <section id={`guide-${id}`} className="card stack">
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      <ul className={checklist ? 'checklist' : ''}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i)
}
