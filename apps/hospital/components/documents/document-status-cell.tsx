'use client'

import { useState } from 'react'
import { Download, Eye, Loader2, Send } from 'lucide-react'
import { Button, Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@iha/ui'
import type { HospitalGeneratedDocument, HospitalLetterType } from '@iha/db/visa'
import { useHospitalLetter } from '@/components/cases/use-hospital-letter'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  caseId: string
  documentType: HospitalLetterType
  label: string
  initialDocument: HospitalGeneratedDocument | null
}

/** Compact per-cell version of LetterCard for the Documents list page, where
 * many cases are shown at once — status + icon actions instead of a full
 * card, preview opens in a modal instead of inline. */
export function DocumentStatusCell({ caseId, documentType, label, initialDocument }: Props) {
  const { current, generating, sending, loadingUrl, generate, loadPreviewUrl, download, send } = useHospitalLetter(
    caseId,
    documentType,
    label,
    initialDocument,
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)

  async function handlePreview() {
    const url = await loadPreviewUrl()
    if (!url) return
    setPreviewUrl(url)
    setPreviewOpen(true)
  }

  async function handleSend() {
    const ok = await send()
    if (ok) setShowSendConfirm(false)
  }

  if (!current) {
    return (
      <Button size="sm" variant="outline" loading={generating} onClick={generate}>
        Generate
      </Button>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            current.sent_to_patient_at ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {current.sent_to_patient_at ? 'Sent' : 'Generated'}
        </span>
        <span className="text-[11px] text-slate-400">{formatDate(current.uploaded_at)}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Preview"
          onClick={handlePreview}
          disabled={loadingUrl === 'preview'}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {loadingUrl === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          title="Download"
          onClick={download}
          disabled={loadingUrl === 'download'}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {loadingUrl === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
        {!current.sent_to_patient_at && (
          <button
            type="button"
            title="Send to Patient"
            onClick={() => setShowSendConfirm(true)}
            className="rounded p-1 text-cyan-600 hover:bg-cyan-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-full max-w-3xl rounded-xl bg-white p-4">
          <DialogCloseButton />
          <DialogTitle className="text-sm font-semibold text-slate-900">{label}</DialogTitle>
          {previewUrl && (
            <iframe
              src={previewUrl}
              title={`${label} preview`}
              className="mt-2 h-[75vh] w-full rounded border border-slate-200"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSendConfirm} onOpenChange={(open) => !sending && setShowSendConfirm(open)}>
        <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
          <DialogCloseButton />
          <DialogTitle className="text-base font-semibold text-slate-900">Send {label} to patient</DialogTitle>
          <p className="mt-1 text-sm text-slate-500">
            This makes the document visible in the patient&apos;s Visa &amp; Travel section and notifies them by
            email/SMS.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowSendConfirm(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={sending}
              onClick={handleSend}
              className="bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Send to Patient
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
