import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Field, FormError, fieldError, Loading } from '../../components/ui'
import { ApiError, apiPost, apiPut } from '../../lib/api'
import { drafts } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, brisbaneToday, money } from './shared'
import { SPECIALIST_TYPE_LABELS, TREATMENT_TYPE_LABELS, type Plan, type PlanStatus } from './types'

const QUICK_ITEMS = [
  'Surgery Charge',
  'Diagnostics & Lab',
  'Anaesthesia Charges',
  'Medication Estimate',
  'Rehabilitation Charges',
]

/** Why Submit is locked, by initial consultation state. */
const CONSULTATION_HINT: Record<string, string> = {
  none: 'Hold the initial Zoom consultation with the patient before submitting the plan.',
  slots_proposed: 'The patient hasn\'t chosen a consultation time yet; you can submit once the consultation has taken place.',
  slot_selected: 'The patient chose a consultation time and is paying; you can submit once it has taken place.',
  scheduled: 'The initial consultation is booked; you can submit once it has taken place.',
}

const READ_ONLY_TEXT: Partial<Record<PlanStatus, string>> = {
  submitted_to_iha:
    'This treatment plan has been submitted and is awaiting MTA Admin review — it can no longer be edited.',
  iha_review_in_progress:
    'This treatment plan has been submitted and is awaiting MTA Admin review — it can no longer be edited.',
  iha_approved: 'This treatment plan has been approved by MTA Admin and is no longer editable.',
  rejected_by_iha: 'This treatment plan was rejected by MTA Admin and is no longer editable.',
  presented_to_patient: 'This treatment plan has been sent to the patient and is no longer editable.',
  patient_confirmed: 'The patient has confirmed this treatment plan. It is no longer editable.',
  not_selected: 'The patient chose another treatment option. This plan is no longer editable.',
}

type Line = { label: string; amount: string }
type Person = { specialistType: string; specialistName: string; costAud: string; notes: string }

type Form = {
  diagnosis: string
  treatmentType: string
  procedureName: string
  description: string
  technique: string
  successRate: string
  expectedOutcome: string
  treatmentStartDate: string
  treatmentEndDate: string
  recoveryTime: string
  estimatedLengthOfStay: string
  hospitalId: string
  department: string
  roomCategory: string
  specialRequirements: string
  doctorFeesAud: string
  hospitalFeesAud: string
  costItems: Line[]
  costNotes: string
  specialists: Person[]
  patientInstructions: string
  aftercare: string
}

const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function fromPlan(p: Plan): Form {
  return {
    diagnosis: s(p.diagnosis),
    treatmentType: s(p.treatmentType),
    procedureName: s(p.procedureName),
    description: s(p.description),
    technique: s(p.technique),
    successRate: s(p.successRate),
    expectedOutcome: s(p.expectedOutcome),
    treatmentStartDate: s(p.treatmentStartDate),
    treatmentEndDate: s(p.treatmentEndDate),
    recoveryTime: s(p.recoveryTime),
    estimatedLengthOfStay: s(p.estimatedLengthOfStay),
    hospitalId: s(p.hospitalId),
    department: s(p.department),
    roomCategory: s(p.roomCategory),
    specialRequirements: s(p.specialRequirements),
    doctorFeesAud: s(p.doctorFeesAud),
    hospitalFeesAud: s(p.hospitalFeesAud),
    costItems: p.costItems.map((i) => ({ label: i.label, amount: s(i.amount) })),
    costNotes: s(p.costNotes),
    specialists: p.specialists.map((x) => ({
      specialistType: x.specialistType,
      specialistName: s(x.specialistName),
      costAud: s(x.costAud),
      notes: s(x.notes),
    })),
    patientInstructions: s(p.patientInstructions),
    aftercare: p.aftercare.join('\n'),
  }
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim())
const num = (v: string) => (v.trim() === '' ? null : Number(v))

function toPayload(f: Form) {
  return {
    diagnosis: orNull(f.diagnosis),
    treatmentType: orNull(f.treatmentType),
    procedureName: orNull(f.procedureName),
    description: orNull(f.description),
    technique: orNull(f.technique),
    successRate: orNull(f.successRate),
    expectedOutcome: orNull(f.expectedOutcome),
    treatmentStartDate: orNull(f.treatmentStartDate),
    treatmentEndDate: orNull(f.treatmentEndDate),
    recoveryTime: orNull(f.recoveryTime),
    estimatedLengthOfStay: orNull(f.estimatedLengthOfStay),
    hospitalId: orNull(f.hospitalId),
    department: orNull(f.department),
    roomCategory: orNull(f.roomCategory),
    specialRequirements: orNull(f.specialRequirements),
    doctorFeesAud: num(f.doctorFeesAud),
    hospitalFeesAud: num(f.hospitalFeesAud),
    costItems: f.costItems.map((i) => ({ label: i.label.trim(), amount: num(i.amount) ?? 0 })),
    costNotes: orNull(f.costNotes),
    patientInstructions: orNull(f.patientInstructions),
    aftercare: f.aftercare.split('\n').map((l) => l.trim()).filter(Boolean),
    specialists: f.specialists.map((x) => ({
      specialistType: x.specialistType,
      specialistName: orNull(x.specialistName),
      costAud: num(x.costAud),
      notes: orNull(x.notes),
    })),
  }
}

function total(f: Form) {
  const n = (v: string) => Number(v) || 0
  return (
    n(f.doctorFeesAud) +
    n(f.hospitalFeesAud) +
    f.costItems.reduce((sum, i) => sum + n(i.amount), 0) +
    f.specialists.reduce((sum, x) => sum + n(x.costAud), 0)
  )
}

function durationDays(start: string, end: string) {
  if (!start || !end) return null
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  return days > 0 ? days : null
}

export function TreatmentPlanPage() {
  const { caseId } = useParams()
  const plan = useApi<Plan>(`/api/doctor/cases/${caseId}/treatment-plan`)
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.reload} />
  if (!plan.data) return <Loading />
  return <PlanForm key={plan.data.updatedAt ?? 'new'} plan={plan.data} onSaved={plan.setData} />
}

function PlanForm({ plan, onSaved }: { plan: Plan; onSaved: (p: Plan) => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const readOnly = plan.status !== null && plan.status !== 'draft'
  const consultationDone = plan.initialConsultation === 'held' || plan.initialConsultation === 'skipped'
  const draftName = `treatment-plan:${plan.caseId}`
  const [form, setForm] = useState<Form>(() => (!readOnly && drafts.load<Form>(draftName)) || fromPlan(plan))
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const today = brisbaneToday()

  // Unsaved typing survives a refresh (cleared on save, submit and sign-out).
  useEffect(() => {
    if (!readOnly) drafts.save(draftName, form)
  }, [form, readOnly, draftName])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const err = (field: string) => fieldError(error, field)
  const hospital = plan.hospitals.find((h) => h.id === form.hospitalId)
  const days = durationDays(form.treatmentStartDate, form.treatmentEndDate)

  async function save(kind: 'draft' | 'submit') {
    setPending(kind)
    setError(null)
    try {
      const path = `/api/doctor/cases/${plan.caseId}/treatment-plan`
      const saved =
        kind === 'draft'
          ? await apiPut<Plan>(path, toPayload(form))
          : await apiPost<Plan>(`${path}/submit`, toPayload(form))
      drafts.clear(draftName)
      if (kind === 'draft') {
        toast({ title: 'Draft saved.', tone: 'good' })
        onSaved(saved)
      } else {
        toast({ title: 'Treatment plan submitted to MTA Admin.', tone: 'good' })
        navigate(`/doctor/cases/${plan.caseId}`)
      }
    } catch (e) {
      setError(e)
      if (e instanceof ApiError && e.code === 'validation_failed')
        toast({ title: 'Please complete all required fields before submitting.', tone: 'bad' })
    } finally {
      setPending(null)
    }
  }

  const text = (key: keyof Form, label: ReactNode, opts: { placeholder?: string; required?: boolean } = {}) => (
    <Field label={<>{label}{opts.required && <span className="required"> *</span>}</>} error={err(key)}>
      <input
        value={form[key] as string}
        disabled={readOnly}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  )
  const area = (key: keyof Form, label: ReactNode, rows = 3, required = false) => (
    <Field label={<>{label}{required && <span className="required"> *</span>}</>} error={err(key)}>
      <textarea
        rows={rows}
        value={form[key] as string}
        disabled={readOnly}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  )

  return (
    <form className="dr-page" onSubmit={(e) => e.preventDefault()} style={{ paddingBottom: '2rem' }}>
      <BackHeader to={`/doctor/cases/${plan.caseId}`} title="Treatment Plan" subtitle={`Case ID: ${plan.referenceNumber}`} />

      {readOnly && plan.status && (
        <div className="dr-banner">{READ_ONLY_TEXT[plan.status] ?? 'This treatment plan can no longer be edited.'}</div>
      )}
      {!readOnly && !plan.evaluationStartedAt && (
        <div className="dr-banner info">Start your evaluation from the case page before submitting this plan.</div>
      )}
      {!readOnly && plan.evaluationStartedAt && !consultationDone && (
        <div className="dr-banner info">
          {CONSULTATION_HINT[plan.initialConsultation] ?? CONSULTATION_HINT.none} You can keep drafting in the
          meantime.{' '}
          <Link to={`/doctor/cases/${plan.caseId}#initial-consultation`}>Go to the consultation</Link>
        </div>
      )}

      <Section title="Diagnosis">{area('diagnosis', 'Primary Diagnosis', 3, true)}</Section>

      <Section title="Treatment / Procedure">
        <Group label={<>Treatment Type<span className="required"> *</span></>} error={err('treatmentType')}>
          <div className="dr-radios">
            {Object.entries(TREATMENT_TYPE_LABELS).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="treatmentType"
                  disabled={readOnly}
                  checked={form.treatmentType === value}
                  onChange={() => set('treatmentType', value)}
                />
                {label}
              </label>
            ))}
          </div>
        </Group>
        {text('procedureName', 'Procedure / Recommended Treatment', { required: true })}
        {area('description', 'Description')}
        <div className="dr-grid-2">
          {text('technique', 'Technique', { placeholder: 'e.g. Minimally Invasive' })}
          {text('successRate', 'Success Rate', { placeholder: 'e.g. 95%' })}
        </div>
        {area('expectedOutcome', 'Expected Outcome', 2)}
      </Section>

      <Section title="Timeline & Recovery">
        <div className="dr-grid-2">
          <Field label={<>Treatment Start Date<span className="required"> *</span></>} error={err('treatmentStartDate')}>
            <input
              type="date"
              min={today}
              disabled={readOnly}
              value={form.treatmentStartDate}
              onChange={(e) => set('treatmentStartDate', e.target.value)}
            />
          </Field>
          <Field label={<>Treatment End Date<span className="required"> *</span></>} error={err('treatmentEndDate')}>
            <input
              type="date"
              min={form.treatmentStartDate || today}
              disabled={readOnly}
              value={form.treatmentEndDate}
              onChange={(e) => set('treatmentEndDate', e.target.value)}
            />
          </Field>
        </div>
        {days && (
          <p className="muted small" style={{ margin: 0 }}>
            Duration: {days} {days === 1 ? 'day' : 'days'} (calculated automatically)
          </p>
        )}
        {text('recoveryTime', 'Recovery Time', { placeholder: 'e.g. 4-6 weeks' })}
        {text('estimatedLengthOfStay', 'Estimated Hospital Stay', { placeholder: 'e.g. 3 nights', required: true })}
      </Section>

      <Section title="Hospital Information">
        <Field label={<>Select Hospital<span className="required"> *</span></>} error={err('hospitalId')}>
          <select
            value={form.hospitalId}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, hospitalId: e.target.value, roomCategory: '' }))}
          >
            <option value="">Select a hospital</option>
            {plan.hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} — {h.city}
              </option>
            ))}
          </select>
        </Field>
        {plan.hospitals.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            You have no affiliated hospitals yet — add one in Account &amp; Settings before building a plan.
          </p>
        )}
        {text('department', 'Department', { placeholder: 'e.g. Cardiology' })}
        <Group label="Room Category">
          {hospital && hospital.roomTypes.length > 0 ? (
            <div className="dr-radios">
              {hospital.roomTypes.map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    name="roomCategory"
                    disabled={readOnly}
                    checked={form.roomCategory === type}
                    onChange={() => set('roomCategory', type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          ) : (
            <span className="muted small">Select a hospital to see its available room categories.</span>
          )}
        </Group>
        {area('specialRequirements', 'Special Requirements', 2)}
      </Section>

      <Section title="Cost Estimation">
        <div className="dr-grid-2">
          <Field label={<>Doctor Fees (AUD)<span className="required"> *</span></>} error={err('doctorFeesAud')}>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={readOnly}
              value={form.doctorFeesAud}
              onChange={(e) => set('doctorFeesAud', e.target.value)}
            />
          </Field>
          <Field label={<>Hospital Fees (AUD)<span className="required"> *</span></>} error={err('hospitalFeesAud')}>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={readOnly}
              value={form.hospitalFeesAud}
              onChange={(e) => set('hospitalFeesAud', e.target.value)}
            />
          </Field>
        </div>
        <div className="stack" style={{ gap: '0.5rem' }}>
          <span className="field-label">Itemised Costs</span>
          {form.costItems.length > 0 && (
            <table className="dr-line-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Amount (AUD)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.costItems.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={item.label}
                        disabled={readOnly}
                        placeholder="e.g. Surgery Charge"
                        aria-label="Item"
                        onChange={(e) =>
                          set('costItems', form.costItems.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                        }
                      />
                      {err(`costItems.${i}.label`) && <span className="field-error">{err(`costItems.${i}.label`)}</span>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.amount}
                        disabled={readOnly}
                        aria-label="Amount"
                        onChange={(e) =>
                          set('costItems', form.costItems.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td style={{ width: '2.5rem' }}>
                      {!readOnly && (
                        <button
                          type="button"
                          className="dr-icon-button"
                          aria-label="Remove item"
                          onClick={() => set('costItems', form.costItems.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!readOnly && (
            <div className="dr-chips">
              {QUICK_ITEMS.filter((label) => !form.costItems.some((i) => i.label === label)).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="dr-chip"
                  onClick={() => set('costItems', [...form.costItems, { label, amount: '' }])}
                >
                  + {label}
                </button>
              ))}
              <button
                type="button"
                className="dr-chip"
                onClick={() => set('costItems', [...form.costItems, { label: '', amount: '' }])}
              >
                Custom Item
              </button>
            </div>
          )}
        </div>
        {area('costNotes', 'Notes', 2)}
      </Section>

      <Section title="Specialists">
        {form.specialists.length > 0 && (
          <div className="dr-table-wrap">
            <table className="dr-line-table">
              <thead>
                <tr>
                  <th>Specialist Role</th>
                  <th>Specialist</th>
                  <th>Fee (AUD)</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.specialists.map((x, i) => {
                  const update = (patch: Partial<Person>) =>
                    set('specialists', form.specialists.map((y, j) => (j === i ? { ...y, ...patch } : y)))
                  return (
                    <tr key={i}>
                      <td>
                        <select
                          value={x.specialistType}
                          disabled={readOnly}
                          aria-label="Specialist role"
                          onChange={(e) => update({ specialistType: e.target.value })}
                        >
                          <option value="">Select</option>
                          {Object.entries(SPECIALIST_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        {err(`specialists.${i}.specialistType`) && (
                          <span className="field-error">{err(`specialists.${i}.specialistType`)}</span>
                        )}
                      </td>
                      <td>
                        <input
                          value={x.specialistName}
                          disabled={readOnly}
                          placeholder="Optional"
                          aria-label="Specialist name"
                          onChange={(e) => update({ specialistName: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={x.costAud}
                          disabled={readOnly}
                          aria-label="Fee"
                          onChange={(e) => update({ costAud: e.target.value })}
                        />
                        {err(`specialists.${i}.costAud`) && (
                          <span className="field-error">{err(`specialists.${i}.costAud`)}</span>
                        )}
                      </td>
                      <td>
                        <input
                          value={x.notes}
                          disabled={readOnly}
                          placeholder="Optional"
                          aria-label="Notes"
                          onChange={(e) => update({ notes: e.target.value })}
                        />
                      </td>
                      <td style={{ width: '2.5rem' }}>
                        {!readOnly && (
                          <button
                            type="button"
                            className="dr-icon-button"
                            aria-label="Remove specialist"
                            onClick={() => set('specialists', form.specialists.filter((_, j) => j !== i))}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && (
          <button
            type="button"
            className="button-secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              set('specialists', [...form.specialists, { specialistType: '', specialistName: '', costAud: '', notes: '' }])
            }
          >
            <Plus size={14} /> Add Specialist
          </button>
        )}
      </Section>

      <Section title="Doctor Notes">
        {area('patientInstructions', 'Instructions for Patient')}
        <Field label="Aftercare Instructions" hint={readOnly ? undefined : 'One instruction per line.'}>
          <textarea
            rows={3}
            value={form.aftercare}
            disabled={readOnly}
            onChange={(e) => set('aftercare', e.target.value)}
          />
        </Field>
      </Section>

      <div className="dr-total">
        <span className="muted">Estimated Total</span>
        <strong>{money(total(form))}</strong>
      </div>

      {!readOnly && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Ready to submit?</h2>
          <label className="check-row">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm this treatment plan is accurate
          </label>
          <FormError error={error instanceof ApiError && error.code === 'validation_failed' ? null : error} />
          <div className="row-end">
            <button type="button" className="button-secondary" onClick={() => navigate(`/doctor/cases/${plan.caseId}`)}>
              Cancel
            </button>
            <button type="button" className="button-secondary" disabled={!!pending} onClick={() => save('draft')}>
              {pending === 'draft' ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={!confirmed || !!pending || !consultationDone}
              title={consultationDone ? undefined : 'Hold the initial Zoom consultation first'}
              onClick={() => save('submit')}
            >
              {pending === 'submit' ? 'Submitting…' : 'Submit Plan'}
            </button>
          </div>
        </section>
      )}
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="dr-section" open>
      <summary>
        {title}
        <ChevronDown size={16} />
      </summary>
      <div className="dr-section-body">{children}</div>
    </details>
  )
}

/** Like Field, but a <div role="group">: a <label> around several radios would forward clicks to the first one. */
function Group({ label, error, children }: { label: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="field" role="group">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
