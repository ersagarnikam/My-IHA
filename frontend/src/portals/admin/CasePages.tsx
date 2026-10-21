import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Download, Eye, FileImage, FileText, UserPlus } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, StatusBadge } from '../../components/ui'
import { apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { specialtyLabel } from '../doctor/types'
import type { AdminOutletContext } from './AdminLayout'
import { Fact } from './DoctorPages'
import {
  ASSIGNMENT_STATUS,
  Pill,
  PLAN_STATUS,
  type Candidate,
  type CaseDetail,
  type CaseRow,
} from './types'

type Tab = 'needs_doctor' | 'in_progress' | 'completed' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'needs_doctor', label: 'Needs a Doctor' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed / Closed' },
  { id: 'all', label: 'All' },
]

const DONE = ['completed', 'closed', 'visa_rejected']

export function AdminCasesPage() {
  const list = useApi<CaseRow[]>('/api/admin/cases')
  const [tab, setTab] = useState<Tab>('needs_doctor')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter((c) => {
    const inTab =
      tab === 'all' ||
      (tab === 'needs_doctor' && c.needsDoctor) ||
      (tab === 'in_progress' && !c.needsDoctor && !DONE.includes(c.status)) ||
      (tab === 'completed' && DONE.includes(c.status))
    return (
      inTab &&
      (!q ||
        c.referenceNumber.toLowerCase().includes(q) ||
        (c.patientName ?? '').toLowerCase().includes(q))
    )
  })
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Cases</h1>
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
            onChange={setQuery}
            placeholder="Search by patient name or case ID"
          />
        </div>
        <CasesTable rows={paged.rows} empty="No cases here." />
        {paged.footer}
      </section>
    </div>
  )
}

export function CasesTable({ rows, empty }: { rows: CaseRow[]; empty: string }) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient</th>
            <th>Condition</th>
            <th>Doctors</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="dr-empty-row">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="strong">{c.referenceNumber}</td>
              <td>{c.patientName}</td>
              <td>{specialtyLabel(c)}</td>
              <td className="small">
                {c.doctorNames.length > 0 ? (
                  c.doctorNames.join(', ')
                ) : c.needsDoctor ? (
                  <span className="badge badge-sm badge-warn">Needs a doctor</span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                <StatusBadge status={c.status} small />
              </td>
              <td>
                <Link className="button dr-view" to={`/admin/cases/${c.id}`}>
                  {c.needsDoctor ? 'Assign' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminCaseDetailPage() {
  const { caseId } = useParams()
  const format = useFormat()
  const detail = useApi<CaseDetail>(`/api/admin/cases/${caseId}`)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const c = detail.data
  const docPath = (id: string) => `/api/admin/cases/${c.id}/documents/${id}/content`

  return (
    <div className="dr-page">
      <BackHeader
        to="/admin/cases"
        title={`Case ${c.referenceNumber}`}
        subtitle={`Submitted ${formatDate(c.createdAt)}`}
      />

      <section className="dr-card row-between">
        <span>
          <strong>{specialtyLabel(c)}</strong>
        </span>
        <StatusBadge status={c.status} small />
      </section>

      {c.patient && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Patient</h2>
          <div className="dr-kv">
            <Fact label="Name" value={c.patient.fullName} />
            <Fact label="Date of birth" value={formatDate(c.patient.dateOfBirth)} />
            <Fact label="Gender" value={c.patient.gender} />
            <Fact label="Nationality" value={c.patient.nationality} />
            <Fact label="Country of residence" value={c.patient.countryOfResidence} />
            <Fact label="Phone" value={c.patient.phone} />
          </div>
        </section>
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Condition</h2>
        <p className="prewrap muted" style={{ margin: 0 }}>
          {c.description}
        </p>
      </section>

      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Documents
        </h2>
        {c.documents.length === 0 ? (
          <p className="muted">No documents.</p>
        ) : (
          <ul className="dr-files">
            {c.documents.map((d) => {
              const pdf = d.mimeType === 'application/pdf'
              return (
                <li key={d.id} className="dr-file">
                  <span className={`dr-file-icon${pdf ? ' pdf' : ''}`}>
                    {pdf ? <FileText size={16} /> : <FileImage size={16} />}
                  </span>
                  <div className="dr-file-body">
                    <p className="dr-file-name">{d.fileName}</p>
                    <p className="muted small" style={{ margin: 0 }}>
                      {format.bytes(d.fileSizeBytes)} · {formatDate(d.uploadedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dr-icon-button"
                    aria-label={`View ${d.fileName}`}
                    onClick={() => openFile(docPath(d.id))}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    type="button"
                    className="dr-icon-button"
                    aria-label={`Download ${d.fileName}`}
                    onClick={() => openFile(`${docPath(d.id)}?download=true`, d.fileName)}
                  >
                    <Download size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Doctors</h2>
        {c.assignments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No doctor invited yet.
          </p>
        ) : (
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Invitation</th>
                  <th>Progress</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {c.assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="strong">{a.doctorName}</td>
                    <td>
                      <Pill map={ASSIGNMENT_STATUS} value={a.status} />
                      <br />
                      <span className="muted small">Invited {formatDate(a.invitedAt)}</span>
                      {a.declineReason && (
                        <span className="muted small"> — “{a.declineReason}”</span>
                      )}
                    </td>
                    <td className="small">
                      {a.planSubmittedAt
                        ? `Plan submitted ${formatDate(a.planSubmittedAt)}`
                        : a.evaluationStartedAt
                          ? `Evaluating since ${formatDate(a.evaluationStartedAt)}`
                          : a.status === 'accepted'
                            ? 'Accepted, not started'
                            : '—'}
                      {a.consultationSkippedReason && (
                        <>
                          <br />
                          <span className="muted">
                            Consultation skipped: {a.consultationSkippedReason}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {a.planId && a.planStatus ? (
                        <Link to={`/admin/plans/${a.planId}`}>
                          <Pill map={PLAN_STATUS} value={a.planStatus} />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!DONE.includes(c.status) && <AssignDoctor caseId={c.id} onAssigned={detail.setData} />}
      </section>
    </div>
  )
}

function AssignDoctor({
  caseId,
  onAssigned,
}: {
  caseId: string
  onAssigned: (d: CaseDetail) => void
}) {
  const toast = useToast()
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  const candidates = useApi<Candidate[]>(`/api/admin/cases/${caseId}/candidates`)
  const [doctorId, setDoctorId] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const list = candidates.data ?? []

  async function assign() {
    setPending(true)
    setError(null)
    try {
      const updated = await apiPost<CaseDetail>(`/api/admin/cases/${caseId}/assignments`, {
        doctorId,
      })
      toast({ title: 'Doctor invited. They have been notified.', tone: 'good' })
      setDoctorId('')
      onAssigned(updated)
      void candidates.reload()
      refreshCounts()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="panel stack">
      <strong>
        <UserPlus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Invite a doctor
      </strong>
      {list.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          No other active doctors available.
        </p>
      ) : (
        <div className="row-start" style={{ alignItems: 'center' }}>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            aria-label="Doctor"
            style={{ maxWidth: '28rem' }}
          >
            <option value="">Choose a doctor…</option>
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName} — {d.specialties.join(', ')}
                {d.matchesSpecialty ? ' ✓ specialty match' : ''}
              </option>
            ))}
          </select>
          <button type="button" disabled={!doctorId || pending} onClick={assign}>
            {pending ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Several doctors can be invited; each evaluates the case and proposes their own plan. Only
        approved doctors who have paid the registration fee are listed.
      </p>
      <FormError error={error} />
    </div>
  )
}
