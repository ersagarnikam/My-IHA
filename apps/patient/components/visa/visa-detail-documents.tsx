'use client'

import { useRef, useState } from 'react'
import { Download, FileQuestion, FileText, ImageIcon, Loader2, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@iha/db/client'
import type { DocumentRequestWithStatus, VisaDocumentRow } from '@iha/db/visa'
import { addVisaDocument, generateVisaDocumentSignedUrl } from '@/lib/actions/visa'
import { isValidPassportPhotoAspectRatio } from '@/lib/image-dimensions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@iha/ui'

const UPLOAD_LOCKED_STATUSES = ['application_submitted', 'processing', 'approved', 'rejected']

// Full set, used to resolve a display label for any document already on file
// — including hospital_invitation/appointment_confirmation rows the hospital
// generated and sent. approved_visa is excluded from this table (shown as a
// highlighted banner instead) but stays here since docCategories is shared.
const CATEGORY_KEYS = [
  'passport',
  'passport_photograph',
  'hospital_invitation',
  'appointment_confirmation',
  'bank_statement',
  'sponsorship_letter',
  'employer_letter',
  'companion_passport',
  'companion_proof_of_relationship',
  'approved_visa',
] as const

// hospital_invitation / appointment_confirmation are generated and sent by
// the hospital directly — excluded here so patients can't upload a
// duplicate under the same category.
const UPLOAD_CATEGORY_KEYS = [
  'passport',
  'passport_photograph',
  'bank_statement',
  'sponsorship_letter',
  'employer_letter',
  'companion_passport',
  'companion_proof_of_relationship',
] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  return <ImageIcon className="h-5 w-5 text-blue-500" />
}

type Props = {
  submissionId: string
  caseId: string
  userId: string
  status: string
  initialDocuments: VisaDocumentRow[]
  pendingRequests: DocumentRequestWithStatus[]
}

export function VisaDetailDocuments({ submissionId, caseId, userId, status, initialDocuments, pendingRequests }: Props) {
  const t = useTranslations('visaDetail')
  const [documents, setDocuments] = useState<VisaDocumentRow[]>(initialDocuments)
  const [showUpload, setShowUpload]     = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [category, setCategory]         = useState<typeof UPLOAD_CATEGORY_KEYS[number]>(UPLOAD_CATEGORY_KEYS[0])
  const [uploading, setUploading]       = useState(false)
  const [downloading, setDownloading]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLocked = UPLOAD_LOCKED_STATUSES.includes(status)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (selectedFile.size > 10 * 1024 * 1024) { toast.error(t('documents.fileTooLarge')); return }

    if (category === 'passport_photograph' && selectedFile.type.startsWith('image/')) {
      const validRatio = await isValidPassportPhotoAspectRatio(selectedFile).catch(() => false)
      if (!validRatio) { toast.error(t('documents.invalidPhotoDimensions')); return }
    }

    setUploading(true)
    const supabase  = createClient()
    const timestamp = Date.now()
    const safeName  = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath  = `${userId}/${caseId}/${category}/${timestamp}-${safeName}`

    const { error: storageError } = await supabase.storage
      .from('visa-documents')
      .upload(filePath, selectedFile, { contentType: selectedFile.type, upsert: false })

    if (storageError) {
      toast.error(t('documents.uploadFailed'))
      setUploading(false)
      return
    }

    const { data, error } = await addVisaDocument({
      caseId,
      visaSubmissionId: submissionId,
      category,
      fileName:      selectedFile.name,
      filePath,
      fileSizeBytes: selectedFile.size,
      mimeType:      selectedFile.type,
    })

    if (error || !data) {
      toast.error(t('documents.saveFailed'))
      setUploading(false)
      return
    }

    setDocuments((prev) => [
      ...prev,
      {
        id:                  data.id,
        visa_submission_id:  submissionId,
        case_id:             caseId,
        patient_id:          '',
        hospital_id:         null,
        category,
        file_name:           selectedFile.name,
        file_path:           filePath,
        file_size_bytes:     selectedFile.size,
        mime_type:           selectedFile.type,
        uploaded_at:         new Date().toISOString(),
        sent_to_patient_at:  null,
        source:              'patient_upload',
        requested_by_lawyer: false,
      },
    ])

    toast.success(t('documents.documentUploaded'))
    setSelectedFile(null)
    setShowUpload(false)
    setUploading(false)
  }

  async function handleDownload(doc: VisaDocumentRow) {
    setDownloading(doc.id)
    const { data, error } = await generateVisaDocumentSignedUrl(doc.file_path)
    setDownloading(null)
    if (error || !data?.url) { toast.error(t('documents.downloadFailed')); return }
    const a = document.createElement('a')
    a.href = data.url
    a.download = doc.file_name
    a.click()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{t('documents.title')}</h2>
      </div>

      <div className="p-5 space-y-4">
        {/* Pending requests — every one still open, not just the latest */}
        {pendingRequests.length > 0 && (
          <ul className="space-y-2">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                    <FileQuestion className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{request.document_type}</p>
                    <p className="truncate text-xs text-slate-500">
                      {CATEGORY_KEYS.includes(request.category as typeof CATEGORY_KEYS[number])
                        ? t(`documents.docCategories.${request.category}` as never)
                        : request.category}
                      {request.instructions ? ` — ${request.instructions}` : ''}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  {t('documents.requested')}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Table */}
        {documents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="pb-2 pr-4">{t('documents.fileName')}</th>
                  <th className="pb-2 pr-4">{t('documents.documentType')}</th>
                  <th className="pb-2 pr-4">{t('documents.uploaded')}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <FileIcon mimeType={doc.mime_type} />
                        <span className="max-w-[220px] truncate font-medium text-slate-800">{doc.file_name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {CATEGORY_KEYS.includes(doc.category as typeof CATEGORY_KEYS[number])
                        ? t(`documents.docCategories.${doc.category}` as never)
                        : doc.category}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(doc.uploaded_at)}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        disabled={downloading === doc.id}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {downloading === doc.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                        {t('documents.download')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !showUpload && <p className="text-sm text-slate-400">{t('documents.noDocuments')}</p>
        )}

        {/* Inline upload form */}
        {showUpload && (
          <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <div className="flex flex-wrap gap-3">
              {/* Category dropdown */}
              <Select value={category} onValueChange={(value) => setCategory(value as typeof UPLOAD_CATEGORY_KEYS[number])}>
                <SelectTrigger className="w-auto border-slate-200 focus:border-cyan-500 focus:ring-cyan-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_CATEGORY_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>{t(`documents.docCategories.${key}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* File picker */}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                {selectedFile ? selectedFile.name : t('documents.chooseFile')}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setShowUpload(false); setSelectedFile(null) }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {t('documents.cancel')}
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {uploading ? t('documents.uploading') : t('documents.upload')}
              </button>
            </div>
          </div>
        )}

        {/* Add / locked footer */}
        {!showUpload && !isLocked && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 hover:text-cyan-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('documents.addDocuments')}
          </button>
        )}
        {!showUpload && isLocked && documents.length > 0 && (
          <p className="text-xs text-slate-400">{t('documents.uploadWindowClosed')}</p>
        )}
      </div>
    </div>
  )
}
