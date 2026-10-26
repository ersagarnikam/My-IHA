import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { Badge, ErrorState, Loading } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import type { CaseDetail } from '../../../lib/cases'
import { browserTimeZone, DEFAULT_TIME_ZONE, useFormat, zoneCity } from '../../../lib/format'
import type { Consultation, TreatmentOption } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'
import { Checkout } from './Checkout'

/** /patient/cases/:caseId/payment — pay for the selected treatment option. */
export function TreatmentPaymentPage() {
  const t = useT('paymentPage')
  const tc = useT('treatmentDetail')
  const format = useFormat()
  const { caseId } = useParams()
  const detail = useApi<CaseDetail>(`/api/patient/cases/${caseId}`)
  const option = useApi<TreatmentOption>(`/api/patient/cases/${caseId}/treatment-options/selected`)
  const [paid, setPaid] = useState(false)

  if (detail.error) return <ErrorState error={detail.error} />
  if (!detail.data || (option.loading && !option.data)) return <Loading />
  const c = detail.data
  const alreadyPaid = c.status !== 'treatment_confirmed'
  if (!paid && !alreadyPaid && option.error) return <ErrorState error={option.error} />
  if (!['treatment_confirmed', 'payment_confirmed'].includes(c.status) && !paid) {
    return <Navigate to={`/patient/cases/${caseId}`} replace />
  }

  return (
    <section className="stack narrow">
      <Link to={`/patient/cases/${caseId}`} className="muted small">
        ← {t('backToCase')}
      </Link>
      <h1>{t('title')}</h1>
      {paid || alreadyPaid ? (
        <div className="card stack success-card">
          <Badge tone="good">{t('paymentConfirmedBadge')}</Badge>
          <h2>{paid ? t('successTitle') : t('alreadyPaidTitle')}</h2>
          <p>
            {paid && option.data
              ? t('successBody', { amount: format.money(option.data.costBreakdown.total) })
              : t('alreadyPaidBody')}
          </p>
          <p className="muted small">{t('successReference', { ref: c.referenceNumber })}</p>
          <Link className="button" to={`/patient/cases/${caseId}`}>
            {t('backToCase')}
          </Link>
        </div>
      ) : (
        option.data && (
          <>
            <section className="card stack">
              <h2>{t('paymentSummary')}</h2>
              {option.data.hospital && <p className="muted">{option.data.hospital.name}</p>}
              <table className="cost-table">
                <tbody>
                  {option.data.costBreakdown.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.labelKey ? tc(`costItems.${item.labelKey}`) : item.label}</td>
                      <td className="num">{format.money(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>{t('totalDue')}</th>
                    <th className="num">{format.money(option.data.costBreakdown.total)}</th>
                  </tr>
                </tfoot>
              </table>
            </section>
            <section className="card stack">
              <h2>{t('payByCard')}</h2>
              <Checkout
                checkoutPath={`/api/patient/cases/${caseId}/checkout`}
                onPaid={() => setPaid(true)}
              />
            </section>
          </>
        )
      )}
    </section>
  )
}

/** /patient/cases/:caseId/consultations/:requestId/payment — the AUD 200 consultation fee. */
export function ConsultationPaymentPage() {
  const t = useT('paymentPage')
  const format = useFormat()
  const { caseId, requestId } = useParams()
  const consultation = useApi<Consultation>(`/api/patient/consultations/${requestId}`)
  const [paid, setPaid] = useState(false)

  if (consultation.error) return <ErrorState error={consultation.error} />
  if (!consultation.data) return <Loading />
  const c = consultation.data
  if (c.caseId !== caseId) return <Navigate to="/patient/cases" replace />
  if (c.status !== 'slot_selected' && !paid)
    return <Navigate to={`/patient/cases/${caseId}`} replace />
  const slot = c.slots.find((s) => s.id === c.selectedSlotId)

  return (
    <section className="stack narrow">
      <Link to={`/patient/cases/${caseId}`} className="muted small">
        ← {t('backToCase')}
      </Link>
      <h1>{t('consultationTitle')}</h1>
      {paid ? (
        <div className="card stack success-card">
          <Badge tone="good">{t('paymentConfirmedBadge')}</Badge>
          <p>{t('consultationPaymentReceived')}</p>
          <Link className="button" to={`/patient/cases/${caseId}`}>
            {t('backToCase')}
          </Link>
        </div>
      ) : (
        <>
          <section className="card stack">
            <h2>{t('onlineConsultation')}</h2>
            {slot && <SlotTimes start={slot.slotTime} zone={c.doctorTimeZone} />}
            <div className="row-between">
              <span>{t('consultationFee')}</span>
              <strong>{format.money(c.feeAud)}</strong>
            </div>
          </section>
          <section className="card stack">
            <h2>{t('payByCard')}</h2>
            <Checkout
              checkoutPath={`/api/patient/consultations/${requestId}/checkout`}
              onPaid={() => setPaid(true)}
            />
          </section>
        </>
      )}
    </section>
  )
}

/** A slot in the doctor's time zone, plus the patient's own time zone when different. */
export function SlotTimes({ start, zone = DEFAULT_TIME_ZONE }: { start: string; zone?: string }) {
  const format = useFormat()
  const t = useT('consultation')
  const local = browserTimeZone()
  return (
    <span className="slot-times">
      <strong>{format.dateTime(start, zone)}</strong>{' '}
      <span className="muted small">({t('zoneTime', { city: zoneCity(zone) })})</span>
      {local !== zone && (
        <span className="muted small block">
          {format.dateTime(start, local)} ({local})
        </span>
      )}
    </span>
  )
}
