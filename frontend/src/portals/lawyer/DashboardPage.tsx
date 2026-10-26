import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, FilePlus2, FileWarning, Hourglass, type LucideIcon } from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { CaseTable } from './CasePages'
import { useLawyer } from './LawyerContext'
import type { CaseRow } from './types'

type Dashboard = {
  newCases: number
  inProgress: number
  approved: number
  docsPending: number
  recent: CaseRow[]
}

export function LawyerDashboardPage() {
  const lawyer = useLawyer()
  const data = useApi<Dashboard>('/api/lawyer/dashboard')
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading />
  const d = data.data

  return (
    <div className="dash">
      <div className="dash-welcome">
        <div>
          <h1>Welcome, {lawyer.name}</h1>
          <p className="muted">Medical treatment visa applications MTA has assigned to you</p>
        </div>
      </div>

      {d.newCases > 0 && (
        <Link to="/lawyer/cases?tab=new" className="dr-banner hp-attention">
          <FilePlus2 size={18} />
          <span>
            <strong>
              {d.newCases} new {d.newCases === 1 ? 'application is' : 'applications are'} waiting
              for review.
            </strong>{' '}
            Move a case to Under Review to start, and request any documents you still need.
          </span>
          <span className="hp-attention-go">Open Visa Cases →</span>
        </Link>
      )}

      <div className="dash-stats admin">
        <Stat to="/lawyer/cases?tab=new" icon={FilePlus2} label="New" value={d.newCases} />
        <Stat
          to="/lawyer/cases?tab=active"
          icon={Hourglass}
          label="In progress"
          value={d.inProgress}
        />
        <Stat
          to="/lawyer/cases?tab=docs_pending"
          icon={FileWarning}
          label="Waiting for documents"
          value={d.docsPending}
        />
        <Stat to="/lawyer/documents" icon={BadgeCheck} label="Approved" value={d.approved} />
      </div>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Recent Cases</h2>
          <Link to="/lawyer/cases">View All</Link>
        </div>
        <CaseTable
          rows={d.recent}
          empty="No visa cases yet. MTA assigns applications to you once patients submit them."
        />
      </section>
    </div>
  )
}

function Stat({
  to,
  icon: Icon,
  label,
  value,
  foot,
}: {
  to: string
  icon: LucideIcon
  label: string
  value: number
  foot?: ReactNode
}) {
  return (
    <Link to={to} className="dash-card dash-stat dash-tile">
      <p className="dash-stat-label">
        <Icon size={16} /> {label}
      </p>
      <p className="dash-stat-value">{value}</p>
      <p className="small muted">{foot ?? 'Open →'}</p>
    </Link>
  )
}
