'use client'

import { useState } from 'react'
import { Download, Eye, EyeOff, FileText, Loader2, Send } from 'lucide-react'
import { Button, Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@iha/ui'
import type { HospitalGeneratedDocument, HospitalLetterType } from '@iha/db/visa'
import { useHospitalLetter } from './use-hospital-letter'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  caseId: string
  documentType: HospitalLetterType
  label: string
  initialDocument: HospitalGeneratedDocument | null
}

export function LetterCard({ caseId, documentType, label, initialDocument }: Props) {
  const { current, generating, sending, loadingUrl, generate, loadPreviewUrl, download, send } = useHospitalLetter(
    caseId,
    documentType,
    label,
    initialDocument,
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showSendConfirm, setShowSendConfirm] = useState(false)

  async function handlePreview() {
    if (previewUrl) {
      setPreviewUrl(null)
      return
    }
    const url = await loadPreviewUrl()
    if (url) setPreviewUrl(url)
  }

  async function handleSend() {
    const ok = await send()
    if (ok) setShowSendConfirm(false)
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm font-semibold text-slate-900">{label}</p>
        </div>
        {!current && (
          <Button
            size="sm"
            loading={generating}
            onClick={generate}
            className="w-full shrink-0 bg-cyan-600 text-white hover:bg-cyan-700 sm:w-auto"
          >
            Generate {label}
          </Button>
        )}
      </div>

      {current && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-400">Generated {formatDate(current.uploaded_at)}</p>

          {previewUrl && (
            <iframe
              src={previewUrl}
              title={`${label} preview`}
              className="h-[85vh] w-full rounded border border-slate-200"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handlePreview} disabled={loadingUrl === 'preview'}>
              {loadingUrl === 'preview' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : previewUrl ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {previewUrl ? 'Hide Preview' : 'Preview'}
            </Button>
            <Button size="sm" variant="outline" onClick={download} disabled={loadingUrl === 'download'}>
              {loadingUrl === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </Button>

            {current.sent_to_patient_at ? (
              <span className="text-xs font-medium text-emerald-600">Sent to patient on {formatDate(current.sent_to_patient_at)}</span>
            ) : (
              <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-700" onClick={() => setShowSendConfirm(true)}>
                <Send className="h-3.5 w-3.5" />
                Send to Patient
              </Button>
            )}
          </div>
        </div>
      )}

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
