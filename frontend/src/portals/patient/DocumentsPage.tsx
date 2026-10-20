import { useState } from 'react'
import { useToast } from '../../components/Toasts'
import {
  Empty,
  ErrorState,
  Field,
  FileDrop,
  FormError,
  Loading,
  Modal,
  Tabs,
} from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { ApiError, apiPost, openFile } from '../../lib/api'
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  MEDICAL_DOCUMENT_TYPES,
  type CaseStatus,
  type CaseSummary,
} from '../../lib/cases'
import { useFormat, useSpecialtyLabel } from '../../lib/format'
import type { DocumentRow } from '../../lib/types'
import { useApi } from '../../lib/useApi'
import { usePatient } from './PatientContext'

type Category = 'medical' | 'visa'

export const UPLOADABLE_VISA_CATEGORIES = [
  'passport',
  'passport_photograph',
  'bank_statement',
  'sponsorship_letter',
  'employer_letter',
  'companion_passport',
  'companion_proof_of_relationship',
]

/** Which cases still accept documents of each kind (mirrors the API rules). */
const OPEN_STATUSES: Record<Category, CaseStatus[]> = {
  medical: ['case_submitted', 'under_review', 'doctor_assigned', 'evaluation'],
  visa: ['payment_confirmed', 'visa_documents_submitted'],
}

export function DocumentsPage() {
  const t = useT('documents')
  const tTypes = useT('documentTypes')
  const format = useFormat()
  const docs = useApi<DocumentRow[]>('/api/patient/documents')
  const cases = useApi<CaseSummary[]>('/api/patient/cases')
  const [tab, setTab] = useState<Category>('medical')
  const [uploading, setUploading] = useState(false)
  const [linking, setLinking] = useState<DocumentRow | null>(null)
  const [error, setError] = useState<unknown>(null)

  if (docs.error) return <ErrorState error={docs.error} onRetry={docs.reload} />
  if (!docs.data || !cases.data) return <Loading />

  const rows = docs.data.filter((d) => d.category === tab)
  const typeLabel = (d: DocumentRow) =>
    d.category === 'medical' ? tTypes(d.type) : t(`visaDocCategories.${d.type}`)

  async function open(d: DocumentRow, download: boolean) {
    setError(null)
    try {
      await openFile(
        `/api/patient/documents/${d.category}/${d.id}/content${download ? '?download=true' : ''}`,
        download ? d.fileName : undefined,
      )
    } catch {
      setError(
        new ApiError(
          500,
          'download',
          t(download ? 'toasts.downloadFailed' : 'toasts.previewFailed'),
        ),
      )
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <button type="button" onClick={() => setUploading(true)}>
          {t('uploadDocuments')}
        </button>
      </div>
      <Tabs
        tabs={[
          { id: 'medical', label: t('tabs.medical') },
          { id: 'visa', label: t('tabs.visa') },
        ]}
        active={tab}
        onChange={setTab}
      />
      <FormError error={error} />
      {rows.length === 0 ? (
        <Empty title={t(tab === 'medical' ? 'noMedicalDocs' : 'noVisaDocs')}>
          <p className="muted">{t('noDocsSubtext')}</p>
        </Empty>
      ) : (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('tableFile')}</th>
                <th>{t('tableType')}</th>
                <th>{t('tableCase')}</th>
                <th>{t('tableUploaded')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button type="button" className="button-link" onClick={() => open(d, false)}>
                      {d.fileName}
                    </button>
                    <span className="muted small block">{format.bytes(d.fileSizeBytes)}</span>
                  </td>
                  <td>{typeLabel(d)}</td>
                  <td>
                    {d.caseReference ?? (
                      <span className="muted">
                        {t('notLinked')}
                        {d.source === 'patient_upload' && (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="button-link"
                              onClick={() => setLinking(d)}
                            >
                              {t('linkDoc')}
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td>{format.date(d.uploadedAt)}</td>
                  <td>
                    <button type="button" className="button-link" onClick={() => open(d, true)}>
                      {t('download')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UploadDialog
        open={uploading}
        category={tab}
        cases={cases.data}
        onClose={() => setUploading(false)}
        onDone={() => {
          setUploading(false)
          void docs.reload()
        }}
      />
      <LinkDialog
        doc={linking}
        cases={cases.data}
        onClose={() => setLinking(null)}
        onDone={() => {
          setLinking(null)
          void docs.reload()
        }}
      />
    </section>
  )
}

function CaseOptions({ cases, category }: { cases: CaseSummary[]; category: Category }) {
  const { specialties } = usePatient()
  const specialtyLabel = useSpecialtyLabel(specialties)
  return (
    <>
      {cases
        .filter((c) => OPEN_STATUSES[category].includes(c.status))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.referenceNumber} — {specialtyLabel(c)}
          </option>
        ))}
    </>
  )
}

function UploadDialog({
  open,
  category,
  cases,
  onClose,
  onDone,
}: {
  open: boolean
  category: Category
  cases: CaseSummary[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT('documents')
  const tTypes = useT('documentTypes')
  const toast = useToast()
  const types = category === 'medical' ? [...MEDICAL_DOCUMENT_TYPES] : UPLOADABLE_VISA_CATEGORIES
  const [type, setType] = useState(types[0]!)
  const [caseId, setCaseId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const hasOpenCases = cases.some((c) => OPEN_STATUSES[category].includes(c.status))

  function pick(picked: File[]) {
    const bad = picked.find((f) => !ACCEPTED_MIME.includes(f.type))
    const big = picked.find((f) => f.size > MAX_FILE_BYTES)
    if (bad) setError(new ApiError(400, 'type', t('toasts.invalidFileType', { name: bad.name })))
    else if (big) setError(new ApiError(400, 'size', t('toasts.fileTooLarge', { name: big.name })))
    else setError(null)
    setFiles(
      [
        ...files,
        ...picked.filter((f) => ACCEPTED_MIME.includes(f.type) && f.size <= MAX_FILE_BYTES),
      ].slice(0, 10),
    )
  }

  async function save() {
    setPending(true)
    setError(null)
    let uploaded = 0
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('category', category)
        form.append('type', type)
        if (caseId) form.append('caseId', caseId)
        form.append('file', file)
        await apiPost('/api/patient/documents', form)
        uploaded++
      }
      toast({ title: t('toasts.uploadSuccess', { count: uploaded }), tone: 'good' })
      setFiles([])
      onDone()
    } catch (err) {
      setError(err)
      setFiles(files.slice(uploaded))
      if (uploaded) onDone()
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('uploadPanel.title')}>
      <div className="stack">
        <Field
          label={
            category === 'medical'
              ? t('uploadPanel.defaultDocumentType')
              : t('uploadPanel.defaultVisaCategory')
          }
        >
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((v) => (
              <option key={v} value={v}>
                {category === 'medical' ? tTypes(v) : t(`visaDocCategories.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t('uploadPanel.linkToCase')}
          hint={hasOpenCases ? undefined : t('uploadPanel.noCasesAvailable')}
        >
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={!hasOpenCases}
          >
            <option value="">{t('uploadPanel.noCase')}</option>
            <CaseOptions cases={cases} category={category} />
          </select>
        </Field>
        <FileDrop
          onFiles={pick}
          label={t('uploadPanel.dropOrBrowse')}
          hint={t('uploadPanel.allowedTypes')}
        />
        <ul className="plain-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="row-between">
              <span className="file-name">{f.name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Remove"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t('uploadPanel.cancel')}
          </button>
          <button type="button" disabled={!files.length || pending} onClick={save}>
            {pending
              ? t('uploadPanel.saving')
              : t('uploadPanel.saveWithCount', { count: files.length })}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LinkDialog({
  doc,
  cases,
  onClose,
  onDone,
}: {
  doc: DocumentRow | null
  cases: CaseSummary[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT('documents')
  const toast = useToast()
  const [caseId, setCaseId] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function save() {
    if (!doc) return
    setError(null)
    try {
      await apiPost(`/api/patient/documents/${doc.category}/${doc.id}/link`, { caseId })
      toast({ title: t('toasts.linkSuccess'), tone: 'good' })
      setCaseId('')
      onDone()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Modal open={!!doc} onClose={onClose} title={t('linkDoc')}>
      <div className="stack">
        <p className="muted">{t('linkDocSubtitle')}</p>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="" disabled>
            {t('selectCase')}
          </option>
          {doc && <CaseOptions cases={cases} category={doc.category} />}
        </select>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" disabled={!caseId} onClick={save}>
            {t('saveLink')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
