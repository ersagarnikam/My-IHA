import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Download, Eye, FileText } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Loading } from '../../components/ui'
import { ApiError, apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { BUCKETS, CREDENTIALS, DOCUMENT_LABELS, LAWYER_TYPES, type Bucket } from '../lawyer/types'
import type { AdminOutletContext } from './AdminLayout'
import { Fact, ReasonDialog } from './DoctorPages'
import { DOCTOR_STATUS, Pill } from './types'
import { VerificationCard, type Verifications } from './Verification'

type LawyerRow = {
  id: string
  name: string
  email: string | null
  lawyerType: string
  city: string | null
  credentialType: string | null
  status: 'pending' | 'approved' | 'rejected' | 'more_info_requested'
  createdAt: string
  activeCases: number
}

type LawyerDetail = {
  lawyer: LawyerRow
  abnNumber: string | null
  phone: string | null
  address: string | null
  zipCode: string | null
  experience: string | null
  credentialNumber: string | null
  practisingState: string | null
  credentialExpiresOn: string | null
  rejectionReason: string | null
  moreInfoMessage: string | null
  documents: {
    index: number
    fileName: string
    category: string
    mimeType: string
    fileSizeBytes: number
  }[]
}

type VisaCase = {
  caseId: string
  referenceNumber: string | null
  patientName: string | null
  country: string | null
  status: string
  lawyerId: string | null
  lawyerName: string | null
  updatedAt: string
}

type Tab = 'pending' | 'more_info_requested' | 'approved' | 'rejected' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'more_info_requested', label: 'More Info Requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

/** Visa lawyers who registered through the lawyer portal. */
export function AdminLawyersPage() {
  const list = useApi<LawyerRow[]>('/api/admin/lawyers')
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (l) =>
      (tab === 'all' || l.status === tab) &&
      (!q || l.name.toLowerCase().includes(q) || (l.email ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Lawyer Approvals</h1>
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
                <th>Lawyer</th>
                <th>Credential</th>
                <th>Location</th>
                <th>Registered</th>
                <th>Active cases</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="dr-empty-row">
                    No lawyers here.
                  </td>
                </tr>
              )}
              {paged.rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="strong">{l.name}</span>
                    <br />
                    <span className="muted small">
                      {LAWYER_TYPES[l.lawyerType] ?? l.lawyerType} · {l.email}
                    </span>
                  </td>
                  <td className="small">
                    {l.credentialType === 'marn'
                      ? 'MARN'
                      : l.credentialType
                        ? 'Practising certificate'
                        : '—'}
                  </td>
                  <td>{l.city ?? '—'}</td>
                  <td>{formatDate(l.createdAt)}</td>
                  <td>{l.activeCases}</td>
                  <td>
                    <Pill map={DOCTOR_STATUS} value={l.status} />
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/admin/lawyers/${l.id}`}>
                      {l.status === 'pending' ? 'Review' : 'View'}
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

export function AdminLawyerDetailPage() {
  const { lawyerId } = useParams()
  const format = useFormat()
  const toast = useToast()
  const detail = useApi<LawyerDetail>(`/api/admin/lawyers/${lawyerId}`)
  const checks = useApi<Verifications>(`/api/admin/verifications/lawyer/${lawyerId}`)
  const [dialog, setDialog] = useState<'rejected' | 'more_info_requested' | null>(null)
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const l = d.lawyer
  const docPath = (i: number) => `/api/admin/lawyers/${l.id}/documents/${i}`

  async function approve() {
    try {
      await apiPost(`/api/admin/lawyers/${l.id}/review`, { outcome: 'approved' })
      toast({ title: `${l.name} approved. You can now assign visa cases.`, tone: 'good' })
      void detail.reload()
      refreshCounts()
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not approve this registration.',
        tone: 'bad',
      })
    }
  }

  return (
    <div className="dr-page">
      <BackHeader to="/admin/lawyers" title={l.name} subtitle={l.email ?? undefined} />

      <section className="dr-card row-between">
        <div>
          <Pill map={DOCTOR_STATUS} value={l.status} />{' '}
          <span className="muted small">
            Registered {formatDate(l.createdAt)} · {l.activeCases} active visa cases
          </span>
        </div>
        {l.status === 'pending' && (
          <div className="dr-actions">
            <button
              type="button"
              onClick={approve}
              disabled={!checks.data?.allPassing}
              title={checks.data?.allPassing ? undefined : 'Record a passing register check first'}
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
          providerType="lawyer"
          providerId={l.id}
          data={checks.data}
          onChange={() => void checks.reload()}
        />
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Practice and registration</h2>
        <div className="dr-kv">
          <Fact label="Registered as" value={LAWYER_TYPES[l.lawyerType] ?? l.lawyerType} />
          <Fact
            label="Credential"
            value={l.credentialType ? CREDENTIALS[l.credentialType] : null}
          />
          <Fact
            label={l.credentialType === 'marn' ? 'MARN' : 'Certificate number'}
            value={d.credentialNumber}
          />
          {l.credentialType === 'practising_certificate' && (
            <Fact label="Issued in" value={d.practisingState} />
          )}
          <Fact label="Expires (declared)" value={formatDate(d.credentialExpiresOn)} />
          <Fact label="ABN" value={d.abnNumber} />
          <Fact label="Phone" value={d.phone} />
          <Fact
            label="Address"
            value={[d.address, l.city, d.zipCode].filter(Boolean).join(', ')}
            className="full"
          />
          <Fact label="Immigration law experience" value={d.experience} className="full" />
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
                  {DOCUMENT_LABELS[f.category] ?? f.category} · {format.bytes(f.fileSizeBytes)}
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
            ? 'The lawyer sees this reason and can update and resubmit their registration.'
            : 'Tell the lawyer exactly what to change or upload. They can update and resubmit.'
        }
        confirmLabel={dialog === 'rejected' ? 'Reject' : 'Send request'}
        danger={dialog === 'rejected'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await apiPost(`/api/admin/lawyers/${l.id}/review`, { outcome: dialog, reason })
          toast({
            title: dialog === 'rejected' ? 'Registration rejected.' : 'Request sent to the lawyer.',
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

const VISA_BUCKET: Record<string, Bucket> = {
  documents_submitted: 'new',
  under_review: 'under_review',
  additional_docs_requested: 'docs_pending',
  application_submitted: 'in_progress',
  processing: 'in_progress',
  approved: 'approved',
  rejected: 'rejected',
}

/** Submitted visa applications and who handles them; assign or reassign a lawyer. */
export function AdminVisaCasesPage() {
  const list = useApi<VisaCase[]>('/api/admin/visa-cases')
  const lawyers = useApi<LawyerRow[]>('/api/admin/lawyers')
  const toast = useToast()
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  const [pending, setPending] = useState<string | null>(null)
  const paged = usePaged(list.data ?? [])
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data || !lawyers.data) return <Loading />
  const approved = lawyers.data.filter((l) => l.status === 'approved')

  async function assign(caseId: string, lawyerId: string) {
    setPending(caseId)
    try {
      list.setData(
        await apiPost<VisaCase[]>(`/api/admin/visa-cases/${caseId}/lawyer`, { lawyerId }),
      )
      toast({ title: 'Lawyer assigned and notified.', tone: 'good' })
      refreshCounts()
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Could not assign.', tone: 'bad' })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Visa Cases</h1>
        <p className="muted">
          Visa applications patients have submitted. Assign each one to an approved visa lawyer; the
          lawyer is notified and takes it from there.
        </p>
      </div>
      <section className="dr-card">
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Visa lawyer</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="dr-empty-row">
                    No visa applications submitted yet.
                  </td>
                </tr>
              )}
              {paged.rows.map((v) => {
                const [label, tone] = BUCKETS[VISA_BUCKET[v.status] ?? 'new']
                return (
                  <tr key={v.caseId}>
                    <td className="strong">
                      <Link to={`/admin/cases/${v.caseId}`}>{v.referenceNumber}</Link>
                    </td>
                    <td>
                      {v.patientName ?? '—'}
                      {v.country && <div className="muted small">{v.country}</div>}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${tone}`}>{label}</span>
                    </td>
                    <td>{formatDate(v.updatedAt)}</td>
                    <td>
                      <select
                        aria-label={`Visa lawyer for ${v.referenceNumber}`}
                        value={v.lawyerId ?? ''}
                        disabled={pending === v.caseId}
                        onChange={(e) => e.target.value && void assign(v.caseId, e.target.value)}
                      >
                        <option value="">{v.lawyerId ? '' : 'Assign a lawyer…'}</option>
                        {approved.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.activeCases} active)
                          </option>
                        ))}
                      </select>
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
