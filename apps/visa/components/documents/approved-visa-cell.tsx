'use client'

import { useState } from 'react'
import { Eye, RefreshCw, Upload } from 'lucide-react'
import { DocumentPreviewModal, Button } from '@iha/ui'
import type { LawyerIssuedDocument } from '@iha/db/visa'
import { UploadApprovedVisaDialog } from './upload-approved-visa-dialog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  caseId: string
  patientName: string
  document: (LawyerIssuedDocument & { signedUrl: string | null }) | null
}

export function ApprovedVisaCell({ caseId, patientName, document }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!document) {
    return (
      <UploadApprovedVisaDialog
        caseId={caseId}
        patientName={patientName}
        trigger={
          <Button size="sm" className="bg-cyan-700 text-white hover:bg-cyan-800">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-1.5">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
          Uploaded
        </span>
        <span className="text-[11px] text-slate-400">{formatDate(document.uploaded_at)}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Preview"
          onClick={() => setPreviewOpen(true)}
          disabled={!document.signedUrl}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <UploadApprovedVisaDialog
          caseId={caseId}
          patientName={patientName}
          trigger={
            <button type="button" title="Replace" className="rounded p-1 text-cyan-600 hover:bg-cyan-50">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>

      {previewOpen && document.signedUrl && (
        <DocumentPreviewModal
          fileName={document.file_name}
          mimeType={document.mime_type ?? ''}
          url={document.signedUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
