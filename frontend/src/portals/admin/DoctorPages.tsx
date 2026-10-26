import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Download, Eye, FileText } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal, StatusBadge } from '../../components/ui'
import { ApiError, apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import type { AdminOutletContext } from './AdminLayout'
import { VerificationCard, type Verifications } from './Verification'
import {
  ASSIGNMENT_STATUS,
  DOCTOR_STATUS,
  FEE_STATUS,
  Pill,
  PLAN_STATUS,
  pct,
  responseTime,
  type DoctorDetail,
  type DoctorPerformance,
  type DoctorRow,
} from './types'

const INDEMNITY_STATUS: Record<string, [string, string]> = {
  valid: ['Current', 'badge-good'],
  expired: ['Expired', 'badge-bad'],
  missing: ['Not declared', 'badge-warn'],
}

type Tab = 'pending' | 'more_info_requested' | 'approved' | 'rejected' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'more_info_requested', label: 'More Info Requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

export function AdminDoctorsPage() {
  const list = useApi<DoctorRow[]>('/api/admin/doctors')
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (d) =>
      (tab === 'all' || d.status === tab) &&
      (!q || d.fullName.toLowerCase().includes(q) || (d.email ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Doctor Approvals</h1>
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
          <SearchBox value={query} onChange={setQuery} placeholder="Search by name or email" />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Specialties</th>
                <th>Registered</th>
                <th>Status</th>
                <th>Fee</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="dr-empty-row">
                    No doctors here.
                  </td>
                </tr>
              )}
              {paged.rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="strong">{d.fullName}</span>
                    <br />
                    <span className="muted small">{d.email}</span>
                  </td>
                  <td>{d.specialties.join(', ')}</td>
                  <td>{formatDate(d.createdAt)}</td>
                  <td>
                    <Pill map={DOCTOR_STATUS} value={d.status} />
                  </td>
                  <td className="small">
                    {d.registrationFeePaidAt
                      ? 'Paid'
                      : d.status === 'approved'
                        ? 'Awaiting payment'
                        : '—'}
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/admin/doctors/${d.id}`}>
                      {d.status === 'pending' ? 'Review' : 'View'}
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

export function AdminDoctorDetailPage() {
  const { doctorId } = useParams()
  const format = useFormat()
  const toast = useToast()
  const detail = useApi<DoctorDetail>(`/api/admin/doctors/${doctorId}`)
  const checks = useApi<Verifications>(`/api/admin/verifications/doctor/${doctorId}`)
  const [dialog, setDialog] = useState<'rejected' | 'more_info_requested' | null>(null)
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const doc = d.doctor
  const reviewable = doc.status === 'pending'

  async function approve() {
    try {
      await apiPost(`/api/admin/doctors/${doc.id}/review`, { outcome: 'approved' })
      toast({
        title: `${doc.fullName} approved. They'll be asked to pay the registration fee.`,
        tone: 'good',
      })
      void detail.reload()
      refreshCounts()
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not approve this registration.',
        tone: 'bad',
      })
    }
  }

  const docPath = (i: number) => `/api/admin/doctors/${doc.id}/documents/${i}`

  return (
    <div className="dr-page">
      <BackHeader to="/admin/doctors" title={doc.fullName} subtitle={doc.email ?? undefined} />

      <section className="dr-card row-between">
        <div>
          <Pill map={DOCTOR_STATUS} value={doc.status} />{' '}
          <span className="muted small">Registered {formatDate(doc.createdAt)}</span>
          {doc.registrationFeePaidAt && (
            <span className="muted small">
              {' '}
              · Registration fee paid {formatDate(doc.registrationFeePaidAt)}
            </span>
          )}
        </div>
        {reviewable && (
          <div className="dr-actions">
            <button
              type="button"
              onClick={approve}
              disabled={!checks.data?.allPassing}
              title={checks.data?.allPassing ? undefined : 'Record a passing AHPRA check first'}
            >
              Approve
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setDialog('more_info_requested')}
            >
              Request more info
            </button>
            <button type="button" className="button-danger" onClick={() => setDialog('rejected')}>
              Reject
            </button>
          </div>
        )}
      </section>

      {(d.moreInfoMessage || d.rejectionReason) && (
        <div className={`dr-banner${d.rejectionReason ? ' bad' : ''}`}>
          {d.rejectionReason
            ? `Rejected: ${d.rejectionReason}`
            : `More information requested: ${d.moreInfoMessage}`}
        </div>
      )}

      {checks.data && (
        <VerificationCard
          providerType="doctor"
          providerId={doc.id}
          data={checks.data}
          onChange={() => void checks.reload()}
        />
      )}

      {doc.status === 'approved' && <PerformanceSection doctorId={doc.id} />}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Professional details</h2>
        <div className="dr-kv">
          <Fact label="Specialties" value={doc.specialties.join(', ')} />
          <Fact label="Qualifications" value={d.qualifications} />
          <Fact
            label="Experience"
            value={d.yearsOfExperience != null ? `${d.yearsOfExperience} years` : null}
          />
          <Fact label="AHPRA number" value={d.licenseNumber} />
          <Fact label="Department" value={d.department} />
          <Fact label="Role" value={d.role ? capitalize(d.role) : null} />
          <Fact label="Phone" value={d.contactPhone} />
          <Fact label="Languages" value={d.languagesSpoken.join(', ')} />
          <Fact label="Working days" value={d.workingDays.map(capitalize).join(', ')} />
          <Fact label="Hospital affiliations" value={d.hospitals.join(', ')} className="full" />
          <Fact label="Bio" value={d.bio} className="full" />
        </div>
      </section>

      <section className="dr-card stack">
        <div className="row-between">
          <h2 className="dr-subtitle">Indemnity & telehealth declaration</h2>
          <Pill map={INDEMNITY_STATUS} value={d.indemnityStatus} />
        </div>
        {d.indemnity ? (
          <div className="dr-kv">
            <Fact label="Insurer" value={d.indemnity.insurer} />
            <Fact label="Policy number" value={d.indemnity.policyNumber} />
            <Fact label="Expires" value={formatDate(d.indemnity.expiresOn)} />
            <Fact label="Declared" value={formatDate(d.indemnity.declaredAt)} />
            <Fact
              label="Covers patients outside Australia"
              value={d.indemnity.coversOverseas ? 'Yes' : 'No'}
            />
            <Fact
              label="Telehealth guidelines acknowledged"
              value={d.indemnity.telehealthGuidelinesAck ? 'Yes' : 'No'}
            />
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Not declared yet. The doctor declares it in Settings after paying the registration fee;
            they can't offer consultation times until then.
          </p>
        )}
      </section>

      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Documents
        </h2>
        <ul className="dr-files">
          {d.documents.map((f) => (
            <li key={f.index} className="dr-file">
              <span className="dr-file-icon pdf">
                <FileText size={16} />
              </span>
              <div className="dr-file-body">
                <p className="dr-file-name">{f.fileName}</p>
                <p className="muted small" style={{ margin: 0 }}>
                  {CATEGORY[f.category] ?? f.category} · {format.bytes(f.fileSizeBytes)}
                </p>
              </div>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`View ${f.fileName}`}
                onClick={() => openFile(docPath(f.index))}
              >
                <Eye size={16} />
              </button>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`Download ${f.fileName}`}
                onClick={() => openFile(`${docPath(f.index)}?download=true`, f.fileName)}
              >
                <Download size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ReasonDialog
        open={dialog !== null}
        title={dialog === 'rejected' ? 'Reject registration' : 'Request more information'}
        description={
          dialog === 'rejected'
            ? 'The doctor sees this reason and can update and resubmit their registration.'
            : 'Tell the doctor exactly what to change or upload. They can update and resubmit.'
        }
        confirmLabel={dialog === 'rejected' ? 'Reject' : 'Send request'}
        danger={dialog === 'rejected'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await apiPost(`/api/admin/doctors/${doc.id}/review`, { outcome: dialog, reason })
          toast({
            title: dialog === 'rejected' ? 'Registration rejected.' : 'Request sent to the doctor.',
            tone: 'good',
          })
          setDialog(null)
          void detail.reload()
          refreshCounts()
        }}
      />
    </div>
  )
}

const wholeDollars = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
})

/** Workload, responsiveness, outcomes and every case the doctor was invited to. */
function PerformanceSection({ doctorId }: { doctorId: string }) {
  const perf = useApi<DoctorPerformance>(`/api/admin/doctors/${doctorId}/performance`)
  const format = useFormat()
  if (perf.error) return <ErrorState error={perf.error} onRetry={perf.reload} />
  if (!perf.data) return <Loading />
  const { stats: s, cases } = perf.data
  const tiles: [string, string | number, string?][] = [
    ['Active cases', s.activeCases, 'Accepted cases still in progress'],
    ['Invites waiting', s.pendingInvitations, 'Invitations not answered yet'],
    [
      'Accepts',
      pct(s.invitationAcceptancePct),
      `Of ${s.totalInvitations} invitations, accepted ÷ answered`,
    ],
    ['Avg. response', responseTime(s.avgResponseHours), 'Time from invitation to answer'],
    ['Plans sent', s.plansSubmitted],
    ['Plans chosen', pct(s.planChosenPct), 'Patients who chose this plan ÷ plans decided'],
    ['Patients treated', s.patientsTreated],
    [
      'Fees earned',
      wholeDollars.format(s.doctorFeesEarnedAud),
      'Doctor fees on plans patients have paid for',
    ],
  ]
  return (
    <section className="dr-card stack">
      <div className="row-between">
        <h2 className="dr-subtitle">Performance</h2>
        <span className="small muted">
          <Pill map={FEE_STATUS} value={s.feeStatus} />{' '}
          {s.annualFeeNextDueAt && `Membership renews ${formatDate(s.annualFeeNextDueAt)} · `}
          {wholeDollars.format(perf.data.membershipFeesPaidAud)} fees paid
          {s.lastActivityAt && ` · last active ${format.relative(s.lastActivityAt)}`}
        </span>
      </div>
      <div className="admin-perf">
        {tiles.map(([label, value, hint]) => (
          <div key={label} title={hint}>
            <p className="dr-fact-label">{label}</p>
            <p className="admin-perf-value">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="dr-subtitle small-title">Cases ({cases.length})</h3>
      {cases.length === 0 ? (
        <p className="muted">Not invited to any case yet.</p>
      ) : (
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Specialty</th>
                <th>Invited</th>
                <th>Doctor's answer</th>
                <th>Plan</th>
                <th>Case status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.caseId}>
                  <td className="strong">{c.referenceNumber ?? '—'}</td>
                  <td>{c.specialty ?? '—'}</td>
                  <td>{formatDate(c.invitedAt)}</td>
                  <td>
                    <Pill map={ASSIGNMENT_STATUS} value={c.assignmentStatus} />
                    {c.declineReason && <div className="muted small">{c.declineReason}</div>}
                    {c.consultationSkippedReason && (
                      <div className="muted small">
                        Skipped consultation: {c.consultationSkippedReason}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.planStatus ? (
                      <Pill map={PLAN_STATUS} value={c.planStatus} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{c.caseStatus ? <StatusBadge status={c.caseStatus} small /> : '—'}</td>
                  <td>
                    <Link className="button dr-view" to={`/admin/cases/${c.caseId}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const CATEGORY: Record<string, string> = {
  medical_license: 'Medical license',
  degree_certificate: 'Degree certificate',
  other: 'Other certificate',
}

export function Fact({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="dr-fact-label">{label}</p>
      <p className="dr-fact-value prewrap">
        {value === null || value === undefined || value === '' ? '—' : value}
      </p>
    </div>
  )
}

/** A required-reason confirmation (reject, request info, decline a plan). */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  minLength = 10,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  minLength?: number
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const tooShort = reason.trim().length < minLength
  return (
    <Modal open={open} onClose={() => !pending && onClose()} title={title}>
      <div className="stack">
        <p className="muted">{description}</p>
        <textarea
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {reason && tooShort && (
          <p className="field-error">Please write at least {minLength} characters.</p>
        )}
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'button-danger' : undefined}
            disabled={tooShort || pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                await onConfirm(reason.trim())
                setReason('')
              } catch (err) {
                setError(err)
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
