'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { HospitalGeneratedDocument, HospitalLetterType } from '@iha/db/visa'
import {
  generateHospitalVisaDocumentAction,
  sendVisaDocumentToPatientAction,
  generateHospitalLetterSignedUrlAction,
} from '@/lib/actions/visa-documents'

/** Shared generate/preview-link/download/send logic for a single case
 * letter, shared between the full LetterCard (case detail page) and the
 * compact DocumentStatusCell (Documents list page) so both stay in sync. */
export function useHospitalLetter(
  caseId: string,
  documentType: HospitalLetterType,
  label: string,
  initialDocument: HospitalGeneratedDocument | null,
) {
  const [current, setCurrent] = useState(initialDocument)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingUrl, setLoadingUrl] = useState<'preview' | 'download' | null>(null)

  async function generate(): Promise<boolean> {
    setGenerating(true)
    const { data, error } = await generateHospitalVisaDocumentAction(caseId, documentType)
    setGenerating(false)
    if (error || !data) {
      toast.error(error ?? 'Failed to generate the letter.')
      return false
    }
    toast.success(`${label} generated.`)
    setCurrent({
      id: data.id,
      case_id: caseId,
      category: documentType,
      file_name: `${label.replace(/\s+/g, '_')}.pdf`,
      file_path: `hospital-generated/${caseId}/${documentType}.pdf`,
      file_size_bytes: null,
      mime_type: 'application/pdf',
      uploaded_at: new Date().toISOString(),
      sent_to_patient_at: null,
    })
    return true
  }

  async function getSignedUrl(): Promise<string | null> {
    if (!current) return null
    const { data, error } = await generateHospitalLetterSignedUrlAction(current.file_path)
    if (error || !data) {
      toast.error(error ?? 'Failed to load the document.')
      return null
    }
    return data.url
  }

  async function loadPreviewUrl(): Promise<string | null> {
    setLoadingUrl('preview')
    const url = await getSignedUrl()
    setLoadingUrl(null)
    return url
  }

  async function download() {
    setLoadingUrl('download')
    const url = await getSignedUrl()
    setLoadingUrl(null)
    if (!url || !current) return
    const a = window.document.createElement('a')
    a.href = url
    a.download = current.file_name
    a.click()
  }

  async function send(): Promise<boolean> {
    if (!current) return false
    setSending(true)
    const { data, error } = await sendVisaDocumentToPatientAction(current.id, caseId)
    setSending(false)
    if (error || !data) {
      toast.error(error ?? 'Failed to send to patient.')
      return false
    }
    toast.success(`${label} sent to patient.`)
    setCurrent((prev) => (prev ? { ...prev, sent_to_patient_at: new Date().toISOString() } : prev))
    return true
  }

  return { current, generating, sending, loadingUrl, generate, loadPreviewUrl, download, send }
}
