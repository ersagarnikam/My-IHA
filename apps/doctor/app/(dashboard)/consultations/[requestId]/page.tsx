import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { fetchConsultationRequestById } from '@iha/db/consultations'
import { Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { ConsultationStatusBadge } from '@/components/consultations/consultation-status-badge'
import { ProposeSlotsForm } from '@/components/consultations/propose-slots-form'
import { CancelConsultationDialog } from '@/components/consultations/cancel-consultation-dialog'
import { JoinZoomButton } from '@/components/consultations/join-zoom-button'
import { formatZonedDateTime, DOCTOR_TIME_ZONE } from '@/lib/timezone'

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role === 'hospital') notFound()

  // RLS scopes this select to the caller's own treatment options, so a
  // request belonging to another doctor resolves to null here — the same
  // check as an explicit ownership guard.
  const { data: request } = await fetchConsultationRequestById(requestId)
  if (!request) notFound()

  const selectedSlot = request.slots.find((s) => s.id === request.selected_slot_id)
  const canProposeSlots = request.status === 'requested' || request.status === 'slots_proposed'
  // Once a patient has paid and the meeting is 'scheduled', it's locked in —
  // the doctor can no longer update times (blocked above via
  // canProposeSlots) or cancel it from here.
  const canCancel = request.status !== 'cancelled' && request.status !== 'scheduled'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/consultations"
          aria-label="Back to Consultations"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Consultation Request</h1>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Case: <span className="font-semibold text-slate-900">{request.case_reference_number ?? '—'}</span>
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Patient: <span className="font-semibold text-slate-900">{request.patient_name ?? '—'}</span>
            </p>
          </div>
          <ConsultationStatusBadge status={request.status} />
        </CardContent>
      </Card>

      {request.slots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposed Times</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {request.slots.map((slot) => {
              const { date, range } = formatZonedDateTime(slot.slot_time, slot.slot_end_time)
              const isSelected = slot.id === request.selected_slot_id
              return (
                <div
                  key={slot.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                    isSelected ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <span>
                    {date}, {range} ({DOCTOR_TIME_ZONE.split('/').pop()?.replace(/_/g, ' ')} Time)
                  </span>
                  {isSelected && <span className="text-xs font-semibold uppercase">Patient Selected</span>}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {canProposeSlots && (
        <ProposeSlotsForm
          requestId={request.id}
          caseId={request.case_id}
          isRepropose={request.status === 'slots_proposed'}
          treatmentStartDate={request.treatment_option?.treatment_start_date ?? null}
        />
      )}

      {request.status === 'slot_selected' && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-600">
              The patient selected a time and is completing payment. The consultation will be scheduled
              automatically once payment succeeds.
            </p>
          </CardContent>
        </Card>
      )}

      {request.status === 'scheduled' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheduled Meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSlot &&
              (() => {
                const { date, range } = formatZonedDateTime(selectedSlot.slot_time, selectedSlot.slot_end_time)
                return (
                  <p className="text-sm text-slate-600">
                    {date}, {range} ({DOCTOR_TIME_ZONE.split('/').pop()?.replace(/_/g, ' ')} Time)
                  </p>
                )
              })()}
            {request.zoom_link && selectedSlot ? (
              <JoinZoomButton
                zoomLink={request.zoom_link}
                slotStartIso={selectedSlot.slot_time}
                slotEndIso={selectedSlot.slot_end_time}
              />
            ) : (
              <p className="text-sm text-slate-400">Zoom link not yet generated.</p>
            )}
          </CardContent>
        </Card>
      )}

      {request.status === 'cancelled' && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">This consultation request was cancelled.</p>
            {request.cancellation_reason && (
              <p className="mt-1 text-sm text-slate-500">Reason: {request.cancellation_reason}</p>
            )}
          </CardContent>
        </Card>
      )}

      {canCancel && (
        <div className="flex flex-wrap items-center gap-3">
          <CancelConsultationDialog requestId={request.id} caseId={request.case_id} />
        </div>
      )}
    </div>
  )
}
