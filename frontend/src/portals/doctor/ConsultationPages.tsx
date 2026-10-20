import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Plus, Trash2, Video } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { DevDoctorPanel } from './DevPanel'
import {
  BackHeader,
  brisbaneToday,
  ConsultationBadge,
  formatDate,
  formatSlot,
  PillTabs,
  SearchBox,
  usePaged,
} from './shared'
import { consultationStage, type DoctorConsultation } from './types'

type Tab = 'all' | 'requested' | 'slots_proposed' | 'scheduled' | 'completed' | 'cancelled'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'requested', label: 'Awaiting Slots' },
  { id: 'slots_proposed', label: 'Awaiting Patient Confirmation' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export function ConsultationsPage() {
  const list = useApi<DoctorConsultation[]>('/api/doctor/consultations')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = (list.data ?? []).filter((c) => {
    const stage = consultationStage(c)
    const inTab =
      tab === 'all' ||
      stage === tab ||
      // A chosen-but-unpaid slot is still waiting on the patient.
      (tab === 'slots_proposed' && stage === 'slot_selected')
    return (
      inTab &&
      (!q || (c.caseReference ?? '').toLowerCase().includes(q) || (c.patientName ?? '').toLowerCase().includes(q))
    )
  })
  const paged = usePaged(filtered)

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Consultations</h1>
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
            placeholder="Search by patient name or case ID"
            onChange={(v) => {
              setQuery(v)
              paged.reset()
            }}
          />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Case ID</th>
                <th>Procedure</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="dr-empty-row">
                    No consultations found.
                  </td>
                </tr>
              )}
              {paged.rows.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.patientName}</td>
                  <td>
                    <Link className="link" to={`/doctor/cases/${c.caseId}`}>
                      {c.caseReference}
                    </Link>
                  </td>
                  <td>{c.procedureName ?? '—'}</td>
                  <td>{formatDate(c.requestedAt)}</td>
                  <td>
                    <ConsultationBadge consultation={c} />
                  </td>
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
        {paged.footer}
      </section>
    </div>
  )
}

export function ConsultationDetailPage() {
  const { requestId } = useParams()
  const item = useApi<DoctorConsultation>(`/api/doctor/consultations/${requestId}`)
  if (item.error) return <ErrorState error={item.error} onRetry={item.reload} />
  if (!item.data) return <Loading />
  const c = item.data
  const selected = c.slots.find((s) => s.id === c.selectedSlotId)
  const canPropose = c.status === 'requested' || c.status === 'slots_proposed'
  const canCancel = c.status !== 'cancelled' && c.status !== 'scheduled'

  const dev: { label: string; path: string }[] = []
  if (c.status === 'slots_proposed')
    dev.push({
      label: 'Choose the first time and pay (patient)',
      path: `/api/dev/doctor/consultations/${c.id}/select-and-pay`,
    })

  return (
    <div className="dr-page">
      <BackHeader to="/doctor/consultations" title="Consultation Request" />

      <section className="dr-card row-between">
        <div>
          <p style={{ margin: 0 }}>
            <span className="muted">Case: </span>
            <Link className="link" to={`/doctor/cases/${c.caseId}`} style={{ fontWeight: 600 }}>
              {c.caseReference}
            </Link>
          </p>
          <p style={{ margin: 0 }}>
            <span className="muted">Patient: </span>
            <strong>{c.patientName}</strong>
          </p>
          {c.procedureName && (
            <p style={{ margin: 0 }}>
              <span className="muted">Procedure: </span>
              {c.procedureName}
            </p>
          )}
        </div>
        <ConsultationBadge consultation={c} />
      </section>

      {c.status === 'cancelled' && c.cancellationReason && (
        <div className="dr-banner bad">This consultation was cancelled. Reason: {c.cancellationReason}</div>
      )}

      {c.slots.length > 0 && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Proposed Times</h2>
          {c.slots.map((s) => (
            <div key={s.id} className={`dr-slot${s.id === c.selectedSlotId ? ' selected' : ''}`}>
              <span>{formatSlot(s.slotTime, s.slotEndTime)}</span>
              {s.id === c.selectedSlotId && <span className="dr-slot-tag">PATIENT SELECTED</span>}
            </div>
          ))}
        </section>
      )}

      {c.status === 'scheduled' && selected && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Scheduled Meeting</h2>
          <p style={{ margin: 0 }}>{formatSlot(selected.slotTime, selected.slotEndTime)}</p>
          <JoinZoom link={c.zoomLink} start={selected.slotTime} end={selected.slotEndTime} />
        </section>
      )}

      {canPropose && <ProposeSlots consultation={c} onSaved={item.setData} />}

      {canCancel && <CancelConsultation consultation={c} onCancelled={item.setData} />}

      <DevDoctorPanel actions={dev} onChanged={item.reload} />
    </div>
  )
}

/** Live 15 minutes before the start until the end (same window as the patient's button). */
function JoinZoom({ link, start, end }: { link: string | null; start: string; end: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const opens = new Date(start).getTime() - 15 * 60_000
  if (now > new Date(end).getTime()) return <p className="muted small">This consultation has ended.</p>
  if (!link) return <p className="muted small">The meeting link will be added by MTA shortly.</p>
  if (now < opens)
    return (
      <div className="stack" style={{ gap: '0.35rem' }}>
        <button type="button" className="button-secondary" disabled style={{ alignSelf: 'flex-start' }}>
          <Video size={14} /> Join Zoom
        </button>
        <p className="muted small" style={{ margin: 0 }}>
          The join link becomes available 15 minutes before the scheduled time.
        </p>
      </div>
    )
  return (
    <a className="button" href={link} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start' }}>
      <Video size={14} /> Join Zoom
    </a>
  )
}

type SlotRow = { date: string; startTime: string; endTime: string }

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 ? '30' : '00'
  const value = `${String(h).padStart(2, '0')}:${m}`
  const label = `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
  return { value, label }
})

function ProposeSlots({
  consultation,
  onSaved,
}: {
  consultation: DoctorConsultation
  onSaved: (c: DoctorConsultation) => void
}) {
  const toast = useToast()
  const updating = consultation.status === 'slots_proposed'
  const [rows, setRows] = useState<SlotRow[]>([{ date: '', startTime: '10:00', endTime: '10:30' }])
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const today = brisbaneToday()
  const maxDate = consultation.treatmentStartDate ?? undefined

  async function send() {
    setPending(true)
    setError(null)
    try {
      const saved = await apiPost<DoctorConsultation>(`/api/doctor/consultations/${consultation.id}/slots`, {
        slots: rows,
      })
      toast({ title: updating ? 'Updated the proposed times.' : 'Proposed times sent to the patient.', tone: 'good' })
      setRows([{ date: '', startTime: '10:00', endTime: '10:30' }])
      onSaved(saved)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  const update = (i: number, patch: Partial<SlotRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">{updating ? 'Update Proposed Times' : 'Propose Consultation Times'}</h2>
        <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
          Offer up to three times (Brisbane Time). The patient picks one and pays the consultation fee.
          {maxDate && ` Times must be on or before the treatment start date (${formatDate(maxDate)}).`}
        </p>
      </div>
      <div className="dr-slot-rows">
        {rows.map((row, i) => (
          <div key={i} className="dr-slot-row">
            <label className="field">
              <span className="field-label small">Date</span>
              <input
                type="date"
                min={today}
                max={maxDate}
                value={row.date}
                onChange={(e) => update(i, { date: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label small">Start</span>
              <select value={row.startTime} onChange={(e) => update(i, { startTime: e.target.value })}>
                {TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label small">End</span>
              <select value={row.endTime} onChange={(e) => update(i, { endTime: e.target.value })}>
                {TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="dr-icon-button"
              aria-label="Remove time"
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {rows.length < 3 && (
        <button
          type="button"
          className="button-secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setRows((r) => [...r, { date: '', startTime: '10:00', endTime: '10:30' }])}
        >
          <Plus size={14} /> Add Time
        </button>
      )}
      <FormError error={error} />
      <div className="row-end">
        <button type="button" disabled={pending || rows.some((r) => !r.date)} onClick={send}>
          {pending ? 'Sending…' : updating ? 'Update Times' : 'Send to Patient'}
        </button>
      </div>
    </section>
  )
}

function CancelConsultation({
  consultation,
  onCancelled,
}: {
  consultation: DoctorConsultation
  onCancelled: (c: DoctorConsultation) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const tooShort = reason.trim().length < 5

  async function cancel() {
    setPending(true)
    setError(null)
    try {
      const saved = await apiPost<DoctorConsultation>(`/api/doctor/consultations/${consultation.id}/cancel`, {
        reason,
      })
      toast({ title: 'Consultation cancelled. The patient has been notified.', tone: 'good' })
      setOpen(false)
      onCancelled(saved)
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div>
        <button type="button" className="button-danger" onClick={() => setOpen(true)}>
          Cancel Consultation
        </button>
      </div>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title="Cancel Consultation">
        <div className="stack">
          <p className="muted">The patient will be told the consultation was cancelled, with your reason.</p>
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Reason for cancelling"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {reason && tooShort && (
            <p className="field-error">Please provide a brief reason for cancelling (min. 5 characters).</p>
          )}
          <FormError error={error} />
          <div className="row-end">
            <button type="button" className="button-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Keep Consultation
            </button>
            <button type="button" className="button-danger" disabled={tooShort || pending} onClick={cancel}>
              {pending ? 'Cancelling…' : 'Cancel Consultation'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
