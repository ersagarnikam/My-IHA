'use client'

import { useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { generateVisaDocumentSignedUrl } from '@/lib/actions/visa'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type Props = {
  document: {
    file_name: string
    file_path: string
    uploaded_at: string
  }
}

// Highlighted call-to-action for the lawyer-issued approved visa — shown at
// the top of both the case detail page and the visa detail page so this
// document isn't lost among the rest of the visa paperwork.
export function ApprovedVisaBanner({ document }: Props) {
  const t = useTranslations('approvedVisa')
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    const { data, error } = await generateVisaDocumentSignedUrl(document.file_path)
    setDownloading(false)
    if (error || !data?.url) {
      toast.error(t('downloadFailed'))
      return
    }
    const a = window.document.createElement('a')
    a.href = data.url
    a.download = document.file_name
    a.click()
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">{t('title')}</p>
          <p className="mt-0.5 truncate text-xs text-emerald-700">
            {t('issuedOn', { date: formatDate(document.uploaded_at) })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {t('download')}
      </button>
    </div>
  )
}
