import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '../../components/Toasts'
import { Badge, ErrorState, FileDrop, FormError, Loading, StatusBadge } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError, apiPost, apiPut, openFile } from '../../lib/api'
import {
  ACCEPTED_MIME,
  isAtOrAfter,
  JOURNEY,
  MAX_FILE_BYTES,
  MEDICAL_DOCUMENT_TYPES,
  type CaseDetail,
  type MedicalDocumentType,
} from '../../lib/cases'
import { useFormat, useSpecialtyLabel } from '../../lib/format'
import { useRealtime } from '../../lib/realtime'
import type { CaseVisa, Consultation, TreatmentOption, VisaDocument } from '../../lib/types'
import { useApi } from '../../lib/useApi'
import { DevCasePanel } from './DevPanel'
import { usePatient } from './PatientContext'
import { TreatmentDetailModal, TreatmentOptionCard } from './treatments/TreatmentComponents'

export function CaseDetailPage() {
  const t = useT('caseDetail')
  const format = useFormat()
  const { caseId } = useParams()
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const detail = useApi<CaseDetail>(`/api/patient/cases/${caseId}`)
  const status = detail.data?.status
  const showTreatments = !!status && isAtOrAfter(status, 'treatment_plan')
  const showVisa = !!status && isAtOrAfter(status, 'payment_confirmed')
  const options = useApi<TreatmentOption[]>(
    showTreatments ? `/api/patient/cases/${caseId}/treatment-options` : null,
  )
  const consultations = useApi<Consultation[]>(
    showTreatments ? `/api/patient/cases/${caseId}/consultations` : null,
  )
  const visa = useApi<CaseVisa>(showVisa ? `/api/patient/cases/${caseId}/visa` : null)

  // Status changes, new options and consultation updates all arrive as notifications for this case.
  useRealtime<{ caseId: string | null }>('notification', (n) => {
    if (n.caseId !== caseId) return
    void detail.reload()
    if (showTreatments) {
      void options.reload()
      void consultations.reload()
    }
    if (showVisa) void visa.reload()
  })

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const c = detail.data
  const approvedVisa = visa.data?.documents.find((d) => d.category === 'approved_visa')

  return (
    <section className="stack">
      <Link to="/patient/cases" className="muted small">
        ← {t('back')}
      </Link>
      <div className="page-header">
        <div>
          <p className="case-ref">{c.referenceNumber}</p>
          <h1>{specialtyLabel(c)}</h1>
          <p className="muted small">
            {t('submitted')} {format.date(c.createdAt)}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {approvedVisa && <ApprovedVisaBanner document={approvedVisa} />}

      <DevCasePanel
        detail={c}
        consultations={consultations.data ?? []}
        visa={visa.data}
        onChanged={() => {
          void detail.reload()
          if (showTreatments) {
            void options.reload()
            void consultations.reload()
          }
          if (showVisa) void visa.reload()
        }}
      />

      <div className="detail-grid">
        <div className="stack">
          <CaseDocumentsSection detail={c} onChanged={detail.reload} />

          <section className="card">
            <h2>{t('conditionDescription')}</h2>
            <p className="prewrap">{c.description}</p>
          </section>

          {showTreatments ? (
            <TreatmentOptionsSection
              detail={c}
              options={options.data ?? []}
              consultations={consultations.data ?? []}
              onChanged={() => {
                void detail.reload()
                void options.reload()
                void consultations.reload()
              }}
            />
          ) : (
            <section className="card">
              <h2>{t('treatmentOptions')}</h2>
              <p className="muted">{t('treatmentPending')}</p>
            </section>
          )}

          {showVisa && visa.data && <VisaSection visa={visa.data} />}
          {c.status === 'travel_ready' && <TravelAssistance detail={c} onSaved={detail.reload} />}
        </div>

        <div className="stack">
          <StatusTimeline status={c.status} />
          <section className="card">
            <h2>{t('timeline')}</h2>
            <ol className="timeline">
              {[...c.timeline].reverse().map((entry) => (
                <li key={entry.id}>
                  <p className="timeline-title">{entry.title}</p>
                  <p className="muted small">{entry.message}</p>
                  <p className="muted small">{format.dateTime(entry.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  )
}

function CaseDocumentsSection({
  detail,
  onChanged,
}: {
  detail: CaseDetail
  onChanged: () => void
}) {
  const t = useT('caseDocuments')
  const tTypes = useT('documentTypes')
  const tUpload = useT('documentUpload')
  const tc = useT('caseDetail')
  const format = useFormat()
  const toast = useToast()
  const [adding, setAdding] = useState<
    { key: string; file: File; documentType: MedicalDocumentType }[] | null
  >(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const room = detail.maxDocuments - detail.documents.length

  function pick(files: File[]) {
    const ok = files.filter((f) => ACCEPTED_MIME.includes(f.type) && f.size <= MAX_FILE_BYTES)
    const current = adding ?? []
    if (ok.length !== files.length)
      setError(
        new ApiError(
          400,
          'files',
          tUpload('unsupportedFormat', { fileName: files.find((f) => !ok.includes(f))!.name }),
        ),
      )
    const space = room - current.length
    if (ok.length > space)
      setError(new ApiError(400, 'files', tUpload('remainingSlots', { count: space })))
    setAdding([
      ...current,
      ...ok
        .slice(0, space)
        .map((file) => ({ key: crypto.randomUUID(), file, documentType: 'other' as const })),
    ])
  }

  async function save() {
    if (!adding?.length) return
    const form = new FormData()
    adding.forEach((a) => {
      form.append('files', a.file)
      form.append('documentTypes', a.documentType)
    })
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/patient/cases/${detail.id}/documents`, form)
      toast({ title: tUpload('documentsAdded', { count: adding.length }), tone: 'good' })
      setAdding(null)
      onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  async function open(id: string, download?: string) {
    setError(null)
    try {
      await openFile(
        `/api/patient/documents/medical/${id}/content${download ? '?download=true' : ''}`,
        download,
      )
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section className="card stack">
      <div className="row-between">
        <h2>{tc('uploadedDocuments')}</h2>
        {detail.canAddDocuments && !adding && (
          <button type="button" className="button-secondary" onClick={() => setAdding([])}>
            + {t('addDocuments')}
          </button>
        )}
      </div>
      {detail.documents.length === 0 ? (
        <p className="muted">{t('noDocuments')}</p>
      ) : (
        <ul className="doc-list">
          {detail.documents.map((doc) => (
            <li key={doc.id}>
              <div>
                <button type="button" className="button-link" onClick={() => open(doc.id)}>
                  {doc.fileName}
                </button>
                <p className="muted small">
                  {tTypes(doc.documentType)} · {format.bytes(doc.fileSizeBytes)} ·{' '}
                  {format.date(doc.uploadedAt)}
                </p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => open(doc.id, doc.fileName)}
              >
                {t('download')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!detail.canAddDocuments && isAtOrAfter(detail.status, 'treatment_plan') && (
        <p className="muted small">{t('uploadLocked')}</p>
      )}
      {adding && (
        <div className="panel stack">
          <FileDrop
            onFiles={pick}
            label={t('dropOrBrowse')}
            hint={t('maxSize')}
            disabled={adding.length >= room}
          />
          <ul className="file-list">
            {adding.map((a) => (
              <li key={a.key}>
                <span className="file-name">{a.file.name}</span>
                <select
                  aria-label={a.file.name}
                  value={a.documentType}
                  onChange={(e) =>
                    setAdding(
                      adding.map((x) =>
                        x.key === a.key
                          ? { ...x, documentType: e.target.value as MedicalDocumentType }
                          : x,
                      ),
                    )
                  }
                >
                  {MEDICAL_DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tTypes(type)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove"
                  onClick={() => setAdding(adding.filter((x) => x.key !== a.key))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="row-end">
            <button type="button" className="button-secondary" onClick={() => setAdding(null)}>
              {t('cancel')}
            </button>
            <button type="button" disabled={!adding.length || pending} onClick={save}>
              {pending ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
      <FormError error={error} />
    </section>
  )
}

function TreatmentOptionsSection({
  detail,
  options,
  consultations,
  onChanged,
}: {
  detail: CaseDetail
  options: TreatmentOption[]
  consultations: Consultation[]
  onChanged: () => void
}) {
  const t = useT('caseDetail')
  const tt = useT('treatments')
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  const [openId, setOpenId] = useState<string | null>(null)
  const selected = options.find((o) => o.selected)
  const consultationFor = (id: string) => consultations.find((c) => c.treatmentOptionId === id)
  // After a selection, only the chosen option and any with a live consultation stay visible.
  const visible = selected
    ? options.filter(
        (o) =>
          o.selected ||
          ['slot_selected', 'scheduled'].includes(consultationFor(o.id)?.status ?? ''),
      )
    : options
  const open = options.find((o) => o.id === openId) ?? null

  return (
    <section className="card stack">
      <h2>{t('treatmentOptions')}</h2>
      {detail.status === 'treatment_confirmed' && selected && (
        <div className="notice row-between">
          <span>
            {tt('youHaveSelectedHospital', { hospital: selected.hospital?.name ?? '' })}{' '}
            {tt('proceedToPayment')}
          </span>
          <Link className="button" to={`/patient/cases/${detail.id}/payment`}>
            {tt('goToPayment')}
          </Link>
        </div>
      )}
      {options.length === 0 && <p className="muted">{tt('finalisingOptions')}</p>}
      <div className="option-grid">
        {visible.map((o) => (
          <TreatmentOptionCard
            key={o.id}
            option={o}
            consultation={consultationFor(o.id)}
            locked={!!selected && !o.selected}
            onOpen={() => setOpenId(o.id)}
          />
        ))}
      </div>
      {open && (
        <TreatmentDetailModal
          option={open}
          consultation={consultationFor(open.id)}
          caseStatus={detail.status}
          anotherSelected={!!selected && selected.id !== open.id}
          specialtyName={specialtyLabel(detail)}
          onClose={() => setOpenId(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  )
}

function VisaSection({ visa }: { visa: CaseVisa }) {
  const t = useT('caseDetail')
  const tv = useT('visaTravel')
  const format = useFormat()
  const [error, setError] = useState<unknown>(null)
  const letters = (['hospital_invitation', 'appointment_confirmation'] as const).map(
    (category) => ({
      category,
      doc: visa.documents.find((d) => d.source === 'hospital_generated' && d.category === category),
    }),
  )

  async function download(doc: VisaDocument) {
    setError(null)
    try {
      await openFile(`/api/patient/documents/visa/${doc.id}/content?download=true`, doc.fileName)
    } catch {
      setError(new ApiError(500, 'download', t('letterDownloadFailed')))
    }
  }

  return (
    <section className="card stack">
      <h2>{t('visaTravel')}</h2>
      <ul className="doc-list">
        {letters.map(({ category, doc }) => (
          <li key={category}>
            <div>
              <p>
                {t(
                  category === 'hospital_invitation'
                    ? 'hospitalInvitationLetter'
                    : 'appointmentConfirmationLetter',
                )}
              </p>
              <p className="muted small">
                {doc ? format.date(doc.sentToPatientAt) : t('letterPendingDesc')}
              </p>
            </div>
            {doc ? (
              <button type="button" className="button-secondary" onClick={() => download(doc)}>
                {t('letterDownload')}
              </button>
            ) : (
              <Badge tone="muted">{t('letterStatusPending')}</Badge>
            )}
          </li>
        ))}
      </ul>
      <FormError error={error} />
      {visa.submission?.formSubmitted ? (
        <div className="row-between">
          <span>
            {t('visaStatus')}{' '}
            <Badge tone="info">{tv(`statusLabels.${visa.submission.status}`)}</Badge>
          </span>
          <Link to={`/patient/visa-travel/${visa.submission.id}`}>{t('viewDetails')}</Link>
        </div>
      ) : (
        <>
          <p className="muted">
            {visa.lettersReady ? t('visaApplicationDesc') : t('visaApplicationLockedDesc')}
          </p>
          {visa.canStart ? (
            <Link className="button" to={`/patient/cases/${visa.caseId}/visa`}>
              {t('startVisaApplication')}
            </Link>
          ) : (
            <button type="button" disabled>
              {t('startVisaApplicationLocked')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function TravelAssistance({ detail, onSaved }: { detail: CaseDetail; onSaved: () => void }) {
  const t = useT('caseDetail')
  const toast = useToast()
  const [values, setValues] = useState({
    needTravelAssistance: detail.needTravelAssistance,
    needStayBookingAssistance: detail.needStayBookingAssistance,
    needTransportationAssistance: detail.needTransportationAssistance,
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function save() {
    setPending(true)
    setError(null)
    try {
      await apiPut(`/api/patient/cases/${detail.id}/travel-assistance`, values)
      toast({ title: t('travelAssistanceSaved'), tone: 'good' })
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card stack">
      <h2>{t('travelAssistance')}</h2>
      <p className="muted">{t('travelAssistanceDesc')}</p>
      {(
        [
          'needTravelAssistance',
          'needStayBookingAssistance',
          'needTransportationAssistance',
        ] as const
      ).map((key) => (
        <label key={key} className="check-row">
          <input
            type="checkbox"
            checked={values[key]}
            onChange={(e) => setValues({ ...values, [key]: e.target.checked })}
          />
          {t(key)}
        </label>
      ))}
      <FormError error={error} />
      <button type="button" disabled={pending} onClick={save}>
        {pending ? t('saving') : t('save')}
      </button>
    </section>
  )
}

export function StatusTimeline({ status }: { status: CaseDetail['status'] }) {
  const t = useT('caseDetail')
  const ts = useT('activeCaseSection.journeySteps')
  const current = JOURNEY.indexOf(status)
  return (
    <section className="card">
      <h2>{t('statusTimeline')}</h2>
      <ol className="journey">
        {JOURNEY.map((step, i) => (
          <li
            key={step}
            className={current < 0 ? '' : i < current ? 'done' : i === current ? 'current' : ''}
          >
            {ts(step)}
          </li>
        ))}
      </ol>
      {current < 0 && <StatusBadge status={status} />}
    </section>
  )
}

export function ApprovedVisaBanner({ document }: { document: VisaDocument }) {
  const t = useT('approvedVisa')
  const format = useFormat()
  const [error, setError] = useState(false)
  return (
    <div className="banner banner-good row-between">
      <div>
        <strong>{t('title')}</strong>
        <p className="small">
          {t('issuedOn', { date: format.date(document.sentToPatientAt ?? document.uploadedAt) })}
        </p>
        {error && <p className="small">{t('downloadFailed')}</p>}
      </div>
      <button
        type="button"
        onClick={() =>
          openFile(
            `/api/patient/documents/visa/${document.id}/content?download=true`,
            document.fileName,
          ).catch(() => setError(true))
        }
      >
        {t('download')}
      </button>
    </div>
  )
}
