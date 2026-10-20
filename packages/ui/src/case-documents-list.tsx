'use client'

import { useState } from 'react'
import { FileText, ImageIcon, Eye, Download } from 'lucide-react'
import { DocumentPreviewModal } from './document-preview-modal'
import type { CaseDocument } from '@iha/db/types'

function fileIcon(mime: string) {
  if (mime === 'application/pdf') {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-red-100 text-red-600">
        <FileText className="h-5 w-5" />
      </div>
    )
  }
  if (mime.startsWith('image/')) {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-600">
        <ImageIcon className="h-4.5 w-4.5" />
      </div>
    )
  }
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-600">
      <FileText className="h-4.5 w-4.5" />
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}b`
  return `${Math.round(bytes / 1024)}kb`
}

export function CaseDocumentsList({ documents }: { documents: CaseDocument[] }) {
  const [previewDoc, setPreviewDoc] = useState<CaseDocument | null>(null)

  if (documents.length === 0) {
    return <p className="text-sm text-slate-400">No documents have been uploaded for this case yet.</p>
  }

  return (
    <>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
            <div className="flex items-center gap-3 overflow-hidden">
              {fileIcon(doc.mime_type)}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{doc.file_name}</p>
                <p className="text-xs text-slate-400">{formatFileSize(doc.file_size_bytes)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewDoc(doc)}
                aria-label={`View ${doc.file_name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <Eye className="h-4 w-4" />
              </button>
              <a
                href={`/api/documents/${doc.id}?download=1`}
                download={doc.file_name}
                aria-label={`Download ${doc.file_name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          fileName={previewDoc.file_name}
          mimeType={previewDoc.mime_type}
          url={`/api/documents/${previewDoc.id}`}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  )
}
