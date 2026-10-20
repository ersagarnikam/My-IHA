import { Link } from 'react-router'
import { BriefcaseMedical, ClipboardCheck, MessageSquare, Stethoscope, type LucideIcon } from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { CasesTable } from './CasePages'
import type { Overview } from './types'

export function AdminDashboardPage() {
  const overview = useApi<Overview>('/api/admin/overview')
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />
  if (!overview.data) return <Loading />
  const o = overview.data
  return (
    <div className="dash">
      <div className="dash-welcome">
        <div>
          <h1>Coordinator dashboard</h1>
          <p className="muted">What needs MTA's attention right now</p>
        </div>
        <p className="muted small">{o.totalCases} cases on the platform</p>
      </div>

      <div className="dash-stats admin">
        <Tile to="/admin/doctors" icon={Stethoscope} label="Doctor registrations to review" value={o.pendingDoctors} />
        <Tile to="/admin/cases" icon={BriefcaseMedical} label="Cases waiting for a doctor" value={o.casesNeedingDoctor} />
        <Tile to="/admin/plans" icon={ClipboardCheck} label="Treatment plans to review" value={o.plansToReview} />
        <Tile to="/admin/messages" icon={MessageSquare} label="Conversations waiting" value={o.chatsWaiting} />
      </div>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Recent Cases</h2>
          <Link to="/admin/cases">View All</Link>
        </div>
        <CasesTable rows={o.recentCases} empty="No cases yet." />
      </section>
    </div>
  )
}

function Tile({ to, icon: Icon, label, value }: { to: string; icon: LucideIcon; label: string; value: number }) {
  return (
    <Link to={to} className={`dash-card dash-stat dash-tile${value > 0 ? ' attention' : ''}`}>
      <p className="dash-stat-label">
        <Icon size={16} /> {label}
      </p>
      <p className="dash-stat-value">{value}</p>
      <p className="small muted">{value > 0 ? 'Open →' : 'All clear'}</p>
    </Link>
  )
}
