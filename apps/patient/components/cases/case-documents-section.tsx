'use client'

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, ImageIcon, Download, Loader2, Upload, Trash2, Plus, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@iha/ui'
import { DOCUMENT_TYPES, type DocumentType } from '@iha/validations'
import type { CaseDocument } from '@iha/db/types'
import { addDocumentsToCase } from '@/lib/actions/cases'
import { uploadDocumentFile } from '@/lib/actions/upload'

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

type PendingFile = {
  localId: string
  file_name: string
  file_path: string
  file_size_bytes: number
  mime_type: string
  document_type: DocumentType
  status: 'uploading' | 'done' | 'error'
}

function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  return <ImageIcon className="h-5 w-5 text-blue-500" />
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function DownloadButton({ doc }: { doc: CaseDocument }) {
  const t = useTranslations('caseDocuments')

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 text-xs text-slate-600"
    >
      <a href={`/api/documents/${doc.id}?download=1`} download={doc.file_name}>
        <Download className="h-3.5 w-3.5" />
        {t('download')}
      </a>
    </Button>
  )
}

const UPLOAD_LOCKED_STATUSES = new Set([
  'treatment_plan',
  'treatment_confirmed',
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
  'completed',
])

type Props = {
  documents: CaseDocument[]
  caseId: string
  caseStatus: string
}

export function CaseDocumentsSection({ documents, caseId, caseStatus }: Props) {
  const uploadLocked = UPLOAD_LOCKED_STATUSES.has(caseStatus)
  const router = useRouter()
  const t = useTranslations('caseDocuments')
  const tDocTypes = useTranslations('documentTypes')
  const tUpload = useTranslations('documentUpload')
  const [showUpload, setShowUpload] = useState(false)
  const [pending, setPending] = useState<PendingFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File): Promise<void> {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(tUpload('unsupportedFormat', { fileName: file.name }))
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(tUpload('fileTooLarge', { fileName: file.name }))
      return
    }

    const localId = crypto.randomUUID()

    setPending((prev) => [
      ...prev,
      { localId, file_name: file.name, file_path: '', file_size_bytes: file.size, mime_type: file.type, document_type: 'other', status: 'uploading' },
    ])

    const formData = new FormData()
    formData.set('file', file)
    formData.set('bucket', 'case-documents')
    const result = await uploadDocumentFile(formData)

    if (result.error || !result.data) {
      toast.error(tUpload('uploadFailed', { fileName: file.name }))
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
    const totalDone = documents.length + pending.filter((f) => f.status === 'done').length
    const available = 10 - totalDone
    if (available <= 0) {
      toast.error(tUpload('maxDocumentsPerCase', { max: 10 }))
      return
    }
    if (arr.length > available) toast.error(tUpload('remainingSlots', { count: available }))
    await Promise.all(arr.slice(0, available).map(uploadFile))
  }

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    await handleFiles(e.dataTransfer.files)
  }, [pending, documents.length])

  async function handleSave() {
    const doneDocs = pending.filter((f) => f.status === 'done')
    if (!doneDocs.length) return

    setIsSaving(true)
    const result = await addDocumentsToCase(caseId, doneDocs)
    setIsSaving(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }

    toast.success(tUpload('documentsAdded', { count: doneDocs.length }))
    setPending([])
    setShowUpload(false)
    router.refresh()
  }

  const doneDocs = pending.filter((f) => f.status === 'done')
  const hasUploading = pending.some((f) => f.status === 'uploading')

  return (
    <div className="space-y-4">
      {/* Existing documents table */}
      {documents.length === 0 && !showUpload ? (
        <p className="text-sm text-slate-400">{t('noDocuments')}</p>
      ) : documents.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="pb-2 pr-4">{t('fileName')}</th>
                <th className="pb-2 pr-4">{t('documentType')}</th>
                <th className="pb-2 pr-4">{t('uploaded')}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {fileIcon(doc.mime_type)}
                      <span className="max-w-[200px] truncate font-medium text-slate-800">{doc.file_name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {tDocTypes(doc.document_type as DocumentType)}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{formatDate(doc.uploaded_at)}</td>
                  <td className="py-3"><DownloadButton doc={doc} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Inline upload section */}
      {showUpload ? (
        <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
              dragging
                ? 'border-cyan-400 bg-cyan-50'
                : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40'
            }`}
          >
            <Upload className="h-6 w-6 text-slate-400" />
            <p className="text-xs font-medium text-slate-600">{t('dropOrBrowse')}</p>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <AlertCircle className="h-3 w-3" />
              {t('maxSize')}
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

          {/* Pending file list */}
          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((f) => (
                <li key={f.localId} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  {f.status === 'uploading'
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />
                    : fileIcon(f.mime_type)
                  }
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800">{f.file_name}</p>
                  </div>
                  {f.status === 'done' && (
                    <Select
                      value={f.document_type}
                      onValueChange={(value) =>
                        setPending((prev) =>
                          prev.map((p) => p.localId === f.localId ? { ...p, document_type: value as DocumentType } : p)
                        )
                      }
                    >
                      <SelectTrigger className="h-7 w-auto gap-1 px-2 py-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((dt) => (
                          <SelectItem key={dt} value={dt}>{tDocTypes(dt)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {f.status === 'error' && <span className="text-xs text-red-500">{t('uploadFailed')}</span>}
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

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setShowUpload(false); setPending([]) }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {t('cancel')}
            </button>
            <Button
              onClick={handleSave}
              disabled={doneDocs.length === 0 || hasUploading}
              loading={isSaving}
              className="h-8 bg-cyan-600 px-3 text-xs text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {`${t('save')}${doneDocs.length > 0 ? ` (${doneDocs.length})` : ''}`}
            </Button>
          </div>
        </div>
      ) : !uploadLocked ? (
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 hover:text-cyan-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('addDocuments')}
        </button>
      ) : (
        <p className="text-xs text-slate-400">{t('uploadLocked')}</p>
      )}
    </div>
  )
}
