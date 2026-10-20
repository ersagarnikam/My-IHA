'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, BedDouble, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations, useLocale } from 'next-intl'
import {
  Button,
  Dialog,
  DialogContent,
  DialogCloseButton,
  DialogTitle,
} from '@iha/ui'
import type { TreatmentOptionWithDetails } from '@iha/db/treatments'
import type { ConsultationRequest } from '@iha/db/consultations'
import type { SpecialtyLabelMap } from '@iha/db/specialties'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import { selectTreatmentOption } from '@/lib/actions/treatments'
import { ConsultationPanel } from './consultation-panel'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string, locale: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type Props = {
  option: TreatmentOptionWithDetails
  caseId: string
  selectionLocked: boolean
  consultation: ConsultationRequest | null
  specialtyLabelMap: SpecialtyLabelMap
  onClose: () => void
  onSelected: () => void
}

export function TreatmentDetailModal({ option, caseId, selectionLocked, consultation, specialtyLabelMap, onClose, onSelected }: Props) {
  const router = useRouter()
  const t = useTranslations('treatmentDetail')
  const locale = useLocale()
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const hospital = option.hospitals
  const doctor = option.doctors
  const cb = option.cost_breakdown
  const doctorSpecialtyDisplay = getSpecialtyLabel(doctor.specialties?.[0] ?? '', locale, specialtyLabelMap)

  const doctorInitials = doctor.full_name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function handleConfirm() {
    setSubmitting(true)
    const result = await selectTreatmentOption(option.id, caseId)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error, { duration: 6000 })
      setShowConfirm(false)
      return
    }

    toast.success(t('successToast'))
    onSelected()
    onClose()
    router.push(`/cases/${caseId}/payment`)
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-50 p-0">
          <DialogTitle className="sr-only">{t('modalTitle')}</DialogTitle>
          <DialogCloseButton />

          {/* Header */}
          <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-6 py-4">
            <p className="text-sm font-medium text-slate-500">{t('modalTitle')}</p>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-4 p-5">

              {/* Doctor + Hospital cards */}
              <div className="grid gap-4 sm:grid-cols-2">

                {/* Doctor card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('doctor')}</p>
                  <div className="flex items-start gap-3">
                    {doctor.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doctor.photo_url}
                        alt={doctor.full_name}
                        className="h-14 w-14 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-cyan-100 text-base font-bold text-cyan-700">
                        {doctorInitials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{doctor.full_name}</p>
                      <p className="text-sm text-slate-500">{doctorSpecialtyDisplay}</p>
                      {doctor.qualifications && (
                        <p className="mt-0.5 text-xs text-slate-400">{doctor.qualifications}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {hospital.name}
                    </div>
                  </div>

                  {doctor.years_experience != null && (
                    <div className="mt-4 flex divide-x divide-slate-200 rounded-lg border border-slate-100 bg-slate-50 text-center text-xs">
                      <div className="flex-1 px-3 py-2.5">
                        <p className="font-bold text-slate-800">{doctor.years_experience}+</p>
                        <p className="mt-0.5 text-slate-500">{t('yearsExperience')}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hospital card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('hospital')}</p>

                  <div className="flex items-start gap-3">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100">
                      <BedDouble className="h-7 w-7 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{hospital.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {hospital.city}, {hospital.country}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    {hospital.bed_count != null && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <BedDouble className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {hospital.bed_count} {t('beds')}
                      </div>
                    )}
                    {option.department && (
                      <div className="text-xs text-slate-600">
                        <span className="text-slate-400">{t('department')}: </span>
                        {option.department}
                      </div>
                    )}
                    {option.room_category && (
                      <div className="text-xs text-slate-600">
                        <span className="text-slate-400">{t('roomCategory')}: </span>
                        {option.room_category}
                      </div>
                    )}
                  </div>

                  {hospital.specialties && hospital.specialties.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-xs text-slate-400">{t('specialties')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {hospital.specialties.map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnosis + Treatment / Procedure */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">{t('treatmentOverview')}</h3>

                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {option.treatment_type && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('treatmentType')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{t(`treatmentTypes.${option.treatment_type}`)}</p>
                    </div>
                  )}
                  {option.procedure_name && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('procedure')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.procedure_name}</p>
                    </div>
                  )}
                  {option.technique && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('technique')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.technique}</p>
                    </div>
                  )}
                  {option.success_rate && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('successRate')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.success_rate}</p>
                    </div>
                  )}
                </div>

                <dl className="space-y-3 text-sm">
                  {/* SENSITIVE: diagnosis is a medical detail — display only, never log */}
                  {option.diagnosis && (
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-2">
                      <dt className="text-slate-400">{t('diagnosis')}</dt>
                      <dd className="font-medium text-slate-800">{option.diagnosis}</dd>
                    </div>
                  )}
                  {option.description && (
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-2">
                      <dt className="text-slate-400">{t('description')}</dt>
                      <dd className="leading-relaxed text-slate-700">{option.description}</dd>
                    </div>
                  )}
                  {option.expected_outcome && (
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-2">
                      <dt className="text-slate-400">{t('expectedOutcome')}</dt>
                      <dd className="text-slate-700">{option.expected_outcome}</dd>
                    </div>
                  )}
                  {option.special_requirements && (
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-2">
                      <dt className="text-slate-400">{t('specialRequirements')}</dt>
                      <dd className="leading-relaxed text-slate-700">{option.special_requirements}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Timeline & Recovery */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">{t('timelineRecovery')}</h3>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {option.treatment_start_date && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('treatmentStartDate')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {formatDate(option.treatment_start_date, locale)}
                      </p>
                    </div>
                  )}
                  {option.treatment_end_date && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('treatmentEndDate')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {formatDate(option.treatment_end_date, locale)}
                      </p>
                    </div>
                  )}
                  {option.treatment_duration && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('estDuration')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.treatment_duration}</p>
                    </div>
                  )}
                  {option.recovery_time && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('recoveryTime')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.recovery_time}</p>
                    </div>
                  )}
                  {option.hospital_stay && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-400">{t('hospitalStay')}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{option.hospital_stay}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Online Consultation — always visible once a consultation exists (e.g. an
                  already-scheduled Zoom link the patient still needs), even after the
                  treatment plan is locked. Otherwise, only offer requesting a new one
                  while this option is still selectable. */}
              {(consultation || (!selectionLocked && !option.is_selected)) && (
                <ConsultationPanel consultation={consultation} treatmentOptionId={option.id} caseId={caseId} />
              )}

              {/* Cost Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">{t('costBreakdown')}</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {cb.items.map((item) => (
                      <tr key={item.label} className="border-b border-slate-100">
                        <td className="py-2.5 text-slate-600">{item.labelKey ? t(`costItems.${item.labelKey}`) : item.label}</td>
                        <td className="py-2.5 text-right text-slate-800">{formatAUD(item.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="pt-4 text-base font-bold text-slate-900">{t('totalCost')}</td>
                      <td className="pt-4 text-right text-base font-bold text-cyan-700">{formatAUD(cb.total)}</td>
                    </tr>
                  </tbody>
                </table>
                {option.cost_notes && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
                    {option.cost_notes}
                  </p>
                )}
              </div>

              {/* Care Team / Specialists */}
              {option.specialists.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-slate-900">{t('careTeam')}</h3>
                  <ul className="space-y-3">
                    {option.specialists.map((s, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {s.specialist_type}
                            {s.specialist_name && <span className="text-slate-500"> — {s.specialist_name}</span>}
                          </p>
                          {s.notes && <p className="mt-0.5 text-xs text-slate-500">{s.notes}</p>}
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-slate-800">{formatAUD(s.cost_aud)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Doctor Notes */}
              {(option.patient_instructions || (option.aftercare && option.aftercare.length > 0)) && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-semibold text-slate-900">{t('doctorNotes')}</h3>
                  {option.patient_instructions && (
                    <div className="mb-4">
                      <p className="mb-1 text-xs text-slate-400">{t('patientInstructions')}</p>
                      <p className="text-sm leading-relaxed text-slate-700">{option.patient_instructions}</p>
                    </div>
                  )}
                  {option.aftercare && option.aftercare.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs text-slate-400">{t('recoveryAftercare')}</p>
                      <ul className="space-y-2">
                        {option.aftercare.map((item, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
            {option.is_selected ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                {t('alreadySelected')}
              </div>
            ) : selectionLocked ? (
              <p className="text-sm text-slate-400">{t('otherOptionSelected')}</p>
            ) : (
              <Button
                onClick={() => setShowConfirm(true)}
                className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
              >
                {t('selectOption')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      {showConfirm && (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) setShowConfirm(false) }}>
          <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
            <DialogCloseButton />
            <DialogTitle className="text-base font-semibold text-slate-900">{t('confirmTitle')}</DialogTitle>
            <p className="mt-2 text-sm text-slate-600">
              {t('confirmBody', { hospital: hospital.name, specialty: doctorSpecialtyDisplay })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                loading={submitting}
                className="bg-cyan-600 text-white hover:bg-cyan-700"
              >
                {submitting ? t('confirming') : t('confirm')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
