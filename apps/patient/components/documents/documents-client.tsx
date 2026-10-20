'use client'

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, ImageIcon, Download, Eye, Loader2, Upload,
  Trash2, Plus, AlertCircle, Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DocumentPreviewModal, cn } from '@iha/ui'
import { useTranslations, useLocale } from 'next-intl'
import {
  DOCUMENT_TYPES,
  VISA_DOCUMENT_CATEGORIES,
  UPLOADABLE_VISA_DOCUMENT_CATEGORIES,
  type DocumentType,
  type VisaDocumentCategory,
} from '@iha/validations'
import type { Case } from '@iha/db/types'
import type { SpecialtyLabelMap } from '@iha/db/specialties'
import type { DocumentWithCase } from '@/lib/repositories/cases'
import { uploadDocumentFile } from '@/lib/actions/upload'
import { addPatientDocuments, linkDocumentToCase } from '@/lib/actions/cases'
import { addVisaDocumentsForCase, linkVisaDocumentToCase } from '@/lib/actions/visa'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import { isValidPassportPhotoAspectRatio } from '@/lib/image-dimensions'

// ─── Constants / helpers ──────────────────────────────────────────────────────

// Medical docs only make sense while the case is still under clinical review.
// Lock once a treatment plan is issued and for any terminal status.
const MEDICAL_UPLOAD_LOCKED_STATUSES = new Set([
  'treatment_plan',
  'treatment_confirmed',
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
  'closed',
])

// Visa docs are only relevant once payment is confirmed and before the visa
// lawyer starts processing the application — matches the lock rule on the
// individual visa case detail page (VisaDetailDocuments), where uploads
// close once the submission's own status reaches 'processing' (synced 1:1
// with cases.status becoming 'visa_processing').
const VISA_UPLOAD_LOCKED_STATUSES = new Set([
  'case_submitted',
  'under_review',
  'doctor_assigned',
  'evaluation',
  'treatment_plan',
  'treatment_confirmed',
  'visa_processing',
  'travel_ready',
  'completed',
  'closed',
])

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

type DocTab = 'medical' | 'visa'

function fileIcon(mime: string, cls = 'h-5 w-5') {
  if (mime === 'application/pdf') return <FileText className={`${cls} text-red-500`} />
  return <ImageIcon className={`${cls} text-blue-500`} />
}

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function caseLabel(c: Case, locale: string, specialtyLabelMap: SpecialtyLabelMap) {
  const specialty =
    c.specialty === 'Other' && c.specialty_other
      ? c.specialty_other
      : getSpecialtyLabel(c.specialty, locale, specialtyLabelMap)
  return `${c.reference_number} – ${specialty}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingFile = {
  localId: string
  file_name: string
  file_path: string
  file_size_bytes: number
  mime_type: string
  document_type: string
  status: 'uploading' | 'done' | 'error'
}

type PreviewState = {
  doc: DocumentWithCase
  url: string
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

type UploadPanelProps = {
  cases: Case[]
  activeTab: DocTab
  specialtyLabelMap: SpecialtyLabelMap
  onSaved: () => void
  onCancel: () => void
}

function UploadPanel({ cases, activeTab, specialtyLabelMap, onSaved, onCancel }: UploadPanelProps) {
  const t = useTranslations('documents')
  const tDocTypes = useTranslations('documentTypes')
  const locale = useLocale()

  const lockedStatuses = activeTab === 'medical' ? MEDICAL_UPLOAD_LOCKED_STATUSES : VISA_UPLOAD_LOCKED_STATUSES
  const uploadableCases = cases.filter((c) => !lockedStatuses.has(c.status))

  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [defaultDocType, setDefaultDocType] = useState<string>(
    activeTab === 'medical' ? 'other' : 'passport'
  )
  const [pending, setPending] = useState<PendingFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File): Promise<void> {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(t('toasts.invalidFileType', { name: file.name }))
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('toasts.fileTooLarge', { name: file.name }))
      return
    }
    if (activeTab === 'visa' && defaultDocType === 'passport_photograph' && file.type.startsWith('image/')) {
      const validRatio = await isValidPassportPhotoAspectRatio(file).catch(() => false)
      if (!validRatio) {
        toast.error(t('toasts.invalidPhotoDimensions', { name: file.name }))
        return
      }
    }

    const localId = crypto.randomUUID()
    const bucket = activeTab === 'visa' ? 'visa-documents' : 'case-documents'
    const subPath = activeTab === 'visa'
      ? `${selectedCaseId || 'unlinked'}/${defaultDocType}`
      : 'standalone'

    setPending((prev) => [
      ...prev,
      { localId, file_name: file.name, file_path: '', file_size_bytes: file.size, mime_type: file.type, document_type: defaultDocType, status: 'uploading' },
    ])

    const formData = new FormData()
    formData.set('file', file)
    formData.set('bucket', bucket)
    formData.set('subPath', subPath)
    const result = await uploadDocumentFile(formData)

    if (result.error || !result.data) {
      toast.error(t('toasts.uploadFailed', { name: file.name }))
      setPending((prev) => prev.map((f) => f.localId === localId ? { ...f, status: 'error' } : f))
      return
    }
    const uploaded = result.data
    setPending((prev) => prev.map((f) => f.localId === localId
      ? { ...f, file_path: uploaded.file_path, file_size_bytes: uploaded.file_size_bytes, mime_type: uploaded.mime_type, status: 'done' }
      : f))
  }

  async function handleFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList)
    const available = 10 - pending.filter((f) => f.status === 'done').length
    if (available <= 0) { toast.error(t('toasts.maxDocuments')); return }
    if (arr.length > available) toast.error(t('toasts.tooManyFiles', { available }))
    await Promise.all(arr.slice(0, available).map(uploadFile))
  }

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    await handleFiles(e.dataTransfer.files)
  }, [pending, selectedCaseId, defaultDocType])

  async function handleSave() {
    const doneDocs = pending.filter((f) => f.status === 'done')
    if (!doneDocs.length) return
    setIsSaving(true)
    const result = activeTab === 'visa'
      ? await addVisaDocumentsForCase(
          selectedCaseId || null,
          doneDocs.map((f) => ({
            category: f.document_type,
            fileName: f.file_name,
            filePath: f.file_path,
            fileSizeBytes: f.file_size_bytes,
            mimeType: f.mime_type,
          })),
        )
      : await addPatientDocuments(
          doneDocs.map((f) => ({
            localId: f.localId,
            file_name: f.file_name,
            file_path: f.file_path,
            file_size_bytes: f.file_size_bytes,
            mime_type: f.mime_type,
            document_type: f.document_type as DocumentType,
            document_category: activeTab,
          })),
          selectedCaseId || null,
        )
    setIsSaving(false)
    if (result.error) { toast.error(result.error, { duration: Infinity }); return }
    toast.success(t('toasts.uploadSuccess', { count: doneDocs.length }))
    onSaved()
  }

  const doneDocs = pending.filter((f) => f.status === 'done')
  const hasUploading = pending.some((f) => f.status === 'uploading')

  const typeOptions = activeTab === 'medical'
    ? DOCUMENT_TYPES.map((dt) => ({ value: dt, label: tDocTypes(dt) }))
    : UPLOADABLE_VISA_DOCUMENT_CATEGORIES.map((vc) => ({ value: vc, label: t(`visaDocCategories.${vc}` as never) }))

  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{t('uploadPanel.title')}</h2>
        <button
          onClick={() => { setPending([]); onCancel() }}
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          {t('uploadPanel.cancel')}
        </button>
      </div>

      {/* Default document type */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-slate-700">
          {activeTab === 'medical' ? t('uploadPanel.defaultDocumentType') : t('uploadPanel.defaultVisaCategory')}
        </label>
        <Select value={defaultDocType} onValueChange={(v) => { setDefaultDocType(v); setPending([]) }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Optional case selector — files can be uploaded unlinked and
          attached to a case later from the table, same for both tabs */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-slate-700">
          {t('uploadPanel.linkToCase')}
        </label>
        {uploadableCases.length === 0 ? (
          <p className="text-xs text-slate-400">{t('uploadPanel.noCasesAvailable')}</p>
        ) : (
          <Select
            value={selectedCaseId}
            onValueChange={(value) => { setSelectedCaseId(value === '__none__' ? '' : value); setPending([]) }}
          >
            <SelectTrigger className={cn(!selectedCaseId && 'text-muted-foreground')}>
              <SelectValue placeholder={t('uploadPanel.noCase')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('uploadPanel.noCase')}</SelectItem>
              {uploadableCases.map((c) => (
                <SelectItem key={c.id} value={c.id}>{caseLabel(c, locale, specialtyLabelMap)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`mb-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
          dragging
            ? 'border-cyan-400 bg-cyan-50'
            : 'border-slate-200 bg-slate-50 hover:border-cyan-300 hover:bg-cyan-50/40'
        }`}
      >
        <Upload className="h-6 w-6 text-slate-400" />
        <p className="text-xs font-medium text-slate-600">{t('uploadPanel.dropOrBrowse')}</p>
        <p className="flex items-center gap-1 text-xs text-slate-400">
          <AlertCircle className="h-3 w-3" />
          {t('uploadPanel.allowedTypes')}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={async (e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.files) { await handleFiles(e.target.files); e.target.value = '' }
          }}
        />
      </div>

      {pending.length > 0 && (
        <ul className="mb-4 space-y-2">
          {pending.map((f) => (
            <li key={f.localId} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              {f.status === 'uploading'
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />
                : fileIcon(f.mime_type, 'h-4 w-4')
              }
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">{f.file_name}</p>
                <p className="text-[11px] text-slate-400">{formatBytes(f.file_size_bytes)}</p>
              </div>
              {f.status === 'error' && <span className="text-xs text-red-500">{t('uploadPanel.failed')}</span>}
              <button
                type="button"
                onClick={() => setPending((prev) => prev.filter((p) => p.localId !== f.localId))}
                disabled={f.status === 'uploading'}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={doneDocs.length === 0 || hasUploading}
          loading={isSaving}
          className="bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {doneDocs.length > 0 ? t('uploadPanel.saveWithCount', { count: doneDocs.length }) : t('uploadPanel.save')}
        </Button>
      </div>
    </div>
  )
}

// ─── Link to Case Dialog ──────────────────────────────────────────────────────

type LinkDialogProps = {
  doc: DocumentWithCase | null
  cases: Case[]
  activeTab: DocTab
  specialtyLabelMap: SpecialtyLabelMap
  onClose: () => void
  onLinked: () => void
}

function LinkCaseDialog({ doc, cases, activeTab, specialtyLabelMap, onClose, onLinked }: LinkDialogProps) {
  const t = useTranslations('documents')
  const locale = useLocale()
  const [linkCaseId, setLinkCaseId] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const lockedStatuses = activeTab === 'medical' ? MEDICAL_UPLOAD_LOCKED_STATUSES : VISA_UPLOAD_LOCKED_STATUSES
  const linkableCases = cases.filter((c) => !lockedStatuses.has(c.status))

  async function handleSave() {
    if (!doc || !linkCaseId) return
    setIsSaving(true)
    const result = doc.origin === 'visa_documents'
      ? await linkVisaDocumentToCase(doc.id, linkCaseId)
      : await linkDocumentToCase(doc.id, linkCaseId)
    setIsSaving(false)
    if (result.error) { toast.error(result.error); return }
    toast.success(t('toasts.linkSuccess'))
    onClose()
    onLinked()
  }

  function handleOpenChange(open: boolean) {
    if (!open) { setLinkCaseId(''); onClose() }
  }

  return (
    <Dialog open={doc !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-xl rounded-2xl bg-white p-0 shadow-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('linkDoc')}</DialogTitle>
        </DialogHeader>
        {doc && (
          <>
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">{t('linkDoc')}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t('linkDocSubtitle')}</p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                {fileIcon(doc.mime_type, 'h-4 w-4 shrink-0')}
                <p className="min-w-0 truncate text-sm font-medium text-slate-700">{doc.file_name}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">{t('tableCase')}</label>
                <Select value={linkCaseId} onValueChange={setLinkCaseId}>
                  <SelectTrigger className={cn(!linkCaseId && 'text-muted-foreground')}>
                    <SelectValue placeholder={t('selectCase')} />
                  </SelectTrigger>
                  <SelectContent>
                    {linkableCases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{caseLabel(c, locale, specialtyLabelMap)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={isSaving} className="text-slate-600">
                {t('uploadPanel.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!linkCaseId}
                loading={isSaving}
                className="bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {t('saveLink')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Documents Table ──────────────────────────────────────────────────────────

type TableProps = {
  documents: DocumentWithCase[]
  cases: Case[]
  activeTab: DocTab
  specialtyLabelMap: SpecialtyLabelMap
  onPreview: (doc: DocumentWithCase) => void
  onDownload: (doc: DocumentWithCase) => void
  onLinked: () => void
}

function DocumentsTable({ documents, cases, activeTab, specialtyLabelMap, onPreview, onDownload, onLinked }: TableProps) {
  const t = useTranslations('documents')
  const tDocTypes = useTranslations('documentTypes')
  const locale = useLocale()
  const [linkingDoc, setLinkingDoc] = useState<DocumentWithCase | null>(null)

  const lockedStatuses = activeTab === 'medical' ? MEDICAL_UPLOAD_LOCKED_STATUSES : VISA_UPLOAD_LOCKED_STATUSES
  const linkableCases = cases.filter((c) => !lockedStatuses.has(c.status))

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <FileText className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">
          {activeTab === 'medical' ? t('noMedicalDocs') : t('noVisaDocs')}
        </p>
        <p className="mt-1 text-xs text-slate-400">{t('noDocsSubtext')}</p>
      </div>
    )
  }

  function docTypeLabel(doc: DocumentWithCase) {
    if (doc.document_category === 'visa') {
      const key = `visaDocCategories.${doc.document_type}` as never
      return VISA_DOCUMENT_CATEGORIES.includes(doc.document_type as VisaDocumentCategory)
        ? t(key)
        : doc.document_type
    }
    return tDocTypes.has(doc.document_type) ? tDocTypes(doc.document_type as never) : doc.document_type
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                <th className="px-5 py-3">{t('tableFile')}</th>
                <th className="px-4 py-3">{t('tableType')}</th>
                <th className="px-4 py-3">{t('tableCase')}</th>
                <th className="px-4 py-3">{t('tableUploaded')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-slate-100 last:border-0 transition hover:bg-slate-50/50"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {fileIcon(doc.mime_type)}
                      <div>
                        <p className="max-w-[200px] truncate font-medium text-slate-800">{doc.file_name}</p>
                        <p className="text-[11px] text-slate-400">{formatBytes(doc.file_size_bytes)}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-slate-600">{docTypeLabel(doc)}</td>

                  <td className="px-4 py-3.5">
                    {doc.case_id && doc.reference_number ? (
                      <Link href={`/cases/${doc.case_id}`} className="group">
                        <span className="text-xs font-semibold text-cyan-700 group-hover:underline">
                          {doc.reference_number}
                        </span>
                        <p className="text-[11px] text-slate-400">
                          {doc.case_specialty
                            ? getSpecialtyLabel(doc.case_specialty, locale, specialtyLabelMap)
                            : ''}
                        </p>
                      </Link>
                    ) : linkableCases.length > 0 ? (
                      <button
                        onClick={() => setLinkingDoc(doc)}
                        className="flex items-center gap-1 rounded-md bg-cyan-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-cyan-700"
                      >
                        <Link2 className="h-3 w-3" />
                        {t('linkDoc')}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{t('notLinked')}</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-slate-500 tabular-nums">
                    {formatDate(doc.uploaded_at)}
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPreview(doc)}
                        className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t('preview')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownload(doc)}
                        className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('download')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LinkCaseDialog
        doc={linkingDoc}
        cases={cases}
        activeTab={activeTab}
        specialtyLabelMap={specialtyLabelMap}
        onClose={() => setLinkingDoc(null)}
        onLinked={onLinked}
      />
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = {
  documents: DocumentWithCase[]
  cases: Case[]
  specialtyLabelMap: SpecialtyLabelMap
}

export function DocumentsClient({ documents, cases, specialtyLabelMap }: Props) {
  const router = useRouter()
  const t = useTranslations('documents')
  const [activeTab, setActiveTab] = useState<DocTab>('medical')
  const [showUpload, setShowUpload] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const medicalDocs = documents.filter((d) => (d.document_category ?? 'medical') === 'medical')
  const visaDocs = documents.filter((d) => d.document_category === 'visa')
  const activeDocs = activeTab === 'medical' ? medicalDocs : visaDocs

  function documentUrl(doc: DocumentWithCase, download: boolean) {
    const base = doc.origin === 'visa_documents' ? `/api/documents/visa/${doc.id}` : `/api/documents/${doc.id}`
    return download ? `${base}?download=1` : base
  }

  function handlePreview(doc: DocumentWithCase) {
    setPreview({ doc, url: documentUrl(doc, false) })
  }

  function handleDownload(doc: DocumentWithCase) {
    const a = document.createElement('a')
    a.href = documentUrl(doc, true)
    a.download = doc.file_name
    a.click()
  }

  function handleSaved() {
    setShowUpload(false)
    router.refresh()
  }

  function handleTabChange(tab: DocTab) {
    setActiveTab(tab)
    setShowUpload(false)
  }

  return (
    <>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
          </div>
          <Button
            onClick={() => setShowUpload(true)}
            className="shrink-0 bg-cyan-600 text-white hover:bg-cyan-700 sm:self-start"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('uploadDocuments')}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200">
          {(['medical', 'visa'] as DocTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                'px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {tab === 'medical' ? t('tabs.medical') : t('tabs.visa')}
              <span className={cn(
                'ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                activeTab === tab ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500',
              )}>
                {tab === 'medical' ? medicalDocs.length : visaDocs.length}
              </span>
            </button>
          ))}
        </div>

        {/* Documents table */}
        <DocumentsTable
          documents={activeDocs}
          cases={cases}
          activeTab={activeTab}
          specialtyLabelMap={specialtyLabelMap}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onLinked={() => router.refresh()}
        />
      </div>

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={(open) => { if (!open) setShowUpload(false) }}>
        <DialogContent className="w-full max-w-lg rounded-2xl bg-white p-0 shadow-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('uploadDocuments')}</DialogTitle>
          </DialogHeader>
          <UploadPanel
            cases={cases}
            activeTab={activeTab}
            specialtyLabelMap={specialtyLabelMap}
            onSaved={handleSaved}
            onCancel={() => setShowUpload(false)}
          />
        </DialogContent>
      </Dialog>

      {preview && (
        <DocumentPreviewModal
          fileName={preview.doc.file_name}
          mimeType={preview.doc.mime_type}
          url={preview.url}
          onClose={() => setPreview(null)}
          openInNewTabLabel={t('openInTab')}
          headerExtra={
            preview.doc.case_id && preview.doc.reference_number ? (
              <Link
                href={`/cases/${preview.doc.case_id}`}
                onClick={() => setPreview(null)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300 transition hover:bg-white/20"
              >
                {preview.doc.reference_number}
              </Link>
            ) : undefined
          }
        />
      )}
    </>
  )
}
