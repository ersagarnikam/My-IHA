import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useToast } from '../../../components/Toasts'
import { Badge, FormError, Modal } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { apiPost } from '../../../lib/api'
import { useFormat } from '../../../lib/format'
import type { Consultation, TreatmentOption } from '../../../lib/types'
import { SlotTimes } from '../payments/PaymentPages'

const CONSULT_TONE = {
  requested: 'info',
  slots_proposed: 'warn',
  slot_selected: 'accent',
  scheduled: 'good',
  cancelled: 'bad',
} as const

export function TreatmentOptionCard({
  option,
  consultation,
  locked,
  onOpen,
}: {
  option: TreatmentOption
  consultation?: Consultation
  locked: boolean
  onOpen: () => void
}) {
  const t = useT('treatments')
  const format = useFormat()
  return (
    <article className={`card option-card${option.selected ? ' selected' : ''}`}>
      <div className="row-between">
        <div>
          <h3>{option.hospital?.name}</h3>
          <p className="muted small">
            {option.hospital?.city}, {option.hospital?.country}
          </p>
        </div>
        {option.selected && <Badge tone="good">{t('selected')}</Badge>}
      </div>
      {option.doctor && <p className="small">Dr. {option.doctor.fullName}</p>}
      {consultation && (
        <Badge tone={CONSULT_TONE[consultation.status]}>
          {t(`consultationStatus.${consultation.status}`)}
        </Badge>
      )}
      <p className="clamp-3">{option.treatmentSummary}</p>
      <div className="row-between">
        <span>
          <span className="muted small">{t('total')} </span>
          <strong>{format.money(option.costBreakdown.total)}</strong>
        </span>
        <button type="button" className="button-secondary" onClick={onOpen} disabled={locked}>
          {t('viewDetails')}
        </button>
      </div>
    </article>
  )
}

/** Full option detail, consultation panel, and "select this option" with confirmation. */
export function TreatmentDetailModal({
  option,
  consultation,
  caseStatus,
  anotherSelected,
  specialtyName,
  onClose,
  onChanged,
}: {
  option: TreatmentOption | null
  consultation?: Consultation
  caseStatus: string
  anotherSelected: boolean
  specialtyName: string
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT('treatmentDetail')
  const format = useFormat()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!option) return null

  async function select() {
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/patient/treatment-options/${option!.id}/select`)
      toast({ title: t('successToast'), tone: 'good' })
      onChanged()
      navigate(`/patient/cases/${option!.caseId}/payment`)
    } catch (err) {
      setError(err)
      setPending(false)
    }
  }

  const canSelect = caseStatus === 'treatment_plan' && !option.selected && !anotherSelected

  return (
    <Modal open onClose={onClose} title={t('modalTitle')} wide>
      <div className="stack">
        <div className="grid-2">
          {option.doctor && (
            <section className="panel">
              <h3>{t('doctor')}</h3>
              <p>
                <strong>Dr. {option.doctor.fullName}</strong>
              </p>
              {option.doctor.qualifications && (
                <p className="small muted">{option.doctor.qualifications}</p>
              )}
              {option.doctor.yearsExperience != null && (
                <p className="small">
                  {option.doctor.yearsExperience} {t('yearsOfExperience')}
                </p>
              )}
              {option.doctor.specialties.length > 0 && (
                <p className="small muted">{option.doctor.specialties.join(', ')}</p>
              )}
            </section>
          )}
          {option.hospital && (
            <section className="panel">
              <h3>{t('hospital')}</h3>
              <p>
                <strong>{option.hospital.name}</strong>
              </p>
              <p className="small muted">
                {option.hospital.city}, {option.hospital.country}
              </p>
              {option.hospital.bedCount != null && (
                <p className="small">
                  {option.hospital.bedCount} {t('beds')}
                </p>
              )}
              <DetailLine label={t('department')} value={option.department} />
              <DetailLine label={t('roomCategory')} value={option.roomCategory} />
            </section>
          )}
        </div>

        <section className="panel">
          <h3>{t('treatmentOverview')}</h3>
          <DetailLine label={t('diagnosis')} value={option.diagnosis} />
          <DetailLine
            label={t('treatmentType')}
            value={option.treatmentType && t(`treatmentTypes.${option.treatmentType}`)}
          />
          <DetailLine label={t('procedure')} value={option.procedureName} />
          <DetailLine label={t('description')} value={option.description} />
          <DetailLine label={t('technique')} value={option.technique} />
          <DetailLine label={t('expectedOutcome')} value={option.expectedOutcome} />
          <DetailLine label={t('successRate')} value={option.successRate} />
          <DetailLine label={t('specialRequirements')} value={option.specialRequirements} />
        </section>

        {(option.treatmentStartDate ||
          option.treatmentEndDate ||
          option.treatmentDurationDays != null ||
          option.hospitalStay ||
          option.recoveryTime) && (
          <section className="panel">
            <h3>{t('timelineRecovery')}</h3>
            <div className="grid-2">
              <DetailLine
                label={t('treatmentStartDate')}
                value={option.treatmentStartDate && format.date(option.treatmentStartDate)}
              />
              <DetailLine
                label={t('treatmentEndDate')}
                value={option.treatmentEndDate && format.date(option.treatmentEndDate)}
              />
              <DetailLine
                label={t('estDuration')}
                value={
                  option.treatmentDurationDays != null ? `${option.treatmentDurationDays}` : null
                }
              />
              <DetailLine label={t('hospitalStay')} value={option.hospitalStay} />
              <DetailLine label={t('recoveryTime')} value={option.recoveryTime} />
            </div>
          </section>
        )}

        <section className="panel">
          <h3>{t('costBreakdown')}</h3>
          <table className="cost-table">
            <tbody>
              {option.costBreakdown.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.labelKey ? t(`costItems.${item.labelKey}`) : item.label}</td>
                  <td className="num">{format.money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t('totalCost')}</th>
                <th className="num">{format.money(option.costBreakdown.total)}</th>
              </tr>
            </tfoot>
          </table>
          <DetailLine label={t('notes')} value={option.costNotes} />
        </section>

        {option.specialists.length > 0 && (
          <section className="panel">
            <h3>{t('careTeam')}</h3>
            <ul className="plain-list">
              {option.specialists.map((s, i) => (
                <li key={i} className="row-between">
                  <span className="capitalize">
                    {s.specialistType}
                    {s.specialistName && ` — ${s.specialistName}`}
                  </span>
                  <span>{format.money(s.costAud)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(option.patientInstructions || option.aftercare.length > 0) && (
          <section className="panel">
            <h3>{t('recoveryAftercare')}</h3>
            <DetailLine label={t('patientInstructions')} value={option.patientInstructions} />
            {option.aftercare.length > 0 && (
              <ul>
                {option.aftercare.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {caseStatus === 'treatment_plan' && !anotherSelected && (
          <ConsultationPanel option={option} consultation={consultation} onChanged={onChanged} />
        )}

        <FormError error={error} />
        {option.selected ? (
          <p className="notice">{t('alreadySelected')}</p>
        ) : anotherSelected ? (
          <p className="muted">{t('otherOptionSelected')}</p>
        ) : (
          canSelect &&
          (confirming ? (
            <div className="panel stack">
              <h3>{t('confirmTitle')}</h3>
              <p>
                {t('confirmBody', {
                  hospital: option.hospital?.name ?? '',
                  specialty: specialtyName,
                })}
              </p>
              <div className="row-end">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setConfirming(false)}
                >
                  {t('cancel')}
                </button>
                <button type="button" disabled={pending} onClick={select}>
                  {pending ? t('confirming') : t('confirm')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}>
              {t('selectOption')}
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <p className="detail-line">
      <span className="small muted">{label}</span>
      <span>{value}</span>
    </p>
  )
}

/**
 * none → request; requested; slots_proposed → pick a time; slot_selected →
 * pay the fee (or change time); scheduled → Zoom link from 15 minutes before
 * until the end; cancelled.
 */
export function ConsultationPanel({
  option,
  consultation,
  onChanged,
}: {
  option: TreatmentOption
  consultation?: Consultation
  onChanged: () => void
}) {
  const t = useT('consultation')
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true)
    setError(null)
    try {
      await action()
      toast({ title: success, tone: 'good' })
      setChanging(false)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  const fee = consultation?.feeAud ?? 200
  const slot = consultation?.slots.find((s) => s.id === consultation.selectedSlotId)
  let body: ReactNode

  if (!consultation) {
    body = (
      <>
        <p className="muted">{t('preRequestText')}</p>
        <button
          type="button"
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => apiPost(`/api/patient/treatment-options/${option.id}/consultation`),
              t('successToast'),
            )
          }
        >
          {pending ? t('requesting') : t('requestButton')}
        </button>
      </>
    )
  } else if (consultation.status === 'requested') {
    body = <p className="muted">{t('requestSent')}</p>
  } else if (
    consultation.status === 'slots_proposed' ||
    (consultation.status === 'slot_selected' && changing)
  ) {
    body = (
      <>
        <p>{t('selectTimePrompt')}</p>
        <div className="slot-list">
          {consultation.slots.map((s) => (
            <label key={s.id} className={`slot${selected === s.id ? ' selected' : ''}`}>
              <input
                type="radio"
                name="slot"
                value={s.id}
                checked={selected === s.id}
                onChange={() => setSelected(s.id)}
              />
              <SlotTimes start={s.slotTime} />
            </label>
          ))}
        </div>
        <div className="row-end">
          {changing && (
            <button type="button" className="button-secondary" onClick={() => setChanging(false)}>
              {t('cancelChange')}
            </button>
          )}
          <button
            type="button"
            disabled={!selected || pending}
            onClick={() =>
              run(
                () =>
                  apiPost(`/api/patient/consultations/${consultation.id}/select-slot`, {
                    slotId: selected,
                  }),
                t('timeConfirmed'),
              )
            }
          >
            {pending ? t('confirmingTime') : t('confirmSelectedTime')}
          </button>
        </div>
      </>
    )
  } else if (consultation.status === 'slot_selected') {
    body = (
      <>
        <p>{t('selectedTimeLabel')}</p>
        {slot && <SlotTimes start={slot.slotTime} />}
        <p className="muted small">{t('payFeeText', { fee })}</p>
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={() => setChanging(true)}>
            {t('changeTimeButton')}
          </button>
          <Link
            className="button"
            to={`/patient/cases/${consultation.caseId}/consultations/${consultation.id}/payment`}
          >
            {t('payFeeButton', { fee })}
          </Link>
        </div>
      </>
    )
  } else if (consultation.status === 'scheduled') {
    body = <ScheduledConsultation consultation={consultation} />
  } else {
    body = (
      <p className="muted">
        {t('cancelled')}
        {consultation.cancellationReason && ` ${consultation.cancellationReason}`}
      </p>
    )
  }

  return (
    <section className="panel stack">
      <h3>{t('onlineConsultation')}</h3>
      {body}
      <FormError error={error} />
    </section>
  )
}

function ScheduledConsultation({ consultation }: { consultation: Consultation }) {
  const t = useT('consultation')
  const slot = consultation.slots.find((s) => s.id === consultation.selectedSlotId)
  if (!slot)
    return (
      <p>
        {t('scheduledForLabel')} {t('scheduledForDefault')}
      </p>
    )
  const start = new Date(slot.slotTime).getTime()
  const end = new Date(slot.slotEndTime).getTime()
  const now = Date.now()
  const joinable = now >= start - 15 * 60_000 && now <= end
  return (
    <>
      <p>{t('scheduledForLabel')}</p>
      <SlotTimes start={slot.slotTime} />
      {now > end ? (
        <p className="muted">{t('consultationEnded')}</p>
      ) : consultation.zoomLink && joinable ? (
        <a className="button" href={consultation.zoomLink} target="_blank" rel="noreferrer">
          {t('joinZoom')}
        </a>
      ) : (
        <p className="muted small">{t('joinLinkEnabled', { minutes: 15 })}</p>
      )}
    </>
  )
}
