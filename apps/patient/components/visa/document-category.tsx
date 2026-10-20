'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, ImageIcon, Download, Loader2, Upload, AlertCircle } from 'lucide-react'
import type { VisaDocumentRow } from '@iha/db/visa'

type Props = {
  categoryKey: string
  label: string
  description: string
  documents: VisaDocumentRow[]
  isLocked: boolean
  isUploading: boolean
  hasLawyerRequest: boolean
  onUpload: (file: File) => void
  onDownload: (filePath: string, fileName: string) => void
  noBorder?: boolean
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
  return <ImageIcon className="h-4 w-4 text-blue-500" />
}

export function DocumentCategory({
  categoryKey,
  label,
  description,
  documents,
  isLocked,
  isUploading,
  hasLawyerRequest,
  onUpload,
  onDownload,
  noBorder = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleDownload(doc: VisaDocumentRow) {
    setDownloadingId(doc.id)
    await onDownload(doc.file_path, doc.file_name)
    setDownloadingId(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
      e.target.value = ''
    }
  }

  const lawyerBorder = hasLawyerRequest ? 'border-l-4 border-l-amber-400' : ''
  const wrapClass = noBorder ? '' : `rounded-xl border border-slate-200 bg-white overflow-hidden ${lawyerBorder}`

  return (
    <div className={wrapClass}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          {hasLawyerRequest && (
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{label}</p>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {documents.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {documents.length}
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Accordion body */}
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {hasLawyerRequest && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span className="font-semibold">Requested by your visa lawyer.</span>{' '}
              Please upload the required document for this category.
            </div>
          )}

          {/* File list */}
          {documents.length > 0 ? (
            <ul className="mb-3 divide-y divide-slate-50">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2">
                  <FileIcon mimeType={doc.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{doc.file_name}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(doc.uploaded_at)}
                      {doc.file_size_bytes ? ` · ${formatBytes(doc.file_size_bytes)}` : ''}
                      {doc.requested_by_lawyer && (
                        <span className="ml-1.5 text-amber-600">· Requested by lawyer</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                    aria-label={`Download ${doc.file_name}`}
                  >
                    {downloadingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-slate-400">No documents uploaded yet.</p>
          )}

          {/* Upload button */}
          {!isLocked && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Upload Document
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
