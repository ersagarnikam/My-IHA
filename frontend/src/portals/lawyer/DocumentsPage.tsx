import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Eye, Upload } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Loading } from '../../components/ui'
import { ApiError, apiPost, openFile } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { formatDate, SearchBox, usePaged } from '../doctor/shared'
import type { CaseRow, DocView } from './types'

type ApprovedRow = { row: CaseRow; approvedVisa: DocView | null }

const MAX_BYTES = 10 * 1024 * 1024

/** Approved cases and the visa grant the lawyer uploads for the patient (old /documents). */
export function LawyerDocumentsPage() {
  const list = useApi<ApprovedRow[]>('/api/lawyer/approved-visas')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (r) =>
      !q ||
      (r.row.referenceNumber ?? '').toLowerCase().includes(q) ||
      (r.row.patientName ?? '').toLowerCase().includes(q),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Documents</h1>
        <p className="muted">
          Upload the visa grant for each approved case. The patient is notified and can download it
          from their Visa &amp; Travel section.
        </p>
      </div>
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search by case ID or patient" />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Patient</th>
                <th>Approved visa</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="dr-empty-row">
                    No approved cases yet. Cases appear here once you mark them Approved.
                  </td>
                </tr>
              )}
              {paged.rows.map((r) => (
                <tr key={r.row.caseId}>
                  <td className="strong">
                    <Link to={`/lawyer/cases/${r.row.caseId}`}>{r.row.referenceNumber}</Link>
                  </td>
                  <td>{r.row.patientName ?? '—'}</td>
                  <td>
                    {r.approvedVisa ? (
                      <>
                        <span className="badge badge-sm badge-good">Uploaded</span>{' '}
                        <span className="muted small">{formatDate(r.approvedVisa.uploadedAt)}</span>
                      </>
                    ) : (
                      <span className="badge badge-sm badge-warn">Not uploaded</span>
                    )}
                  </td>
                  <td>
                    <div className="dr-actions">
                      {r.approvedVisa && (
                        <button
                          type="button"
                          className="dr-icon-button"
                          aria-label="View approved visa"
                          onClick={() =>
                            openFile(
                              `/api/lawyer/cases/${r.row.caseId}/documents/${r.approvedVisa!.id}`,
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      <UploadButton
                        caseId={r.row.caseId}
                        replace={!!r.approvedVisa}
                        onDone={() => void list.reload()}
                      />
                    </div>
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

function UploadButton({
  caseId,
  replace,
  onDone,
}: {
  caseId: string
  replace: boolean
  onDone: () => void
}) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast({ title: 'Files must be 10 MB or smaller.', tone: 'bad' })
      return
    }
    const form = new FormData()
    form.set('file', file)
    setPending(true)
    try {
      await apiPost(`/api/lawyer/cases/${caseId}/approved-visa`, form)
      toast({ title: 'Approved visa sent to the patient.', tone: 'good' })
      onDone()
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Upload failed.', tone: 'bad' })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={replace ? 'button-secondary' : undefined}
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <Upload size={14} /> {pending ? 'Uploading…' : replace ? 'Replace' : 'Upload'}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.jpg,.jpeg,.png"
        data-case={caseId}
        onChange={(e) => {
          void upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
