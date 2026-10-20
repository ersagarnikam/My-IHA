'use client'

import { useState } from 'react'
import { Eye, FileText } from 'lucide-react'
import { DocumentPreviewModal } from '@iha/ui'
import type { VisaDocumentRow } from '@iha/db/visa'
import { getDocumentCategoryLabel } from '@/components/cases/document-category-labels'

export type VisaDocumentWithUrl = VisaDocumentRow & { signedUrl: string | null }

export function VisaDocumentsList({ documents }: { documents: VisaDocumentWithUrl[] }) {
  const [previewDoc, setPreviewDoc] = useState<VisaDocumentWithUrl | null>(null)

  return (
    <>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-cyan-200 hover:bg-cyan-50/30"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{getDocumentCategoryLabel(doc.category)}</p>
                <p className="truncate text-xs text-slate-400">{doc.file_name}</p>
              </div>
            </div>
            {doc.signedUrl ? (
              <button
                type="button"
                onClick={() => setPreviewDoc(doc)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-200 bg-white px-3 text-xs font-medium text-cyan-700 shadow-sm hover:bg-cyan-50"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            ) : (
              <span className="text-xs text-red-500">Unavailable</span>
            )}
          </div>
        ))}
      </div>

      {previewDoc && previewDoc.signedUrl && (
        <DocumentPreviewModal
          fileName={previewDoc.file_name}
          mimeType={previewDoc.mime_type ?? ''}
          url={previewDoc.signedUrl}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  )
}
