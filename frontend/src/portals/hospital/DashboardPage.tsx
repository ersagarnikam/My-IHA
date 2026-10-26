import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  BriefcaseMedical,
  CalendarCheck,
  FileText,
  HeartPulse,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { formatDate } from '../doctor/shared'
import { CaseStatusPill } from './CasePages'
import { useHospital } from './HospitalContext'
import type { Dashboard } from './types'

export function HospitalDashboardPage() {
  const hospital = useHospital()
  const data = useApi<Dashboard>('/api/hospital/dashboard')
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading />
  const d = data.data

  return (
    <div className="dash">
      <div className="dash-welcome">
        <div>
          <h1>Welcome, {hospital.name}</h1>
          <p className="muted">Patients coming to you through MTA, and what they need from you</p>
        </div>
        <p className="muted small">
          {hospital.city}, {hospital.country}
        </p>
      </div>

      {d.lettersToIssue > 0 && (
        <Link to="/hospital/documents" className="dr-banner hp-attention">
          <FileText size={18} />
          <span>
            <strong>
              {d.lettersToIssue} paid {d.lettersToIssue === 1 ? 'case is' : 'cases are'} waiting for
              visa letters.
            </strong>{' '}
            Patients can't apply for their visa until you send the Hospital Invitation and Appointment
            Confirmation letters.
          </span>
          <span className="hp-attention-go">Open Documents →</span>
        </Link>
      )}

      <div className="dash-stats admin">
        <Stat
          to="/hospital/doctors"
          icon={Stethoscope}
          label="Affiliated doctors"
          value={d.doctors}
        />
        <Stat to="/hospital/patients" icon={Users} label="Patients" value={d.patients} />
        <Stat to="/hospital/cases" icon={BriefcaseMedical} label="Cases" value={d.cases} />
        <Stat
          to="/hospital/cases?tab=confirmed"
          icon={HeartPulse}
          label="Treatments confirmed"
          value={d.confirmedTreatments}
          foot={`${d.treated} treated`}
        />
      </div>

      <div className="dash-row two">
        <section className="dash-card">
          <h2 className="dash-card-title">
            <CalendarCheck size={18} /> Upcoming admissions
          </h2>
          {d.upcomingAdmissions.length === 0 ? (
            <p className="muted">No confirmed admissions coming up.</p>
          ) : (
            <ul className="dash-actions">
              {d.upcomingAdmissions.map((r) => (
                <li key={r.planId}>
                  <span className="dash-dot green" />
                  <div className="dash-action-text">
                    <p>
                      {r.patientName} · {r.procedure ?? r.condition}
                    </p>
                    <p className="muted small">
                      Admission {formatDate(r.admissionDate)} · {r.doctorName} · {r.referenceNumber}
                    </p>
                  </div>
                  <Link
                    to={`/hospital/cases/${r.planId}`}
                    className="dash-small-button button-secondary"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="dash-card">
          <h2 className="dash-card-title">How cases reach you</h2>
          <ol className="hp-steps">
            <li>
              A doctor affiliated with your hospital submits a treatment plan naming you; the case
              appears here.
            </li>
            <li>MTA reviews the plan and presents it to the patient with its costs.</li>
            <li>
              When the patient chooses and pays for it, you're notified: generate and send the two
              visa letters from Documents.
            </li>
            <li>
              The patient applies for their visa, travels, and is admitted on the planned date.
            </li>
          </ol>
        </section>
      </div>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Recent Cases</h2>
          <Link to="/hospital/cases">View All</Link>
        </div>
        <RecentTable rows={d.recentCases} />
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

function RecentTable({ rows }: { rows: Dashboard['recentCases'] }) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient</th>
            <th>Condition</th>
            <th>Doctor</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="dr-empty-row">
                No cases yet. They appear once an affiliated doctor submits a treatment plan naming
                your hospital.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.planId}>
              <td className="strong">{r.referenceNumber}</td>
              <td>{r.patientName ?? '—'}</td>
              <td>{r.condition}</td>
              <td>{r.doctorName ?? '—'}</td>
              <td>
                <CaseStatusPill row={r} />
              </td>
              <td>
                <Link className="button dr-view" to={`/hospital/cases/${r.planId}`}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
