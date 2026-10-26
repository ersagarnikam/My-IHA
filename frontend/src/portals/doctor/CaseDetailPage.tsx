import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Download, Eye, FileClock, FileImage, FileText, Globe2, Plus } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal } from '../../components/ui'
import { apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { DevDoctorPanel } from './DevPanel'
import { initial } from './DoctorLayout'
import { InitialConsultationCard } from './InitialConsultationCard'
import { BackHeader, providerToday, CaseBadge, formatDate } from './shared'
import { DOCUMENT_TYPE_LABELS, GENDER_LABELS, specialtyLabel, type CaseDetail } from './types'

const COMPLETABLE = ['payment_confirmed', 'visa_processing', 'travel_ready']

export function CaseDetailPage() {
  const { caseId } = useParams()
  const detail = useApi<CaseDetail>(`/api/doctor/cases/${caseId}`)

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const c = detail.data
  const a = c.assignment
  const canRequestDocuments = a.status === 'accepted' && c.caseStatus === 'evaluation'
  const pendingRequests = c.documentRequests.some((r) => r.status === 'pending')

  const dev: { label: string; path: string }[] = []
  if (pendingRequests)
    dev.push({
      label: 'Upload the requested documents (patient)',
      path: `/api/dev/doctor/cases/${c.caseId}/upload-requested`,
    })
  const initialId = c.initialConsultation?.consultationId
  if (initialId && c.initialConsultation?.state === 'slots_proposed')
    dev.push({
      label: 'Choose the first time and pay (patient)',
      path: `/api/dev/doctor/consultations/${initialId}/select-and-pay`,
    })
  if (initialId && c.initialConsultation?.state === 'scheduled')
    dev.push({
      label: 'Fast-forward: the consultation has taken place',
      path: `/api/dev/doctor/consultations/${initialId}/mark-held`,
    })
  if (c.planStatus === 'submitted_to_iha')
    dev.push({
      label: 'Approve plan and send it to the patient (admin)',
      path: `/api/dev/doctor/cases/${c.caseId}/publish-plan`,
    })
  if (
    c.planStatus === 'presented_to_patient' &&
    c.caseStatus === 'treatment_plan' &&
    !c.consultations.some((x) => x.kind === 'option')
  )
    dev.push({
      label: 'Request an online consultation (patient)',
      path: `/api/dev/doctor/cases/${c.caseId}/request-consultation`,
    })

  return (
    <div className="dr-page">
      <BackHeader to="/doctor/cases" title="Case Details" />

      <section className="dr-card row-between">
        <span className="muted">
          Case ID: <strong style={{ color: 'var(--text)' }}>{c.referenceNumber}</strong>
        </span>
        <CaseBadge assignment={a} caseStatus={c.caseStatus} planStatus={c.planStatus} />
      </section>

      {c.patient && (
        <section className="dr-card">
          <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
            Patient Info
          </h2>
          <div className="dr-person">
            <span className="avatar">{initial(c.patient.fullName)}</span>
            <strong>{c.patient.fullName}</strong>
          </div>
          <div className="dr-facts">
            <Fact label="Medical Condition" value={specialtyLabel(c)} />
            <Fact label="Date of Birth" value={formatDate(c.patient.dateOfBirth)} />
            <Fact
              label="Gender"
              value={c.patient.gender ? (GENDER_LABELS[c.patient.gender] ?? c.patient.gender) : '—'}
            />
            <Fact
              label={
                <>
                  <Globe2 size={12} /> Country
                </>
              }
              value={c.patient.countryOfResidence ?? '—'}
            />
          </div>
        </section>
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Case Summary</h2>
        <Fact label="Condition" value={specialtyLabel(c)} />
        <div>
          <p className="dr-fact-label">Symptoms:</p>
          <p className="prewrap muted" style={{ margin: '0.15rem 0 0' }}>
            {c.description}
          </p>
        </div>
      </section>

      {/* SENSITIVE: medical history is shown to the assigned doctor only; never log it. */}
      {c.patient &&
      (c.patient.medicalHistory ||
        c.patient.allergies?.length ||
        c.patient.currentMedications?.length) ? (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Medical History</h2>
          {c.patient.medicalHistory && (
            <p className="prewrap muted" style={{ margin: 0 }}>
              {c.patient.medicalHistory}
            </p>
          )}
          {!!c.patient.allergies?.length && (
            <Fact label="Allergies" value={c.patient.allergies.join(', ')} />
          )}
          {!!c.patient.currentMedications?.length && (
            <Fact label="Current Medications" value={c.patient.currentMedications.join(', ')} />
          )}
          {c.patient.pastSurgeries && (
            <Fact label="Past Surgeries" value={c.patient.pastSurgeries} />
          )}
        </section>
      ) : null}

      <section className="dr-card">
        <div className="dr-card-head">
          <h2 className="dr-subtitle">Uploaded Documents</h2>
          {canRequestDocuments && (
            <RequestDocumentsButton caseId={c.caseId} onSent={detail.reload} />
          )}
        </div>
        <DocumentList caseId={c.caseId} documents={c.documents} />
      </section>

      {c.documentRequests.length > 0 && (
        <section className="dr-card">
          <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
            Document Requests
          </h2>
          <ul className="dr-files">
            {c.documentRequests.map((r) => (
              <li key={r.id} className={`dr-file${r.status === 'pending' ? ' pending' : ''}`}>
                <span className={`dr-file-icon${r.status === 'pending' ? ' pending' : ''}`}>
                  <FileClock size={16} />
                </span>
                <div className="dr-file-body">
                  <p className="dr-file-name">
                    {DOCUMENT_TYPE_LABELS[r.documentType] ?? r.documentType}
                  </p>
                  <p className="muted small" style={{ margin: 0 }}>
                    Requested {formatDate(r.requestedAt)}
                    {r.receivedAt
                      ? ` · Received ${formatDate(r.receivedAt)}`
                      : r.message
                        ? ` — ${r.message}`
                        : ''}
                  </p>
                </div>
                <span
                  className={`badge badge-sm ${r.status === 'pending' ? 'badge-warn' : 'badge-good'}`}
                >
                  {r.status === 'pending' ? 'Pending' : 'Received'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InitialConsultationCard detail={c} onChanged={detail.reload} />

      {c.consultations.some((r) => r.kind === 'option') && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Follow-up Consultation</h2>
          <p className="muted small" style={{ margin: 0 }}>
            The patient asked to discuss your published treatment plan before choosing.
          </p>
          <div className="dr-actions">
            {c.consultations
              .filter((r) => r.kind === 'option')
              .map((r) => (
                <Link key={r.id} className="button" to={`/doctor/consultations/${r.id}`}>
                  View Consultation
                </Link>
              ))}
          </div>
        </section>
      )}

      <WorkflowActions detail={c} onChanged={detail.reload} />

      <DevDoctorPanel actions={dev} onChanged={detail.reload} />
    </div>
  )
}

function Fact({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="dr-fact-label">{label}</p>
      <p className="dr-fact-value">{value}</p>
    </div>
  )
}

function DocumentList({
  caseId,
  documents,
}: {
  caseId: string
  documents: CaseDetail['documents']
}) {
  const format = useFormat()
  const toast = useToast()
  if (documents.length === 0) return <p className="muted">No documents uploaded.</p>
  const path = (id: string) => `/api/doctor/cases/${caseId}/documents/${id}/content`
  const open = (id: string, download?: string) =>
    openFile(path(id) + (download ? '?download=true' : ''), download).catch(() =>
      toast({ title: 'Could not open the document.', tone: 'bad' }),
    )
  return (
    <ul className="dr-files">
      {documents.map((d) => {
        const pdf = d.mimeType === 'application/pdf'
        return (
          <li key={d.id} className="dr-file">
            <span className={`dr-file-icon${pdf ? ' pdf' : ''}`}>
              {pdf ? <FileText size={16} /> : <FileImage size={16} />}
            </span>
            <div className="dr-file-body">
              <p className="dr-file-name">{d.fileName}</p>
              <p className="muted small" style={{ margin: 0 }}>
                {format.bytes(d.fileSizeBytes)}
              </p>
            </div>
            <button
              type="button"
              className="dr-icon-button"
              aria-label={`View ${d.fileName}`}
              onClick={() => open(d.id)}
            >
              <Eye size={16} />
            </button>
            <button
              type="button"
              className="dr-icon-button"
              aria-label={`Download ${d.fileName}`}
              onClick={() => open(d.id, d.fileName)}
            >
              <Download size={16} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function RequestDocumentsButton({ caseId, onSent }: { caseId: string; onSent: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function close() {
    if (pending) return
    setOpen(false)
    setSelected([])
    setMessage('')
    setError(null)
    setLocalError(null)
  }

  async function send() {
    if (selected.length === 0 && message.trim().length < 10) {
      setLocalError('Select at least one document or describe what you need (min. 10 characters).')
      return
    }
    setLocalError(null)
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/doctor/cases/${caseId}/document-requests`, {
        documentTypes: selected,
        message,
      })
      toast({ title: 'The patient has been notified.', tone: 'good' })
      setPending(false)
      close()
      onSent()
    } catch (err) {
      setError(err)
      setPending(false)
    }
  }

  return (
    <>
      <button type="button" className="button-secondary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Request More Documents
      </button>
      <Modal open={open} onClose={close} title="Request Additional Documents">
        <div className="stack">
          <div>
            <p className="field-label" style={{ margin: '0 0 0.5rem' }}>
              Select Required Documents
            </p>
            <div className="dr-checks">
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([type, label]) => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={selected.includes(type)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(type) ? s.filter((x) => x !== type) : [...s, type],
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="field-label">
              Message <span className="muted small">(optional)</span>
            </span>
            <textarea
              rows={3}
              maxLength={900}
              placeholder="Type here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {localError && <p className="form-error">{localError}</p>}
          <FormError error={error} />
          <div className="row-end">
            <button type="button" className="button-secondary" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="button" onClick={send} disabled={pending}>
              {pending ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

/** Accept/decline an invite, then the manual steps of the case (old CaseAssignmentActions + CaseWorkflowActions). */
function WorkflowActions({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)
  const a = detail.assignment
  const planPath = `/doctor/cases/${detail.caseId}/treatment-plan`

  async function run(key: string, path: string, body: unknown, success: string) {
    setPending(key)
    setError(null)
    try {
      await apiPost(path, body)
      toast({ title: success, tone: 'good' })
      setDeclineOpen(false)
      setCompleteOpen(false)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setPending(null)
    }
  }

  const respond = (status: 'accepted' | 'declined') =>
    run(
      status,
      `/api/doctor/assignments/${a.id}/respond`,
      { status, declineReason: status === 'declined' ? reason : null },
      status === 'accepted' ? 'Case accepted.' : 'Case declined.',
    )

  const buttons: React.ReactNode[] = []
  if (a.status === 'invited') {
    buttons.push(
      <button key="accept" type="button" disabled={!!pending} onClick={() => respond('accepted')}>
        {pending === 'accepted' ? 'Accepting…' : 'Accept'}
      </button>,
      <button
        key="decline"
        type="button"
        className="button-danger"
        disabled={!!pending}
        onClick={() => setDeclineOpen(true)}
      >
        Decline
      </button>,
    )
  } else if (a.status === 'accepted') {
    const s = detail.caseStatus
    const canComplete =
      COMPLETABLE.includes(s) &&
      !!detail.treatmentEndDate &&
      detail.treatmentEndDate <= providerToday()
    if (!a.evaluationStartedAt && (s === 'doctor_assigned' || s === 'evaluation')) {
      buttons.push(
        <button
          key="start"
          type="button"
          disabled={!!pending}
          onClick={() =>
            run(
              'start',
              `/api/doctor/cases/${detail.caseId}/start-evaluation`,
              undefined,
              'Evaluation started.',
            )
          }
        >
          {pending === 'start' ? 'Starting…' : 'Start Evaluation'}
        </button>,
      )
    } else if (a.evaluationStartedAt && s === 'evaluation') {
      buttons.push(
        a.planSubmittedAt ? (
          <Link key="plan" className="button button-secondary" to={planPath}>
            Treatment Plan Sent — View
          </Link>
        ) : (
          <button key="plan" type="button" onClick={() => navigate(planPath)}>
            Build Treatment Plan
          </button>
        ),
      )
    } else {
      if (a.planSubmittedAt)
        buttons.push(
          <Link key="plan" className="button button-secondary" to={planPath}>
            View Treatment Plan
          </Link>,
        )
      if (canComplete)
        buttons.push(
          <button key="complete" type="button" onClick={() => setCompleteOpen(true)}>
            Mark as Completed
          </button>,
        )
    }
  }

  if (buttons.length === 0 && !error) return null
  return (
    <>
      <div className="dr-actions">{buttons}</div>
      <FormError error={error} />

      <Modal
        open={declineOpen}
        onClose={() => !pending && setDeclineOpen(false)}
        title="Decline this case"
      >
        <div className="stack">
          <p className="muted">
            You can optionally let MTA Admin know why — this helps them route the case elsewhere.
          </p>
          <textarea
            rows={4}
            maxLength={500}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row-end">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setDeclineOpen(false)}
              disabled={!!pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={!!pending}
              onClick={() => respond('declined')}
            >
              {pending === 'declined' ? 'Declining…' : 'Decline Case'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={completeOpen}
        onClose={() => !pending && setCompleteOpen(false)}
        title="Mark case as completed"
      >
        <div className="stack">
          <p className="muted">
            Confirm the patient has undergone treatment. This updates the case status to Completed
            and notifies the patient — it can't be undone.
          </p>
          <div className="row-end">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setCompleteOpen(false)}
              disabled={!!pending}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!pending}
              onClick={() =>
                run(
                  'complete',
                  `/api/doctor/cases/${detail.caseId}/complete`,
                  undefined,
                  'Case marked as completed.',
                )
              }
            >
              {pending === 'complete' ? 'Saving…' : 'Mark as Completed'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
