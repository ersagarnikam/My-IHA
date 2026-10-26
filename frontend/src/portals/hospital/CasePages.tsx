import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ErrorState, Loading, StatusBadge } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, money, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { KV } from '../doctor/settings/AccountSettingsPage'
import { TREATMENT_TYPE_LABELS } from '../doctor/types'
import { LetterControls } from './Letters'
import {
  caseTab,
  hospitalCaseStatus,
  type CaseDetail,
  type CaseRow,
  type CaseTab,
  type PatientInfo,
} from './types'

const TABS: { id: CaseTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting Patient' },
  { id: 'confirmed', label: 'Treatment Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'declined', label: 'Declined' },
]

type Range = 'all' | '7' | '30' | '90'

export function CaseStatusPill({
  row,
}: {
  row: Pick<CaseRow, 'planStatus' | 'caseStatus' | 'chosen'>
}) {
  const [label, tone] = hospitalCaseStatus(row)
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

/** Cases that reached the hospital through its doctors' plans (old Case Management). */
export function HospitalCasesPage() {
  const list = useApi<CaseRow[]>('/api/hospital/cases')
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'all') as CaseTab
  const [range, setRange] = useState<Range>('all')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const since = range === 'all' ? 0 : Date.now() - Number(range) * 864e5
  const rows = (list.data ?? []).filter(
    (r) =>
      (tab === 'all' || caseTab(r) === tab) &&
      new Date(r.caseCreatedAt).getTime() >= since &&
      (!q ||
        r.referenceNumber.toLowerCase().includes(q) ||
        (r.patientName ?? '').toLowerCase().includes(q) ||
        (r.doctorName ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Case Management</h1>
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
            placeholder="Search by case ID, patient or doctor"
          />
          <select
            aria-label="Submitted within"
            value={range}
            onChange={(e) => {
              setRange(e.target.value as Range)
              paged.reset()
            }}
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <CaseTable rows={paged.rows} empty="No cases here." />
        {paged.footer}
      </section>
    </div>
  )
}

export function CaseTable({
  rows,
  empty,
  hidePatient,
}: {
  rows: CaseRow[]
  empty: string
  hidePatient?: boolean
}) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            {!hidePatient && <th>Patient</th>}
            <th>Condition</th>
            <th>Doctor</th>
            <th>Admission</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={hidePatient ? 6 : 7} className="dr-empty-row">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.planId}>
              <td className="strong">{r.referenceNumber}</td>
              {!hidePatient && <td>{r.patientName ?? '—'}</td>}
              <td>
                {r.condition}
                {r.procedure && <div className="muted small">{r.procedure}</div>}
              </td>
              <td>{r.doctorName ?? '—'}</td>
              <td>{formatDate(r.admissionDate)}</td>
              <td>
                <CaseStatusPill row={r} />
              </td>
              <td>
                <Link className="button dr-view" to={`/hospital/cases/${r.planId}`}>
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

/** Notifications carry a case id; the hospital's case pages are keyed by plan. */
export function HospitalCaseByCaseRedirect() {
  const { caseId } = useParams()
  const list = useApi<CaseRow[]>('/api/hospital/cases')
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const matches = list.data.filter((r) => r.caseId === caseId)
  const best = matches.find((r) => r.chosen) ?? matches[0]
  return <Navigate to={best ? `/hospital/cases/${best.planId}` : '/hospital/cases'} replace />
}

export function HospitalCaseDetailPage() {
  const { planId } = useParams()
  const detail = useApi<CaseDetail>(`/api/hospital/cases/${planId}`)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const c = detail.data
  const r = c.row
  const p = c.plan

  return (
    <div className="dr-page">
      <BackHeader
        to="/hospital/cases"
        title={`Case ${r.referenceNumber}`}
        subtitle={`${r.condition} · plan submitted ${formatDate(p.submittedAt)}`}
      />

      <section className="dr-card row-between">
        <span
          className="row-start"
          style={{ gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <CaseStatusPill row={r} />
          <StatusBadge status={r.caseStatus} small />
        </span>
        <span className="muted small">
          Admission {formatDate(p.startDate)}
          {p.endDate ? ` – ${formatDate(p.endDate)}` : ''}
        </span>
      </section>

      {r.lettersEligible ? (
        <section className="dr-card stack">
          <div>
            <h2 className="dr-subtitle">Visa letters</h2>
            <p className="muted small" style={{ margin: 0 }}>
              The patient chose and paid for this plan. Send both letters so they can apply for
              their medical-treatment visa.
            </p>
          </div>
          <LettersBlock
            planId={r.planId}
            reference={r.referenceNumber}
            letters={c.letters}
            onChanged={detail.reload}
          />
        </section>
      ) : (
        r.chosen === false && (
          <div className="dr-banner info">
            Visa letters can be issued once the patient chooses this treatment plan and pays for it.
          </div>
        )
      )}

      <div className="hp-two">
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Patient</h2>
          <div className="dr-kv">
            <KV label="Name" value={r.patientName} />
            <PatientFacts info={c.patient} />
          </div>
          <Link className="small" to={`/hospital/patients/${r.patientId}`}>
            Patient profile →
          </Link>
        </section>
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Treating doctor</h2>
          {c.doctor ? (
            <div className="dr-kv">
              <KV label="Name" value={c.doctor.fullName} />
              <KV label="Specialties" value={c.doctor.specialties.join(', ')} />
              <KV label="Email" value={c.doctor.email} />
              <KV label="Phone" value={c.doctor.phone} />
            </div>
          ) : (
            <p className="muted">—</p>
          )}
          {c.doctor && (
            <Link className="small" to={`/hospital/doctors/${c.doctor.id}`}>
              Doctor profile →
            </Link>
          )}
        </section>
      </div>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Case summary</h2>
        <p className="prewrap" style={{ margin: 0 }}>
          {c.description}
        </p>
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Treatment plan</h2>
        <div className="dr-kv">
          <KV label="Diagnosis" value={p.diagnosis} className="full" />
          <KV label="Procedure" value={p.procedure} />
          <KV
            label="Treatment type"
            value={
              p.treatmentType ? (TREATMENT_TYPE_LABELS[p.treatmentType] ?? p.treatmentType) : null
            }
          />
          <KV label="Technique" value={p.technique} />
          <KV label="Department" value={p.department} />
          <KV label="Room category" value={p.roomCategory} />
          <KV label="Length of stay" value={p.lengthOfStay} />
          <KV label="Duration" value={p.durationDays ? `${p.durationDays} days` : null} />
          <KV label="Recovery" value={p.recoveryTime} />
          <KV label="Description" value={p.description} className="full" />
          <KV label="Expected outcome" value={p.expectedOutcome} className="full" />
          <KV label="Special requirements" value={p.specialRequirements} className="full" />
        </div>
        <table className="dash-table">
          <tbody>
            <tr>
              <td>Hospital fees</td>
              <td className="num">{money(p.hospitalFeesAud)}</td>
            </tr>
            <tr>
              <td>Doctor fees</td>
              <td className="num">{money(p.doctorFeesAud)}</td>
            </tr>
            {p.costItems.map((i, idx) => (
              <tr key={idx}>
                <td>{i.label}</td>
                <td className="num">{money(i.amount)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Plan total</strong>
              </td>
              <td className="num">
                <strong>{money(p.totalAud)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

function LettersBlock({
  planId,
  reference,
  letters,
  onChanged,
}: {
  planId: string
  reference: string
  letters: CaseDetail['letters']
  onChanged: () => void
}) {
  return (
    <div className="stack" style={{ gap: '0.75rem' }}>
      {letters.map((l) => (
        <LetterControls
          key={l.type}
          planId={planId}
          reference={reference}
          letter={l}
          onChange={() => onChanged()}
        />
      ))}
    </div>
  )
}

export function PatientFacts({ info }: { info: PatientInfo }) {
  return (
    <>
      <KV label="Date of birth" value={formatDate(info.dateOfBirth)} />
      <KV label="Gender" value={info.gender ? capitalize(info.gender) : null} />
      <KV label="Nationality" value={info.nationality} />
      <KV label="Country of residence" value={info.countryOfResidence} />
      <KV label="Medical history" value={info.medicalHistory} className="full" />
      <KV label="Allergies" value={info.allergies?.join(', ')} />
      <KV label="Current medications" value={info.currentMedications?.join(', ')} />
      <KV label="Past surgeries" value={info.pastSurgeries} className="full" />
    </>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}
