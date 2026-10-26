import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Video } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { FormError, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { JoinZoom, SlotProposalForm } from './ConsultationPages'
import { formatSlot, zoneTimeLabel } from './shared'
import type { CaseDetail, DoctorConsultation } from './types'

/**
 * Step 2 of the case workflow: after reviewing the documents, the doctor talks
 * to the patient on Zoom before preparing the treatment plan. Submitting the
 * plan stays locked until it has taken place (or the doctor records why it
 * wasn't needed).
 */
export function InitialConsultationCard({
  detail,
  onChanged,
}: {
  detail: CaseDetail
  onChanged: () => void
}) {
  const info = detail.initialConsultation
  const a = detail.assignment
  if (!info || a.status !== 'accepted' || !a.evaluationStartedAt) return null
  if (info.state === 'none' && a.planSubmittedAt) return null

  return (
    <section className="dr-card stack" id="initial-consultation">
      <div className="row-between">
        <h2 className="dr-subtitle">
          <Video size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Initial Zoom Consultation
        </h2>
        <StateBadge state={info.state} />
      </div>
      {info.state === 'none' ? (
        <ProposeInitial caseId={detail.caseId} onChanged={onChanged} />
      ) : info.state === 'skipped' ? (
        <p className="muted" style={{ margin: 0 }}>
          You recorded that no consultation was needed: <em>{info.skippedReason}</em>
        </p>
      ) : (
        info.consultationId && (
          <Progress
            key={info.state}
            consultationId={info.consultationId}
            held={info.state === 'held'}
          />
        )
      )}
    </section>
  )
}

const STATE_LABELS: Record<string, [string, string]> = {
  none: ['Not booked', 'badge-warn'],
  slots_proposed: ['Waiting for patient', 'badge-info'],
  slot_selected: ['Awaiting payment', 'badge-info'],
  scheduled: ['Scheduled', 'badge-good'],
  held: ['Held', 'badge-good'],
  skipped: ['Skipped', 'badge-muted'],
}

function StateBadge({ state }: { state: string }) {
  const [label, tone] = STATE_LABELS[state] ?? [state, 'badge-muted']
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

function ProposeInitial({ caseId, onChanged }: { caseId: string; onChanged: () => void }) {
  const toast = useToast()
  const fees = useApi<{ consultationFeeAud: number }>('/api/fees')
  const [skipOpen, setSkipOpen] = useState(false)
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Before preparing the treatment plan, talk with the patient on Zoom about their condition,
        history and expectations. Offer up to three times; the patient chooses one and pays the{' '}
        {fees.data ? `AUD ${fees.data.consultationFeeAud.toLocaleString('en-AU')}` : ''}{' '}
        consultation fee, and the Zoom meeting is created automatically. You can submit the
        treatment plan once the consultation has taken place.
      </p>
      <SlotProposalForm
        title="Propose consultation times"
        description={`Times are in your time zone (${zoneTimeLabel()}).`}
        submitLabel="Send times to patient"
        onSubmit={async (rows) => {
          await apiPost<DoctorConsultation>(`/api/doctor/cases/${caseId}/initial-consultation`, {
            slots: rows,
          })
          toast({ title: 'Consultation times sent to the patient.', tone: 'good' })
          onChanged()
        }}
      />
      <button
        type="button"
        className="button-link small"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setSkipOpen(true)}
      >
        Not needed for this case? Skip with a reason
      </button>
      <SkipModal
        caseId={caseId}
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        onSkipped={onChanged}
      />
    </>
  )
}

function Progress({ consultationId, held }: { consultationId: string; held: boolean }) {
  const item = useApi<DoctorConsultation>(`/api/doctor/consultations/${consultationId}`)
  const c = item.data
  if (!c) return null
  const slot = c.slots.find((s) => s.id === c.selectedSlotId)
  return (
    <>
      {held ? (
        <p className="dr-banner info" style={{ margin: 0 }}>
          <CheckCircle2 size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Consultation held{slot ? ` on ${formatSlot(slot.slotTime, slot.slotEndTime)}` : ''}. You
          can now submit the treatment plan.
        </p>
      ) : c.status === 'scheduled' && slot ? (
        <>
          <p style={{ margin: 0 }}>
            Booked and paid: <strong>{formatSlot(slot.slotTime, slot.slotEndTime)}</strong>
          </p>
          <JoinZoom link={c.zoomLink} start={slot.slotTime} end={slot.slotEndTime} />
        </>
      ) : c.status === 'slot_selected' && slot ? (
        <p style={{ margin: 0 }}>
          The patient chose <strong>{formatSlot(slot.slotTime, slot.slotEndTime)}</strong> and is
          paying the consultation fee.
        </p>
      ) : (
        <>
          <p style={{ margin: 0 }}>Waiting for the patient to choose one of your times:</p>
          {c.slots.map((s) => (
            <div key={s.id} className="dr-slot">
              <span>{formatSlot(s.slotTime, s.slotEndTime)}</span>
            </div>
          ))}
        </>
      )}
      <Link
        className="button-secondary dash-small-button"
        style={{ alignSelf: 'flex-start' }}
        to={`/doctor/consultations/${c.id}`}
      >
        Open consultation
      </Link>
    </>
  )
}

function SkipModal({
  caseId,
  open,
  onClose,
  onSkipped,
}: {
  caseId: string
  open: boolean
  onClose: () => void
  onSkipped: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const tooShort = reason.trim().length < 10

  async function skip() {
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/doctor/cases/${caseId}/initial-consultation/skip`, { reason })
      toast({ title: 'Recorded. You can now submit the treatment plan.', tone: 'good' })
      onClose()
      onSkipped()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Skip the initial consultation">
      <div className="stack">
        <p className="muted">
          The initial consultation is an important step. Skip it only when it really isn't needed —
          for example, you already spoke with the patient, or the documents answer every question.
          MTA will see your reason.
        </p>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Why isn't a consultation needed?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {reason && tooShort && <p className="field-error">Please write at least 10 characters.</p>}
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={tooShort || pending}
            onClick={skip}
          >
            {pending ? 'Saving…' : 'Skip consultation'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
