'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import type { HospitalGeneratedDocument, HospitalLetterType } from '@iha/db/visa'
import { generateVisaDocumentSignedUrl } from '@/lib/actions/visa'

const LETTER_TYPES: Array<{ type: HospitalLetterType; labelKey: 'hospitalInvitationLetter' | 'appointmentConfirmationLetter' }> = [
  { type: 'hospital_invitation', labelKey: 'hospitalInvitationLetter' },
  { type: 'appointment_confirmation', labelKey: 'appointmentConfirmationLetter' },
]

type Props = {
  documents: HospitalGeneratedDocument[]
}

export function CaseLettersSection({ documents }: Props) {
  const t = useTranslations('caseDetail')
  const byType = new Map(documents.map((d) => [d.category, d]))
  const [downloading, setDownloading] = useState<string | null>(null)

  async function handleDownload(doc: HospitalGeneratedDocument) {
    setDownloading(doc.id)
    const { data, error } = await generateVisaDocumentSignedUrl(doc.file_path)
    setDownloading(null)
    if (error || !data?.url) {
      toast.error(t('letterDownloadFailed'))
      return
    }
    const a = window.document.createElement('a')
    a.href = data.url
    a.download = doc.file_name
    a.click()
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {LETTER_TYPES.map(({ type, labelKey }) => {
        const doc = byType.get(type)
        return (
          <div key={type} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{t(labelKey)}</p>
              {!doc && <p className="text-xs text-slate-400">{t('letterPendingDesc')}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  doc ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {doc ? t('letterStatusGenerated') : t('letterStatusPending')}
              </span>
              {doc && (
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-cyan-600 hover:bg-cyan-50 disabled:opacity-50"
                >
                  {downloading === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t('letterDownload')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
