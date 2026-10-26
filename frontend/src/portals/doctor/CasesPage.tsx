import { useState } from 'react'
import { Filter } from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { CasesTable } from './DashboardPage'
import { PillTabs, SearchBox, usePaged } from './shared'
import type { CaseRow } from './types'

type Tab =
  | 'all'
  | 'new'
  | 'evaluation'
  | 'plan_submitted'
  | 'plan_confirmed'
  | 'completed'
  | 'declined'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'plan_submitted', label: 'Treatment Plan Submitted' },
  { id: 'plan_confirmed', label: 'Plan Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'declined', label: 'Declined' },
]

const PLAN_CONFIRMED = new Set([
  'treatment_confirmed',
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
])

const RANGES = [
  { id: 'all', label: 'All Time', days: null },
  { id: '7', label: 'Last 7 Days', days: 7 },
  { id: '30', label: 'Last 30 Days', days: 30 },
  { id: '90', label: 'Last 90 Days', days: 90 },
] as const

/** Old matchesStatusTab: the doctor's own response decides New/Declined; the case's stage decides the rest. */
function inTab(tab: Tab, c: CaseRow) {
  const a = c.assignment
  const declined =
    a.status === 'declined' ||
    a.status === 'withdrawn' ||
    a.status === 'cancelled' ||
    c.caseStatus === 'visa_rejected' ||
    c.planStatus === 'rejected_by_iha'
  switch (tab) {
    case 'new':
      return !declined && a.status === 'invited'
    case 'evaluation':
      return (
        !declined &&
        a.status === 'accepted' &&
        (c.caseStatus === 'doctor_assigned' || c.caseStatus === 'evaluation') &&
        !a.planSubmittedAt
      )
    case 'plan_submitted':
      return (
        !declined &&
        a.status === 'accepted' &&
        ((c.caseStatus === 'evaluation' && !!a.planSubmittedAt) ||
          c.caseStatus === 'treatment_plan')
      )
    case 'plan_confirmed':
      return !declined && PLAN_CONFIRMED.has(c.caseStatus)
    case 'completed':
      return !declined && c.caseStatus === 'completed'
    case 'declined':
      return declined
    default:
      return true
  }
}

export function CasesPage() {
  const cases = useApi<CaseRow[]>('/api/doctor/cases')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('all')

  const q = query.trim().toLowerCase()
  const days = RANGES.find((r) => r.id === range)!.days
  const cutoff = days ? Date.now() - days * 86_400_000 : null
  const filtered = (cases.data ?? []).filter(
    (c) =>
      inTab(tab, c) &&
      (!q ||
        c.referenceNumber.toLowerCase().includes(q) ||
        (c.patientName ?? '').toLowerCase().includes(q)) &&
      (!cutoff || new Date(c.caseCreatedAt).getTime() >= cutoff),
  )
  const paged = usePaged(filtered)

  if (cases.error) return <ErrorState error={cases.error} onRetry={cases.reload} />
  if (!cases.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">My Cases</h1>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            placeholder="Search by patient name or case ID"
            onChange={(v) => {
              setQuery(v)
              paged.reset()
            }}
          />
          <label className="row-start" style={{ alignItems: 'center', gap: '0.35rem' }}>
            <Filter size={14} className="muted" />
            <select
              value={range}
              aria-label="Date range"
              onChange={(e) => {
                setRange(e.target.value as typeof range)
                paged.reset()
              }}
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CasesTable rows={paged.rows} empty="No cases found." />
        {paged.footer}
      </section>
    </div>
  )
}
