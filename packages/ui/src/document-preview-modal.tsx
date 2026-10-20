'use client'

import type { ReactNode } from 'react'
import { ExternalLink, FileText, ImageIcon, X } from 'lucide-react'

export type DocumentPreviewModalProps = {
  fileName: string
  mimeType: string
  url: string
  onClose: () => void
  /** Extra content rendered next to the filename in the header, e.g. a linked case badge. */
  headerExtra?: ReactNode
  openInNewTabLabel?: string
}

export function DocumentPreviewModal({
  fileName,
  mimeType,
  url,
  onClose,
  headerExtra,
  openInNewTabLabel = 'Open in new tab',
}: DocumentPreviewModalProps) {
  const isPdf = mimeType === 'application/pdf'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-900 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {isPdf ? (
            <FileText className="h-4 w-4 shrink-0 text-red-400" />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0 text-blue-400" />
          )}
          <span className="truncate text-sm font-medium text-white">{fileName}</span>
          {headerExtra}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {openInNewTabLabel}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-6">
        {isPdf ? (
          <iframe src={url} title={fileName} className="h-full w-full rounded-lg bg-white shadow-2xl" />
        ) : (
          <img src={url} alt={fileName} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        )}
      </div>
    </div>
  )
}
