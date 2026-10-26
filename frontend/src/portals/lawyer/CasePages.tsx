import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ChevronDown, Download, Eye, FileText, StickyNote } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal } from '../../components/ui'
import { apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { KV } from '../doctor/settings/AccountSettingsPage'
import {
  BUCKETS,
  REQUESTABLE,
  STATUS_ACTIONS,
  type Bucket,
  type CaseDetail,
  type CaseRow,
} from './types'

type Tab = 'all' | 'new' | 'active' | 'docs_pending' | 'approved' | 'rejected'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'active', label: 'In Progress' },
  { id: 'docs_pending', label: 'Docs Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

const ACTIVE: Bucket[] = ['under_review', 'docs_pending', 'in_progress']

export function BucketPill({ bucket }: { bucket: Bucket }) {
  const [label, tone] = BUCKETS[bucket] ?? [bucket, 'badge-muted']
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

/** The visa applications MTA assigned to this lawyer (old /visa-cases). */
export function LawyerCasesPage() {
  const list = useApi<CaseRow[]>('/api/lawyer/cases')
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'all') as Tab
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (r) =>
      (tab === 'all' || (tab === 'active' ? ACTIVE.includes(r.bucket) : r.bucket === tab)) &&
      (!q ||
        (r.referenceNumber ?? '').toLowerCase().includes(q) ||
        (r.patientName ?? '').toLowerCase().includes(q) ||
        (r.country ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Visa Cases</h1>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setParams(t === 'all' ? {} : { tab: t }, { replace: true })
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by case ID, patient or country"
          />
        </div>
        <CaseTable rows={paged.rows} empty="No visa cases here." />
        {paged.footer}
      </section>
    </div>
  )
}

export function CaseTable({ rows, empty }: { rows: CaseRow[]; empty: string }) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient</th>
            <th>Country</th>
            <th>Submitted</th>
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
          {rows.map((r) => (
            <tr key={r.caseId}>
              <td className="strong">{r.referenceNumber}</td>
              <td>{r.patientName ?? '—'}</td>
              <td>{r.country ?? '—'}</td>
              <td>{formatDate(r.createdAt)}</td>
              <td>
                <BucketPill bucket={r.bucket} />
              </td>
              <td>
                <Link className="button dr-view" to={`/lawyer/cases/${r.caseId}`}>
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

// ── Case detail ─────────────────────────────────────────────────────────

/** The patient's visa form, grouped like the patient's wizard (snake_case keys from the API). */
const FORM_SECTIONS: {
  title: string
  keys: string[]
  when?: (f: Record<string, string | null>) => boolean
}[] = [
  {
    title: 'Traveller details',
    keys: [
      'first_name',
      'last_name',
      'gender',
      'nationality',
      'date_of_birth',
      'passport_number',
      'passport_expiry',
      'email',
      'phone',
    ],
  },
  {
    title: 'Medical information',
    keys: [
      'condition_summary',
      'has_medical_conditions',
      'medical_conditions_details',
      'health_examination_completed',
    ],
  },
  {
    title: 'Australian medical provider',
    keys: [
      'australian_provider_details',
      'provider_name',
      'provider_organization',
      'provider_address',
      'provider_contact',
    ],
  },
  {
    title: 'Financial capacity',
    keys: [
      'source_of_funds',
      'bank_balance',
      'sponsor_name',
      'sponsor_relationship',
      'sponsor_contact',
    ],
  },
  {
    title: 'Travel plans',
    keys: ['arrival_date', 'departure_date', 'purpose_of_visit', 'flight_booking', 'accommodation'],
  },
  {
    title: 'Character and visa history',
    keys: [
      'criminal_record',
      'criminal_record_details',
      'previous_visa_issues',
      'previous_visa_issues_details',
    ],
  },
  {
    title: 'Companion',
    keys: [
      'travelling_with_companion',
      'companion_name',
      'companion_relationship',
      'companion_passport_number',
      'companion_passport_expiry',
    ],
    when: (f) => f.travelling_with_companion === 'Yes',
  },
]

function humanize(key: string) {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function LawyerCaseDetailPage() {
  const { caseId } = useParams()
  const detail = useApi<CaseDetail>(`/api/lawyer/cases/${caseId}`)
  const [statusOpen, setStatusOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const openRequests = d.requests.filter((r) => r.open)
  const docPath = (id: string) => `/api/lawyer/cases/${caseId}/documents/${id}`

  return (
    <div className="dr-page">
      <BackHeader
        to="/lawyer/cases"
        title={d.row.referenceNumber ?? 'Visa case'}
        subtitle={d.patient.fullName}
      />

      <section className="dr-card row-between lw-status-bar">
        <div>
          <BucketPill bucket={d.row.bucket} />{' '}
          <span className="muted small">
            Submitted {formatDate(d.row.createdAt)} · updated {formatDate(d.row.updatedAt)}
          </span>
        </div>
        {d.nextStatuses.length > 0 && (
          <button type="button" onClick={() => setStatusOpen(true)}>
            Update Status
          </button>
        )}
      </section>

      {d.row.bucket === 'new' && (
        <div className="dr-banner info">
          Move the case to <strong>Under Review</strong> to start; you can then request documents
          from the patient.
        </div>
      )}
      {d.rejectionReason && (
        <div className="dr-banner bad">
          <strong>Rejection reason:</strong> {d.rejectionReason}
        </div>
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Patient Details</h2>
        <div className="dr-kv">
          <KV label="Full name" value={d.patient.fullName} />
          <KV label="Date of birth" value={formatDate(d.patient.dateOfBirth)} />
          <KV label="Gender" value={d.patient.gender ? humanize(d.patient.gender) : null} />
          <KV label="Nationality" value={d.patient.nationality} />
          <KV label="Country of residence" value={d.patient.countryOfResidence} />
        </div>
      </section>

      {d.plan && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Treatment Plan</h2>
          <div className="dr-kv">
            <KV label="Hospital" value={d.plan.hospitalName} />
            <KV label="Doctor" value={d.plan.doctorName} />
            <KV label="Specialty" value={d.plan.specialty} />
            <KV label="Procedure" value={d.plan.procedureName} />
            <KV label="Treatment starts" value={formatDate(d.plan.treatmentStartDate)} />
            <KV label="Treatment ends" value={formatDate(d.plan.treatmentEndDate)} />
            <KV label="Estimated stay" value={d.plan.estimatedLengthOfStay} />
          </div>
        </section>
      )}

      {d.form && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Visa Application (Subclass 602)</h2>
          {FORM_SECTIONS.filter((s) => !s.when || s.when(d.form!)).map((s, i) => (
            <Collapsible key={s.title} title={s.title} defaultOpen={i === 0}>
              <div className="dr-kv">
                {s.keys
                  .filter((k) => d.form![k] != null && d.form![k] !== '')
                  .map((k) => (
                    <KV key={k} label={humanize(k)} value={d.form![k]} />
                  ))}
              </div>
            </Collapsible>
          ))}
        </section>
      )}

      <section className="dr-card stack">
        <div className="row-between">
          <h2 className="dr-subtitle">Documents</h2>
          {d.canRequestDocuments && (
            <button type="button" className="button-secondary" onClick={() => setRequestOpen(true)}>
              Request Document
            </button>
          )}
        </div>
        {!d.canRequestDocuments && d.row.bucket === 'new' && (
          <p className="muted small" style={{ margin: 0 }}>
            Move the case to Under Review to request documents.
          </p>
        )}
        <DocumentList docs={d.documents} path={docPath} />
        {openRequests.length > 0 && (
          <>
            <h3 className="lw-subhead">Requested from the patient</h3>
            <ul className="dr-files">
              {openRequests.map((r) => (
                <li key={r.id} className="dr-file">
                  <span className="dr-file-icon">
                    <FileText size={16} />
                  </span>
                  <div className="dr-file-body">
                    <p className="dr-file-name">
                      {r.label} — {r.documentType}
                    </p>
                    <p className="muted small" style={{ margin: 0 }}>
                      Requested {formatDate(r.createdAt)}
                      {r.instructions && ` · ${r.instructions}`}
                    </p>
                  </div>
                  <span className="badge badge-sm badge-warn">Requested</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <NotesCard caseId={caseId!} notes={d.notes} onAdded={() => void detail.reload()} />

      <StatusDialog
        open={statusOpen}
        caseId={caseId!}
        options={d.nextStatuses}
        onClose={() => setStatusOpen(false)}
        onDone={(next) => {
          setStatusOpen(false)
          detail.setData(next)
        }}
      />
      <RequestDialog
        open={requestOpen}
        caseId={caseId!}
        onClose={() => setRequestOpen(false)}
        onDone={(next) => {
          setRequestOpen(false)
          detail.setData(next)
        }}
      />
    </div>
  )
}

function Collapsible({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="lw-collapsible">
      <button
        type="button"
        className="lw-collapsible-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        <ChevronDown size={16} className={open ? 'lw-rotated' : undefined} />
      </button>
      {open && <div className="lw-collapsible-body">{children}</div>}
    </div>
  )
}

export function DocumentList({
  docs,
  path,
}: {
  docs: CaseDetail['documents']
  path: (id: string) => string
}) {
  const format = useFormat()
  if (docs.length === 0) return <p className="muted">No documents yet.</p>
  return (
    <ul className="dr-files">
      {docs.map((f) => (
        <li key={f.id} className="dr-file">
          <span className="dr-file-icon pdf">
            <FileText size={16} />
          </span>
          <div className="dr-file-body">
            <p className="dr-file-name">{f.label}</p>
            <p className="muted small" style={{ margin: 0 }}>
              {f.source === 'hospital_generated'
                ? 'From the hospital'
                : f.source === 'lawyer_issued'
                  ? 'Issued by you'
                  : 'From the patient'}
              {f.requestedByLawyer && ' (requested)'} · {formatDate(f.uploadedAt)} ·{' '}
              {format.bytes(f.fileSizeBytes)}
            </p>
          </div>
          <button
            type="button"
            className="dr-icon-button"
            aria-label={`View ${f.label}`}
            onClick={() => openFile(path(f.id))}
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            className="dr-icon-button"
            aria-label={`Download ${f.label}`}
            onClick={() => openFile(`${path(f.id)}?download=true`, f.fileName)}
          >
            <Download size={16} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function NotesCard({
  caseId,
  notes,
  onAdded,
}: {
  caseId: string
  notes: CaseDetail['notes']
  onAdded: () => void
}) {
  const format = useFormat()
  const [body, setBody] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function add() {
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/lawyer/cases/${caseId}/notes`, { body })
      setBody('')
      onAdded()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">
          <StickyNote size={16} /> Case Notes
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          Only visible to you. The patient never sees these.
        </p>
      </div>
      <textarea
        rows={3}
        maxLength={5000}
        value={body}
        placeholder="Add a note…"
        onChange={(e) => setBody(e.target.value)}
      />
      <FormError error={error} />
      <div className="row-end">
        <button type="button" disabled={pending || !body.trim()} onClick={add}>
          {pending ? 'Saving…' : 'Add Note'}
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="lw-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <p className="prewrap" style={{ margin: 0 }}>
                {n.body}
              </p>
              <p className="muted small" style={{ margin: 0 }}>
                {format.dateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatusDialog({
  open,
  caseId,
  options,
  onClose,
  onDone,
}: {
  open: boolean
  caseId: string
  options: string[]
  onClose: () => void
  onDone: (detail: CaseDetail) => void
}) {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function save() {
    setPending(true)
    setError(null)
    try {
      const next = await apiPost<CaseDetail>(`/api/lawyer/cases/${caseId}/status`, {
        status,
        rejectionReason: status === 'rejected' ? reason : null,
      })
      toast({ title: `Status updated to ${STATUS_ACTIONS[status] ?? status}.`, tone: 'good' })
      setStatus('')
      setReason('')
      onDone(next)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Update visa status">
      <div className="stack">
        <p className="muted">The patient is notified of every change.</p>
        <label className="field">
          <span className="field-label">New status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {STATUS_ACTIONS[o] ?? o}
              </option>
            ))}
          </select>
        </label>
        {status === 'rejected' && (
          <label className="field">
            <span className="field-label">Rejection reason</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The patient, doctor and hospital see this reason."
            />
          </label>
        )}
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={status === 'rejected' ? 'button-danger' : undefined}
            disabled={pending || !status || (status === 'rejected' && !reason.trim())}
            onClick={save}
          >
            {pending ? 'Saving…' : 'Update Status'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function RequestDialog({
  open,
  caseId,
  onClose,
  onDone,
}: {
  open: boolean
  caseId: string
  onClose: () => void
  onDone: (detail: CaseDetail) => void
}) {
  const toast = useToast()
  const [category, setCategory] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function send() {
    setPending(true)
    setError(null)
    try {
      const next = await apiPost<CaseDetail>(`/api/lawyer/cases/${caseId}/document-requests`, {
        category,
        documentType,
        instructions: instructions.trim() || null,
      })
      toast({ title: 'Request sent to the patient.', tone: 'good' })
      setCategory('')
      setDocumentType('')
      setInstructions('')
      onDone(next)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Request a document">
      <div className="stack">
        <p className="muted">
          The patient is notified and the case moves to Docs Pending until they upload it.
        </p>
        <label className="field">
          <span className="field-label">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {Object.entries(REQUESTABLE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">What exactly do you need?</span>
          <input
            value={documentType}
            maxLength={200}
            placeholder="e.g. Last three months of statements"
            onChange={(e) => setDocumentType(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Instructions (optional)</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !category || !documentType.trim()}
            onClick={send}
          >
            {pending ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
