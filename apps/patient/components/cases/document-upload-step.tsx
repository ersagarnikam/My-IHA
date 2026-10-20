'use client'

import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { FileText, ImageIcon, Loader2, Trash2, Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@iha/ui'
import { DOCUMENT_TYPES, type DocumentType, type SubmittedDocument } from '@iha/validations'
import { uploadDocumentFile } from '@/lib/actions/upload'

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 10

type UploadedFile = SubmittedDocument & { status: 'uploading' | 'done' | 'error' }

type Props = {
  defaultFiles?: UploadedFile[]
  onNext: (docs: SubmittedDocument[]) => void
  onBack: () => void
}

function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  return <ImageIcon className="h-5 w-5 text-blue-500" />
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentUploadStep({ defaultFiles = [], onNext, onBack }: Props) {
  const t = useTranslations('caseWizard.documentUpload')
  const tDocTypes = useTranslations('documentTypes')
  const tUpload = useTranslations('documentUpload')
  const [files, setFiles] = useState<UploadedFile[]>(defaultFiles)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File): Promise<UploadedFile | null> {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(tUpload('unsupportedFormat', { fileName: file.name }))
      return null
    }
    if (file.size > MAX_BYTES) {
      toast.error(tUpload('fileTooLarge', { fileName: file.name }))
      return null
    }

    const localId = crypto.randomUUID()

    const staged: UploadedFile = {
      localId,
      file_name: file.name,
      file_path: '',
      file_size_bytes: file.size,
      mime_type: file.type,
      document_type: 'other',
      status: 'uploading',
    }

    setFiles((prev) => [...prev, staged])

    const formData = new FormData()
    formData.set('file', file)
    formData.set('bucket', 'case-documents')
    const result = await uploadDocumentFile(formData)

    if (result.error || !result.data) {
      toast.error(tUpload('uploadFailed', { fileName: file.name }), { duration: Infinity })
      setFiles((prev) => prev.map((f) => f.localId === localId ? { ...f, status: 'error' } : f))
      return null
    }

    const uploaded = result.data
    const done: UploadedFile = {
      ...staged,
      file_path: uploaded.file_path,
      file_size_bytes: uploaded.file_size_bytes,
      mime_type: uploaded.mime_type,
      status: 'done',
    }
    setFiles((prev) => prev.map((f) => f.localId === localId ? done : f))
    return done
  }

  async function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList)
    const currentDone = files.filter((f) => f.status === 'done').length
    const available = MAX_FILES - currentDone
    if (available <= 0) {
      toast.error(tUpload('maxDocuments', { max: MAX_FILES }))
      return
    }
    const toUpload = arr.slice(0, available)
    if (arr.length > available) {
      toast.error(tUpload('remainingSlots', { count: available }))
    }
    await Promise.all(toUpload.map(uploadFile))
  }

  function removeFile(localId: string) {
    setFiles((prev) => prev.filter((f) => f.localId !== localId))
  }

  function updateDocType(localId: string, docType: DocumentType) {
    setFiles((prev) => prev.map((f) => f.localId === localId ? { ...f, document_type: docType } : f))
  }

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      await addFiles(e.dataTransfer.files)
    },
    [files],
  )

  const handleInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(e.target.files)
      e.target.value = ''
    }
  }

  const doneDocs = files.filter((f) => f.status === 'done')
  const hasUploading = files.some((f) => f.status === 'uploading')
  const canProceed = doneDocs.length >= 1 && !hasUploading

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 transition ${
          dragging
            ? 'border-cyan-400 bg-cyan-50'
            : 'border-slate-300 bg-slate-50 hover:border-cyan-400 hover:bg-cyan-50/40'
        }`}
      >
        <Upload className="h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-600">
          {t('dragDrop')}
        </p>
        <p className="flex items-center gap-1 text-xs text-slate-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {t('allowedTypes')}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.localId}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                {f.status === 'uploading' ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-cyan-500" />
                ) : (
                  fileIcon(f.mime_type)
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{f.file_name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(f.file_size_bytes)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                {f.status === 'done' && (
                  <Select value={f.document_type} onValueChange={(value) => updateDocType(f.localId, value as DocumentType)}>
                    <SelectTrigger className="h-7 flex-1 gap-1 px-2 py-1 text-xs sm:flex-initial">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt}>{tDocTypes(dt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {f.status === 'error' && (
                  <span className="text-xs text-red-500">{t('uploadFailed')}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.localId)}
                  disabled={f.status === 'uploading'}
                  className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          {t('prev')}
        </Button>
        <Button
          onClick={() => onNext(doneDocs)}
          disabled={!canProceed}
          loading={hasUploading}
          className="bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
