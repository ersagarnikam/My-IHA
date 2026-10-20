import { Link } from 'react-router'
import {
  CalendarDays,
  FileSearch,
  FileText,
  Layers,
  MessageSquare,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { useDoctor } from './DoctorContext'
import { DevDoctorPanel } from './DevPanel'
import {
  brisbaneToday,
  CaseBadge,
  formatDate,
  formatLongDate,
  formatSlotTime,
} from './shared'
import { specialtyLabel, type CaseRow, type DoctorConsultation } from './types'

export function DashboardPage() {
  const doctor = useDoctor()
  const cases = useApi<CaseRow[]>('/api/doctor/cases')
  const consultations = useApi<DoctorConsultation[]>('/api/doctor/consultations')

  if (cases.error) return <ErrorState error={cases.error} onRetry={cases.reload} />
  if (consultations.error) return <ErrorState error={consultations.error} onRetry={consultations.reload} />
  if (!cases.data || !consultations.data) return <Loading />

  const accepted = cases.data.filter((c) => c.assignment.status === 'accepted')
  const today = brisbaneToday()
  const now = Date.now()

  const upcomingConsultations = consultations.data
    .filter((c) => c.status === 'scheduled')
    .map((c) => ({ c, slot: c.slots.find((s) => s.id === c.selectedSlotId) }))
    .filter(({ slot }) => slot && new Date(slot.slotEndTime).getTime() > now)
    .sort((a, b) => a.slot!.slotTime.localeCompare(b.slot!.slotTime))
    .slice(0, 5)

  const upcomingTreatments = accepted
    .filter((c) => c.planStatus === 'patient_confirmed' && c.treatmentStartDate)
    .filter((c) => (c.treatmentEndDate ?? c.treatmentStartDate!) >= today)
    .sort((a, b) => a.treatmentStartDate!.localeCompare(b.treatmentStartDate!))
    .slice(0, 5)

  return (
    <div className="dr-page">
      <h1 className="dr-title">Welcome, {doctor.fullName}</h1>

      <h2 className="dr-subtitle">Quick Actions</h2>
      <div className="dr-quick">
        <Link to="/doctor/cases">
          <FileText size={24} />
          View All Cases
        </Link>
        <Link to="/doctor/consultations">
          <CalendarDays size={24} />
          View All Consultations
        </Link>
        <Link to="/doctor/messages">
          <MessageSquare size={24} />
          Chat with Admin
        </Link>
      </div>

      <div className="dr-metrics">
        <Metric label="Accepted Cases" value={accepted.length} icon={FileText} />
        <Metric
          label="Under Evaluation"
          value={
            accepted.filter((c) => c.caseStatus === 'evaluation' && !c.assignment.planSubmittedAt).length
          }
          icon={FileSearch}
        />
        <Metric
          label="Treatment Plans Confirmed"
          value={accepted.filter((c) => c.planStatus === 'patient_confirmed').length}
          icon={Layers}
        />
        <Metric
          label="Completed Cases"
          value={accepted.filter((c) => c.caseStatus === 'completed').length}
          icon={UserCheck}
        />
      </div>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Upcoming Consultations</h2>
          <Link to="/doctor/consultations">View All</Link>
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Case ID</th>
                <th>Date</th>
                <th>Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {upcomingConsultations.length === 0 && (
                <tr>
                  <td colSpan={5} className="dr-empty-row">
                    No upcoming consultations.
                  </td>
                </tr>
              )}
              {upcomingConsultations.map(({ c, slot }) => (
                <tr key={c.id}>
                  <td className="strong">{c.patientName}</td>
                  <td>{c.caseReference}</td>
                  <td>{formatLongDate(slot!.slotTime)}</td>
                  <td>{formatSlotTime(slot!.slotTime, slot!.slotEndTime)}</td>
                  <td>
                    <Link className="button dr-view" to={`/doctor/consultations/${c.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Upcoming Treatments</h2>
          <Link to="/doctor/cases">View All</Link>
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Case ID</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {upcomingTreatments.length === 0 && (
                <tr>
                  <td colSpan={5} className="dr-empty-row">
                    No upcoming treatments.
                  </td>
                </tr>
              )}
              {upcomingTreatments.map((c) => (
                <tr key={c.caseId}>
                  <td className="strong">{c.patientName}</td>
                  <td>{c.referenceNumber}</td>
                  <td>{formatDate(c.treatmentStartDate)}</td>
                  <td>{formatDate(c.treatmentEndDate)}</td>
                  <td>
                    <Link className="button dr-view" to={`/doctor/cases/${c.caseId}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Recent Cases</h2>
          <Link to="/doctor/cases">View All</Link>
        </div>
        <CasesTable rows={cases.data.slice(0, 5)} empty="No cases assigned to you yet." />
      </section>

      <DevDoctorPanel
        actions={[{ label: 'Assign me a new case (patient + admin)', path: '/api/dev/doctor/assign-case' }]}
        onChanged={cases.reload}
      />
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="dr-metric">
      <div>
        <p className="dr-metric-label">{label}</p>
        <p className="dr-metric-value">{value}</p>
      </div>
      <span className="dr-metric-icon">
        <Icon size={20} />
      </span>
    </div>
  )
}

/** Case ID, patient, condition, status, View — shared by the dashboard and My Cases. */
export function CasesTable({ rows, empty }: { rows: CaseRow[]; empty: string }) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient Name</th>
            <th>Condition</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="dr-empty-row">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr key={c.assignment.id}>
              <td className="strong">{c.referenceNumber}</td>
              <td>{c.patientName}</td>
              <td>{specialtyLabel(c)}</td>
              <td>
                <CaseBadge assignment={c.assignment} caseStatus={c.caseStatus} planStatus={c.planStatus} />
              </td>
              <td>
                <Link className="button dr-view" to={`/doctor/cases/${c.caseId}`}>
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

