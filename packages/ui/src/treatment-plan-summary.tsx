import type { ComponentType } from 'react'
import {
  Activity,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Stethoscope,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import type { TreatmentPlanWithSpecialists } from '@iha/db/treatment-plans'

const TREATMENT_TYPE_LABELS: Record<string, string> = {
  medication_only: 'Medication Only',
  surgery: 'Surgery',
  therapy: 'Therapy',
}

const TREATMENT_TYPE_BADGE_COLORS: Record<string, string> = {
  medication_only: 'bg-blue-100 text-blue-700',
  surgery: 'bg-purple-100 text-purple-700',
  therapy: 'bg-emerald-100 text-emerald-700',
}

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '—'}</p>
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-slate-100 pt-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-700" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Prose({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value ?? '—'}</p>
    </div>
  )
}

export function TreatmentPlanSummary({ plan }: { plan: TreatmentPlanWithSpecialists }) {
  const cb = plan.cost_breakdown

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cyan-50 text-cyan-700">
            <Stethoscope className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">Treatment Plan</CardTitle>
        </div>
        {plan.treatment_type && (
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              TREATMENT_TYPE_BADGE_COLORS[plan.treatment_type] ?? 'bg-slate-100 text-slate-600'
            }`}
          >
            {TREATMENT_TYPE_LABELS[plan.treatment_type] ?? plan.treatment_type}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Diagnosis</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{plan.diagnosis ?? '—'}</p>
        </div>

        <Section icon={Activity} title="Procedure Details">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Procedure" value={plan.procedure_name} />
            <Field label="Technique" value={plan.technique} />
            <Field label="Success Rate" value={plan.success_rate} />
          </div>
          <div className="mt-4 space-y-4">
            <Prose label="Description" value={plan.description} />
            <Prose label="Expected Outcome" value={plan.expected_outcome} />
          </div>
        </Section>

        <Section icon={CalendarDays} title="Timeline & Recovery">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Treatment Start" value={formatDate(plan.treatment_start_date)} />
            <Field label="Treatment End" value={formatDate(plan.treatment_end_date)} />
            <Field
              label="Duration"
              value={plan.treatment_duration_days != null ? `${plan.treatment_duration_days} days` : null}
            />
            <Field label="Recovery Time" value={plan.recovery_time} />
            <Field label="Estimated Hospital Stay" value={plan.estimated_length_of_stay} />
          </div>
        </Section>

        <Section icon={Building2} title="Hospital Information">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Department" value={plan.department} />
            <Field label="Room Category" value={plan.room_category} />
          </div>
          <div className="mt-4">
            <Prose label="Special Requirements" value={plan.special_requirements} />
          </div>
        </Section>

        <Section icon={Banknote} title="Cost Estimate">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Doctor Fees" value={plan.doctor_fees_aud != null ? formatAUD(plan.doctor_fees_aud) : null} />
            <Field
              label="Hospital Fees"
              value={plan.hospital_fees_aud != null ? formatAUD(plan.hospital_fees_aud) : null}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
            {cb.items.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Item
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cb.items.map((item, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{item.label}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatAUD(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-cyan-50/60">
                    <td className="px-3 py-2 text-sm font-semibold text-slate-900">Total</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-cyan-700">
                      {formatAUD(cb.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-3 text-sm font-medium text-slate-900">—</p>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{plan.cost_notes ?? '—'}</p>
        </Section>

        <Section icon={Users} title="Care Team">
          {plan.specialists.length > 0 ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100">
              {plan.specialists.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {s.specialist_type.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium capitalize text-slate-800">
                        {s.specialist_type}
                        {s.specialist_name && <span className="text-slate-500"> — {s.specialist_name}</span>}
                      </p>
                      {s.notes && <p className="mt-0.5 text-xs text-slate-500">{s.notes}</p>}
                    </div>
                  </div>
                  <p className="shrink-0 font-medium text-slate-800">{formatAUD(s.cost_aud)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-slate-900">—</p>
          )}
        </Section>

        <Section icon={ClipboardList} title="Patient Notes">
          <Prose label="Instructions for Patient" value={plan.patient_instructions} />
          <div className="mt-4">
            <p className="text-xs text-slate-400">Aftercare Instructions</p>
            {plan.aftercare.length > 0 ? (
              <ul className="mt-1 space-y-1.5">
                {plan.aftercare.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-slate-900">—</p>
            )}
          </div>
        </Section>
      </CardContent>
    </Card>
  )
}
