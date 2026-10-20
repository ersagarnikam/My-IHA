import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Download, Eye, FileText } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal } from '../../components/ui'
import { apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import type { AdminOutletContext } from './AdminLayout'
import { DOCTOR_STATUS, Pill, type DoctorDetail, type DoctorRow } from './types'

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
                  <td className="small">{d.registrationFeePaidAt ? 'Paid' : d.status === 'approved' ? 'Awaiting payment' : '—'}</td>
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
      toast({ title: `${doc.fullName} approved. They'll be asked to pay the registration fee.`, tone: 'good' })
      void detail.reload()
      refreshCounts()
    } catch {
      toast({ title: 'Could not approve this registration.', tone: 'bad' })
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
            <span className="muted small"> · Registration fee paid {formatDate(doc.registrationFeePaidAt)}</span>
          )}
        </div>
        {reviewable && (
          <div className="dr-actions">
            <button type="button" onClick={approve}>
              Approve
            </button>
            <button type="button" className="button-secondary" onClick={() => setDialog('more_info_requested')}>
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
          {d.rejectionReason ? `Rejected: ${d.rejectionReason}` : `More information requested: ${d.moreInfoMessage}`}
        </div>
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Professional details</h2>
        <div className="dr-kv">
          <Fact label="Specialties" value={doc.specialties.join(', ')} />
          <Fact label="Qualifications" value={d.qualifications} />
          <Fact label="Experience" value={d.yearsOfExperience != null ? `${d.yearsOfExperience} years` : null} />
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
              <button type="button" className="dr-icon-button" aria-label={`View ${f.fileName}`} onClick={() => openFile(docPath(f.index))}>
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
          toast({ title: dialog === 'rejected' ? 'Registration rejected.' : 'Request sent to the doctor.', tone: 'good' })
          setDialog(null)
          void detail.reload()
          refreshCounts()
        }}
      />
    </div>
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

export function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="dr-fact-label">{label}</p>
      <p className="dr-fact-value prewrap">{value === null || value === undefined || value === '' ? '—' : value}</p>
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
        <textarea rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        {reason && tooShort && <p className="field-error">Please write at least {minLength} characters.</p>}
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
