import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Empty, ErrorState, Loading } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import type { CaseSummary } from '../../../lib/cases'
import { useSpecialtyLabel } from '../../../lib/format'
import { useRealtime } from '../../../lib/realtime'
import type { Consultation, TreatmentOption } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'
import { usePatient } from '../PatientContext'
import { TreatmentDetailModal, TreatmentOptionCard } from './TreatmentComponents'

/** All published options across the patient's cases, grouped by case. */
export function TreatmentsPage() {
  const t = useT('treatments')
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const options = useApi<TreatmentOption[]>('/api/patient/treatment-options')
  const cases = useApi<CaseSummary[]>('/api/patient/cases')
  const consultations = useApi<Consultation[]>('/api/patient/consultations')
  const [openId, setOpenId] = useState<string | null>(null)

  useRealtime('notification', () => {
    void options.reload()
    void consultations.reload()
  })

  const grouped = useMemo(() => {
    const byCase = new Map<string, TreatmentOption[]>()
    for (const o of options.data ?? []) byCase.set(o.caseId, [...(byCase.get(o.caseId) ?? []), o])
    return [...byCase.entries()]
  }, [options.data])

  if (options.error) return <ErrorState error={options.error} onRetry={options.reload} />
  if (!options.data || !cases.data) return <Loading />

  const caseById = new Map(cases.data.map((c) => [c.id, c]))
  const consultationFor = (optionId: string) =>
    consultations.data?.find((c) => c.treatmentOptionId === optionId)
  const open = options.data.find((o) => o.id === openId) ?? null

  return (
    <section className="stack">
      <div>
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
      </div>
      {grouped.length === 0 && (
        <Empty title={t('noOptions')}>
          <p className="muted">{t('noOptionsSubtext')}</p>
        </Empty>
      )}
      {grouped.map(([caseId, caseOptions]) => {
        const c = caseById.get(caseId)
        const anySelected = caseOptions.some((o) => o.selected)
        return (
          <section key={caseId} className="stack">
            <div className="row-between">
              <h2>
                {c ? specialtyLabel(c) : ''} <span className="case-ref">{c?.referenceNumber}</span>
              </h2>
              <Link to={`/patient/cases/${caseId}`}>{t('viewCase')}</Link>
            </div>
            <div className="option-grid">
              {caseOptions.map((o) => (
                <TreatmentOptionCard
                  key={o.id}
                  option={o}
                  consultation={consultationFor(o.id)}
                  locked={anySelected && !o.selected}
                  onOpen={() => setOpenId(o.id)}
                />
              ))}
            </div>
          </section>
        )
      })}
      {open && (
        <TreatmentDetailModal
          option={open}
          consultation={consultationFor(open.id)}
          caseStatus={caseById.get(open.caseId)?.status ?? ''}
          anotherSelected={options.data.some(
            (o) => o.caseId === open.caseId && o.selected && o.id !== open.id,
          )}
          specialtyName={
            caseById.get(open.caseId) ? specialtyLabel(caseById.get(open.caseId)!) : ''
          }
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void options.reload()
            void consultations.reload()
            void cases.reload()
          }}
        />
      )}
    </section>
  )
}
