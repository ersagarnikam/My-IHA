import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  BriefcaseMedical,
  ClipboardCheck,
  MessageSquare,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { formatDate, formatSlot } from '../doctor/shared'
import { CasesTable } from './CasePages'
import {
  FEE_STATUS,
  Pill,
  pct,
  responseTime,
  type DoctorStats,
  type Insights,
  type Overview,
} from './types'

const wholeDollars = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
})
const money = (amount: number) => wholeDollars.format(amount)

export function AdminDashboardPage() {
  const insights = useApi<Insights>('/api/admin/insights')
  const overview = useApi<Overview>('/api/admin/overview')
  const error = insights.error ?? overview.error
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void insights.reload()
          void overview.reload()
        }}
      />
    )
  if (!insights.data || !overview.data) return <Loading />
  const i = insights.data
  const p = i.platform
  const m = i.money
  const received = m.treatmentPaymentsAud + m.consultationFeesAud

  return (
    <div className="dash">
      <div className="dash-welcome">
        <div>
          <h1>Coordinator dashboard</h1>
          <p className="muted">How the platform is doing and what needs MTA's attention</p>
        </div>
        <p className="muted small">Money: last 12 months · times in Brisbane</p>
      </div>

      <section className="dash-hero">
        <div>
          <p className="dash-hero-label">Received from patients</p>
          <p className="dash-hero-value">
            {money(received)}
            <span className="dash-hero-dot">·</span>
            {money(m.mtaServiceFeesAud)} MTA service fees
          </p>
          <p className="dash-hero-note">
            {money(m.treatmentPaymentsAud)} treatments · {money(m.consultationFeesAud)}{' '}
            consultations · {money(m.doctorMembershipFeesAud)} doctor membership fees
          </p>
        </div>
        <div className="dash-hero-stats">
          <HeroStat label="Active doctors" value={p.activeDoctors} />
          <HeroStat label="Patients" value={p.patients} />
          <HeroStat label="Cases in progress" value={p.casesInProgress} />
          <HeroStat label="Treated" value={p.casesCompleted} />
        </div>
      </section>

      <div className="dash-stats admin">
        <Tile
          to="/admin/doctors"
          icon={Stethoscope}
          label="Doctor registrations to review"
          value={i.attention.pendingDoctors}
        />
        <Tile
          to="/admin/cases"
          icon={BriefcaseMedical}
          label="Cases waiting for a doctor"
          value={i.attention.casesNeedingDoctor}
        />
        <Tile
          to="/admin/plans"
          icon={ClipboardCheck}
          label="Treatment plans to review"
          value={i.attention.plansToReview}
        />
        <Tile
          to="/admin/messages"
          icon={MessageSquare}
          label="Conversations waiting"
          value={i.attention.chatsWaiting}
        />
      </div>

      <div className="dash-row two">
        <PipelineCard
          pipeline={i.pipeline}
          total={p.totalCases}
          newThisMonth={p.newCasesThisMonth}
        />
        <RevenueCard money={m} />
      </div>

      <DoctorsCard
        doctors={i.doctors}
        byStatus={i.doctorsByStatus}
        awaitingFee={p.doctorsAwaitingFee}
      />

      <div className="dash-row three-even">
        <NudgeCard insights={i} />
        <UpcomingCard upcoming={i.upcomingConsultations} />
        <CoverageCard specialties={i.specialties} />
      </div>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Recent Cases</h2>
          <Link to="/admin/cases">View All</Link>
        </div>
        <CasesTable rows={overview.data.recentCases} empty="No cases yet." />
      </section>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="dash-hero-stat-label">{label}</p>
      <p className="dash-hero-stat-value">{value}</p>
    </div>
  )
}

function Tile({
  to,
  icon: Icon,
  label,
  value,
}: {
  to: string
  icon: LucideIcon
  label: string
  value: number
}) {
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

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="dash-card">
      <div className="row-between">
        <h2 className="dash-card-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PipelineCard({
  pipeline,
  total,
  newThisMonth,
}: {
  pipeline: Insights['pipeline']
  total: number
  newThisMonth: number
}) {
  const max = Math.max(1, ...pipeline.map((s) => s.count))
  return (
    <Card
      title="Case pipeline"
      action={
        <Link to="/admin/cases" className="small">
          All cases
        </Link>
      }
    >
      <div className="dash-funnel">
        {pipeline.map((s, idx) => (
          <div key={s.key} className="dash-funnel-row">
            <span>{s.label}</span>
            <div className="dash-funnel-track">
              {s.count > 0 ? (
                <span
                  className={
                    s.key === 'completed'
                      ? 'last'
                      : s.key === 'closed'
                        ? 'closed'
                        : `step-${Math.min(idx, 4)}`
                  }
                  style={{ width: `${Math.max(s.count / max, 0.08) * 100}%` }}
                >
                  {s.count}
                </span>
              ) : (
                <em className="muted small">0</em>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small dash-foot">
        {total} cases in total · {newThisMonth} new this month
      </p>
    </Card>
  )
}

function RevenueCard({ money: m }: { money: Insights['money'] }) {
  const max = Math.max(1, ...m.monthly.map((x) => x.patientPaymentsAud + x.doctorFeesAud))
  const month = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })
  return (
    <Card title="Money received by month">
      <div className="dash-earn-figures">
        <div>
          <p className="muted small">Patient payments</p>
          <p className="dash-earn">{money(m.treatmentPaymentsAud + m.consultationFeesAud)}</p>
        </div>
        <div>
          <p className="muted small">MTA service fees</p>
          <p className="dash-earn green">{money(m.mtaServiceFeesAud)}</p>
        </div>
        <div>
          <p className="muted small">Doctor fees</p>
          <p className="dash-earn orange">{money(m.doctorMembershipFeesAud)}</p>
        </div>
      </div>
      <div className="admin-bars" aria-label="Money received by month">
        {m.monthly.map((x) => (
          <div
            key={x.month}
            className="admin-bar"
            title={`${month(x.month)}: ${money(x.patientPaymentsAud)} from patients, ${money(x.doctorFeesAud)} doctor fees`}
          >
            <span
              className="patients"
              style={{ height: `${(x.patientPaymentsAud / max) * 100}%` }}
            />
            <span className="doctors" style={{ height: `${(x.doctorFeesAud / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="row-between muted small">
        <span>{month(m.monthly[0]?.month ?? '')}</span>
        <span className="admin-legend">
          <i className="patients" /> Patients <i className="doctors" /> Doctor fees
        </span>
        <span>{month(m.monthly.at(-1)?.month ?? '')}</span>
      </div>
    </Card>
  )
}

function DoctorsCard({
  doctors,
  byStatus,
  awaitingFee,
}: {
  doctors: DoctorStats[]
  byStatus: Record<string, number>
  awaitingFee: number
}) {
  const navigate = useNavigate()
  const format = useFormat()
  const active = doctors.filter((d) => d.active).length
  return (
    <section className="dash-card">
      <div className="row-between">
        <h2 className="dash-card-title">Doctors</h2>
        <Link to="/admin/doctors" className="small">
          All doctors
        </Link>
      </div>
      <div className="admin-chips">
        <span>
          <strong>{active}</strong> active
        </span>
        <span>
          <strong>{awaitingFee}</strong> approved, fee unpaid
        </span>
        <Link to="/admin/doctors">
          <strong>{byStatus.pending ?? 0}</strong> pending review
        </Link>
        <span>
          <strong>{byStatus.more_info_requested ?? 0}</strong> asked for more info
        </span>
        <span>
          <strong>{byStatus.rejected ?? 0}</strong> rejected
        </span>
      </div>
      {doctors.length === 0 ? (
        <p className="muted">No approved doctors yet.</p>
      ) : (
        <div className="dr-table-wrap">
          <table className="dash-table admin-doctor-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th title="Accepted cases still in progress">Active cases</th>
                <th title="Invitations not answered yet">Invites waiting</th>
                <th title="Accepted ÷ answered invitations">Accepts</th>
                <th title="Average time to answer an invitation">Response</th>
                <th>Plans sent</th>
                <th title="Patients who chose this doctor's plan ÷ plans decided">Plans chosen</th>
                <th>Treated</th>
                <th title="Doctor fees on plans patients have paid for">Fees earned</th>
                <th>Membership</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {doctors.slice(0, 10).map((d) => (
                <tr
                  key={d.id}
                  className="admin-row-link"
                  onClick={() => navigate(`/admin/doctors/${d.id}`)}
                >
                  <td>
                    <Link
                      to={`/admin/doctors/${d.id}`}
                      className="strong"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.fullName}
                    </Link>
                    <br />
                    <span className="muted small">
                      {d.specialties.join(', ')}
                      {d.yearsOfExperience != null ? ` · ${d.yearsOfExperience} yrs` : ''}
                    </span>
                  </td>
                  <td className="num">{d.activeCases}</td>
                  <td className={`num${d.pendingInvitations > 0 ? ' warn' : ''}`}>
                    {d.pendingInvitations}
                  </td>
                  <td className="num">{pct(d.invitationAcceptancePct)}</td>
                  <td className="num">{responseTime(d.avgResponseHours)}</td>
                  <td className="num">{d.plansSubmitted}</td>
                  <td className="num">{pct(d.planChosenPct)}</td>
                  <td className="num">{d.patientsTreated}</td>
                  <td className="num">{money(d.doctorFeesEarnedAud)}</td>
                  <td>
                    <Pill map={FEE_STATUS} value={d.feeStatus} />
                    {d.annualFeeNextDueAt && d.feeStatus !== 'unpaid' && (
                      <div className="muted small">renews {formatDate(d.annualFeeNextDueAt)}</div>
                    )}
                  </td>
                  <td className="small muted">
                    {d.lastActivityAt ? format.relative(d.lastActivityAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doctors.length > 10 && (
        <p className="muted small">
          Showing the 10 busiest of {doctors.length}.{' '}
          <Link to="/admin/doctors">See all doctors</Link>
        </p>
      )}
    </section>
  )
}

function NudgeCard({ insights: i }: { insights: Insights }) {
  const format = useFormat()
  type Item = {
    key: string
    tone: 'red' | 'orange' | 'blue'
    title: ReactNode
    detail: ReactNode
    to: string
  }
  const items: Item[] = [
    ...i.waitingInvitations.map(
      (w): Item => ({
        key: `inv-${w.caseId}-${w.doctorId}`,
        tone: 'orange',
        title: (
          <>
            {w.doctorName ?? 'A doctor'} hasn't answered {w.referenceNumber ?? 'a case'}
          </>
        ),
        detail: `Invited ${format.relative(w.invitedAt)}`,
        to: `/admin/cases/${w.caseId}`,
      }),
    ),
    ...i.feeAlerts.map(
      (f): Item => ({
        key: `fee-${f.doctorId}`,
        tone: f.status === 'overdue' ? 'red' : f.status === 'unpaid' ? 'blue' : 'orange',
        title: (
          <>
            {f.fullName}: {FEE_STATUS[f.status][0].toLowerCase()}
          </>
        ),
        detail:
          f.status === 'unpaid'
            ? "Approved, but can't receive cases until the registration fee is paid"
            : `Annual fee ${f.status === 'overdue' ? 'was due' : 'due'} ${formatDate(f.annualFeeNextDueAt)}`,
        to: `/admin/doctors/${f.doctorId}`,
      }),
    ),
  ]
  return (
    <Card title="Needs a nudge">
      {items.length === 0 ? (
        <p className="muted">
          Nothing overdue. Invitations older than 48 hours and doctor fees due show here.
        </p>
      ) : (
        <ul className="dash-actions">
          {items.slice(0, 6).map((a) => (
            <li key={a.key}>
              <span className={`dash-dot ${a.tone}`} />
              <div className="dash-action-text">
                <p>{a.title}</p>
                <p className="muted small">{a.detail}</p>
              </div>
              <Link to={a.to} className="dash-small-button button-secondary">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && <p className="muted small">+{items.length - 6} more</p>}
    </Card>
  )
}

function UpcomingCard({ upcoming }: { upcoming: Insights['upcomingConsultations'] }) {
  return (
    <Card title="Upcoming consultations">
      {upcoming.length === 0 ? (
        <p className="muted">No Zoom consultations booked for the next two weeks.</p>
      ) : (
        <ul className="dash-actions">
          {upcoming.map((c) => (
            <li key={c.id}>
              <span className={`dash-dot ${c.kind === 'initial' ? 'blue' : 'green'}`} />
              <div className="dash-action-text">
                <p>
                  {c.doctorName ?? 'Doctor'} with {c.patientName ?? 'patient'}
                </p>
                <p className="muted small">
                  {formatSlot(c.startsAt, c.endsAt)} ·{' '}
                  {c.kind === 'initial' ? 'Initial' : 'Follow-up'} · {c.referenceNumber}
                </p>
              </div>
              <Link to={`/admin/cases/${c.caseId}`} className="dash-small-button button-secondary">
                Case
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function CoverageCard({ specialties }: { specialties: Insights['specialties'] }) {
  return (
    <Card title="Specialty coverage">
      {specialties.length === 0 ? (
        <p className="muted">No active doctors or open cases yet.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Specialty</th>
              <th className="num">Doctors</th>
              <th className="num">Open cases</th>
            </tr>
          </thead>
          <tbody>
            {specialties.slice(0, 8).map((s) => {
              const gap = s.openCases > 0 && s.activeDoctors === 0
              return (
                <tr key={s.specialty}>
                  <td>
                    {s.specialty}
                    {gap && <span className="badge badge-sm badge-bad admin-gap">No doctor</span>}
                  </td>
                  <td className="num">{s.activeDoctors}</td>
                  <td className="num">{s.openCases}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="muted small dash-foot">
        Active doctors per specialty against cases still in progress.
      </p>
    </Card>
  )
}
