import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, SearchBox, usePaged } from '../doctor/shared'
import { KV } from '../doctor/settings/AccountSettingsPage'
import { ROLE_LABELS } from '../doctor/types'
import { CaseTable, PatientFacts } from './CasePages'
import type { DoctorDetail, DoctorRow, PatientDetail, PatientRow } from './types'

const DOCTOR_STATUS: Record<string, [string, string]> = {
  approved: ['Approved', 'badge-good'],
  pending: ['Pending', 'badge-warn'],
  more_info_requested: ['More info requested', 'badge-orange'],
  rejected: ['Rejected', 'badge-bad'],
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** "14:30" → "2:30 pm". */
function time12(value: string) {
  const [h, m] = value.split(':').map(Number)
  const hour = (h ?? 0) % 12 || 12
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${(h ?? 0) < 12 ? 'am' : 'pm'}`
}

// ── Patients ────────────────────────────────────────────────────────────

export function HospitalPatientsPage() {
  const list = useApi<PatientRow[]>('/api/hospital/patients')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (p) =>
      !q ||
      (p.fullName ?? '').toLowerCase().includes(q) ||
      p.latestReference.toLowerCase().includes(q),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Patient Management</h1>
        <p className="muted" style={{ margin: 0 }}>
          Patients whose cases reached your hospital through your doctors' treatment plans.
        </p>
      </div>
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search by name or case ID" />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Gender</th>
                <th>Country</th>
                <th>Cases</th>
                <th>Latest case</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="dr-empty-row">
                    No patients yet.
                  </td>
                </tr>
              )}
              {paged.rows.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.fullName ?? '—'}</td>
                  <td>{formatDate(p.dateOfBirth)}</td>
                  <td>{p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : '—'}</td>
                  <td>{p.country ?? '—'}</td>
                  <td>{p.caseCount}</td>
                  <td>
                    <Link to={`/hospital/cases/${p.latestPlanId}`}>{p.latestReference}</Link>
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/hospital/patients/${p.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
    </div>
  )
}

export function HospitalPatientDetailPage() {
  const { patientId } = useParams()
  const detail = useApi<PatientDetail>(`/api/hospital/patients/${patientId}`)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const p = detail.data
  return (
    <div className="dr-page">
      <BackHeader to="/hospital/patients" title={p.fullName} subtitle="Clinical profile" />
      <section className="dr-card stack">
        <h2 className="dr-subtitle">Patient details</h2>
        <div className="dr-kv">
          <PatientFacts info={p.info} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Contact details are shared through MTA. Use Messages to reach the MTA coordinator.
        </p>
      </section>
      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Cases at your hospital
        </h2>
        <CaseTable rows={p.cases} empty="No cases." hidePatient />
      </section>
    </div>
  )
}

// ── Doctors ─────────────────────────────────────────────────────────────

export function HospitalDoctorsPage() {
  const list = useApi<DoctorRow[]>('/api/hospital/doctors')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (d) =>
      !q ||
      d.fullName.toLowerCase().includes(q) ||
      d.specialties.some((s) => s.toLowerCase().includes(q)) ||
      (d.department ?? '').toLowerCase().includes(q),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Doctor Management</h1>
        <p className="muted" style={{ margin: 0 }}>
          Doctors who list your hospital as an affiliation. Doctors choose their affiliations
          themselves; contact MTA if one shouldn't be here.
        </p>
      </div>
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by name, specialty or department"
          />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialties</th>
                <th>Department / Role</th>
                <th>Contact</th>
                <th>Experience</th>
                <th>Cases here</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="dr-empty-row">
                    No affiliated doctors yet.
                  </td>
                </tr>
              )}
              {paged.rows.map((d) => {
                const [label, tone] = DOCTOR_STATUS[d.status] ?? [d.status, 'badge-muted']
                return (
                  <tr key={d.id}>
                    <td className="strong">{d.fullName}</td>
                    <td>{d.specialties.join(', ')}</td>
                    <td>
                      {d.department ?? '—'}
                      {d.role && <div className="muted small">{ROLE_LABELS[d.role] ?? d.role}</div>}
                    </td>
                    <td className="small">
                      {d.email ?? '—'}
                      {d.phone && <div className="muted">{d.phone}</div>}
                    </td>
                    <td>{d.yearsOfExperience != null ? `${d.yearsOfExperience} yrs` : '—'}</td>
                    <td>{d.cases}</td>
                    <td>
                      <span className={`badge badge-sm ${tone}`}>{label}</span>
                    </td>
                    <td>
                      <Link className="button dr-view" to={`/hospital/doctors/${d.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
    </div>
  )
}

export function HospitalDoctorDetailPage() {
  const { doctorId } = useParams()
  const detail = useApi<DoctorDetail>(`/api/hospital/doctors/${doctorId}`)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const [label, tone] = DOCTOR_STATUS[d.status] ?? [d.status, 'badge-muted']
  return (
    <div className="dr-page">
      <BackHeader to="/hospital/doctors" title={d.fullName} subtitle={d.specialties.join(', ')} />
      <section className="dr-card row-between">
        <span className={`badge badge-sm ${tone}`}>{label}</span>
        <span className="hp-mini-stats">
          <span>
            <strong>{d.totalCases}</strong> cases here
          </span>
          <span>
            <strong>{d.activeCases}</strong> active
          </span>
          <span>
            <strong>{d.completedCases}</strong> treated
          </span>
        </span>
      </section>

      <div className="hp-two">
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Professional details</h2>
          <div className="dr-kv">
            <KV label="Qualifications" value={d.qualifications} />
            <KV
              label="Experience"
              value={d.yearsOfExperience != null ? `${d.yearsOfExperience} years` : null}
            />
            <KV label="AHPRA number" value={d.licenseNumber} />
            <KV label="Department" value={d.department} />
            <KV label="Role" value={d.role ? (ROLE_LABELS[d.role] ?? d.role) : null} />
            <KV label="Languages" value={d.languages.join(', ')} />
            <KV label="Hospital affiliations" value={d.hospitals.join(', ')} className="full" />
            <KV label="Bio" value={d.bio} className="full" />
          </div>
        </section>
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Contact &amp; schedule</h2>
          <div className="dr-kv">
            <KV label="Email" value={d.email} />
            <KV label="Phone" value={d.phone} />
          </div>
          <table className="dash-table">
            <tbody>
              {d.availability.map((a) => (
                <tr key={a.day}>
                  <td>{DAY_LABELS[a.day] ?? a.day}</td>
                  <td className="num">
                    {a.enabled ? (
                      `${time12(a.start_time)} – ${time12(a.end_time)}`
                    ) : (
                      <span className="muted">Not working</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Cases at your hospital
        </h2>
        <CaseTable rows={d.cases} empty="No cases with this doctor at your hospital yet." />
      </section>
    </div>
  )
}
