import { Fragment, useState } from 'react'
import { Link } from 'react-router'
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
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { ErrorState, Loading, StatusBadge } from '../../components/ui'
import { useT, type Translate } from '../../i18n/I18nContext'
import { JOURNEY, type CaseStatus } from '../../lib/cases'
import { useFormat, useSpecialtyLabel } from '../../lib/format'
import { useRealtime } from '../../lib/realtime'
import type { Dashboard, DashboardCase } from '../../lib/types'
import { useApi } from '../../lib/useApi'
import { usePatient } from './PatientContext'

type NextAction = { key: string; href?: string; type: 'waiting' | 'action' | 'done' }

/** The old getNextAction(status): what the patient should do next for a case. */
function nextAction(c: DashboardCase): NextAction {
  switch (c.status) {
    case 'case_submitted':
    case 'under_review':
      return { key: 'underReview', type: 'waiting' }
    case 'doctor_assigned':
      return { key: 'doctorAssigned', type: 'waiting' }
    case 'evaluation':
      return { key: 'evaluation', type: 'waiting' }
    case 'treatment_plan':
      return { key: 'treatmentPlan', href: `/patient/cases/${c.id}`, type: 'action' }
    case 'treatment_confirmed':
      return { key: 'treatmentConfirmed', href: `/patient/cases/${c.id}/payment`, type: 'action' }
    case 'payment_confirmed':
      return { key: 'paymentConfirmed', href: `/patient/cases/${c.id}/visa`, type: 'action' }
    case 'visa_documents_submitted':
      return { key: 'visaSubmitted', type: 'waiting' }
    case 'visa_processing':
      return { key: 'visaProcessing', type: 'waiting' }
    case 'travel_ready':
      return { key: 'travelReady', href: '/patient/visa-travel', type: 'action' }
    case 'completed':
      return { key: 'completed', type: 'done' }
    default:
      return { key: 'default', type: 'waiting' }
  }
}

const PAID_STATUSES: CaseStatus[] = [
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
]

export function DashboardPage() {
  const t = useT('dashboard')
  const { data, error, reload } = useApi<Dashboard>('/api/patient/dashboard')
  useRealtime('notification', () => void reload())

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return <Loading />

  return (
    <div className="dashboard">
      <section>
        <h1>{t('welcomeBack', { name: data.fullName.split(' ')[0] ?? data.fullName })}</h1>
        <p className="muted small">{t('subtitle')}</p>
      </section>

      <ActiveCaseSection cases={data.activeCases} />

      <section>
        <h2 className="section-title">{t('quickActions')}</h2>
        <div className="quick-actions">
          {(
            [
              ['submitNewCase', 'submitNewCaseDesc', PlusCircle, '/patient/cases/new'],
              ['myCases', 'myCasesDesc', FolderOpen, '/patient/cases'],
              ['myDocuments', 'myDocumentsDesc', FileText, '/patient/documents'],
            ] as [string, string, LucideIcon, string][]
          ).map(([label, desc, Icon, href]) => (
            <Link key={href} to={href} className="quick-action">
              <span className="icon-circle">
                <Icon size={20} />
              </span>
              <span>
                <span className="quick-action-title">{t(label)}</span>
                <span className="quick-action-desc">{t(desc)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="row-between section-head">
          <h2 className="section-title">
            {t('yourCases')}
            {data.totalCases > 0 && <span className="section-count"> ({data.totalCases})</span>}
          </h2>
          {data.totalCases > 4 && (
            <Link to="/patient/cases" className="small-link">
              {t('viewAll')}
            </Link>
          )}
        </div>
        {data.recentCases.length === 0 ? (
          <div className="empty-dashed">
            <FolderOpen size={40} className="empty-icon" />
            <p className="empty-title">{t('noCasesYet')}</p>
            <p className="muted small">{t('noCasesSubtext')}</p>
            <Link className="button" to="/patient/cases/new">
              {t('submitFirstCase')}
            </Link>
          </div>
        ) : (
          <div className="case-cards">
            {data.recentCases.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CaseCard({ c }: { c: DashboardCase }) {
  const tStatus = useT('caseStatus')
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const format = useFormat()
  return (
    <Link to={`/patient/cases/${c.id}`} className="case-card">
      <div className="case-card-top">
        <span className="icon-square">
          <Stethoscope size={20} />
        </span>
        <div className="min-w-0">
          <p className="case-card-ref">{c.referenceNumber}</p>
          <p className="case-card-title">{specialtyLabel(c)}</p>
          <p className="case-card-date">{format.date(c.createdAt)}</p>
        </div>
      </div>
      <div className="case-card-bottom">
        <StatusBadge status={c.status} small />
        <span className="case-card-desc">{tStatus(`${c.status}.description`)}</span>
      </div>
    </Link>
  )
}

function ActiveCaseSection({ cases }: { cases: DashboardCase[] }) {
  const t = useT('activeCaseSection')
  const [index, setIndex] = useState(0)
  const current = cases[Math.min(index, cases.length - 1)] ?? null

  return (
    <section className="active-section">
      <div className="card active-card">
        <h2 className="card-title">{t('activeCase')}</h2>
        {current ? (
          <>
            <CaseSlide c={current} t={t} />
            {cases.length > 1 && (
              <div className="carousel-nav">
                <button
                  type="button"
                  className="round-button"
                  aria-label={t('previousCase')}
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  <ArrowLeft size={14} />
                </button>
                <div className="carousel-dots">
                  {cases.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={t('goToCase', { n: i + 1 })}
                      className={i === index ? 'dot active' : 'dot'}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="round-button"
                  aria-label={t('nextCase')}
                  disabled={index === cases.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-dashed">
            <span className="icon-circle white">
              <FolderOpen size={28} />
            </span>
            <p className="empty-title">{t('noActiveCases')}</p>
            <p className="muted small narrow-text">{t('noActiveCasesSubtext')}</p>
            <Link className="button" to="/patient/cases/new">
              <PlusCircle size={16} />
              {t('submitCase')}
            </Link>
          </div>
        )}
      </div>
      <NextActionCard action={current ? nextAction(current) : null} t={t} />
    </section>
  )
}

function CaseSlide({ c, t }: { c: DashboardCase; t: Translate }) {
  const tc = useT('common')
  const td = useT('dashboard')
  const format = useFormat()
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)

  const paid = c.latestPaymentStatus === 'completed' || PAID_STATUSES.includes(c.status)
  const payment = paid
    ? c.latestPaymentAmountAud != null && c.latestPaymentStatus === 'completed'
      ? `${tc('paid')} · ${format.money(c.latestPaymentAmountAud)}`
      : tc('paid')
    : tc('pending')
  const visa =
    c.visaStatus && c.visaStatus !== 'not_started'
      ? td.has(`visaStatus.${c.visaStatus}`)
        ? td(`visaStatus.${c.visaStatus}`)
        : c.visaStatus
      : PAID_STATUSES.includes(c.status)
        ? tc('notStarted')
        : '—'
  const documents =
    c.documentCount === 0
      ? tc('noneUploaded')
      : tc(c.documentCount === 1 ? 'files_one' : 'files_other', { count: c.documentCount })

  return (
    <div className="case-slide">
      <div className="case-banner">
        <span className="icon-square white">
          <FolderOpen size={24} />
        </span>
        <div className="case-banner-text">
          <StatusBadge status={c.status} small />
          <h3>{specialtyLabel(c)}</h3>
          <p className="muted tiny">
            {c.referenceNumber} · {t('submitted')} {format.date(c.createdAt)}
          </p>
        </div>
        <Link to={`/patient/cases/${c.id}`} className="button-outline">
          {t('viewCase')}
          <ArrowRight size={16} />
        </Link>
      </div>
      <JourneyProgress status={c.status} t={t} />
      <div className="stat-cards">
        <StatCard icon={FileText} tone="blue" label={tc('documents')} value={documents} />
        <StatCard icon={CreditCard} tone="green" label={tc('payment')} value={payment} />
        <StatCard icon={Plane} tone="purple" label={tc('visa')} value={visa} />
      </div>
    </div>
  )
}

function JourneyProgress({ status, t }: { status: CaseStatus; t: Translate }) {
  const currentStep = Math.max(0, JOURNEY.indexOf(status))
  const pct = Math.round((currentStep / (JOURNEY.length - 1)) * 100)
  return (
    <div className="journey-progress">
      <div className="row-between">
        <p className="journey-title">{t('journeyProgress')}</p>
        <p className="muted tiny">{t('pctCompleted', { pct })}</p>
      </div>
      <div className="journey-mobile">
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="tiny muted">
          {t('step', { current: currentStep + 1, total: JOURNEY.length })} ·{' '}
          <strong className="accent">{t(`journeySteps.${JOURNEY[currentStep]}`)}</strong>
        </p>
      </div>
      <div className="journey-steps">
        {JOURNEY.map((key, i) => {
          const state = i < currentStep ? 'complete' : i === currentStep ? 'current' : 'upcoming'
          return (
            <Fragment key={key}>
              <div className={`journey-step ${state}`}>
                <span className="journey-dot">
                  {state === 'complete' ? <Check size={14} /> : i + 1}
                </span>
                <span className="journey-label">{t(`journeySteps.${key}`)}</span>
              </div>
              {i < JOURNEY.length - 1 && (
                <span className={`journey-line${i < currentStep ? ' complete' : ''}`} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon
  tone: 'blue' | 'green' | 'purple'
  label: string
  value: string
}) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  )
}

function NextActionCard({ action, t }: { action: NextAction | null; t: Translate }) {
  return (
    <div className="card next-action">
      <h2 className="card-title">{t('nextActionRequired')}</h2>
      <div className="next-action-body">
        <span className={`next-action-icon ${action?.type ?? 'waiting'}`}>
          <ClipboardList size={32} />
        </span>
        <h3>{action ? t(`nextActions.${action.key}.title`) : t('noActionRequired')}</h3>
        <p className="muted small">
          {action ? t(`nextActions.${action.key}.description`) : t('noActionSubtext')}
        </p>
        {action?.href && t.has(`nextActions.${action.key}.actionLabel`) && (
          <Link className="button" to={action.href}>
            {t(`nextActions.${action.key}.actionLabel`)}
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </div>
  )
}
