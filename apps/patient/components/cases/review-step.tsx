'use client'

import { FileText, ImageIcon } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@iha/ui'
import { type MedicalDetailsInput, type SubmittedDocument } from '@iha/validations'
import type { SpecialtyOption } from '@iha/db/specialties'

type Props = {
  specialties: SpecialtyOption[]
  medicalDetails: MedicalDetailsInput
  documents: SubmittedDocument[]
  isSubmitting: boolean
  onSubmit: () => void
  onBack: () => void
}

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  return <ImageIcon className="h-5 w-5 text-blue-500" />
}

export function ReviewStep({ specialties, medicalDetails, documents, isSubmitting, onSubmit, onBack }: Props) {
  const t = useTranslations('caseWizard.review')
  const tDocTypes = useTranslations('documentTypes')
  const locale = useLocale()
  const specialtyOption = specialties.find((s) => s.name === medicalDetails.specialty)
  const displaySpecialty =
    medicalDetails.specialty === 'Other' && medicalDetails.specialty_other
      ? medicalDetails.specialty_other
      : specialtyOption
        ? (locale === 'zh' ? specialtyOption.label_zh : specialtyOption.label_en)
        : medicalDetails.specialty

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>

      {/* Medical details summary */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{t('condition')}</p>
          <p className="mt-0.5 text-sm text-slate-900">{displaySpecialty}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{t('symptoms')}</p>
          <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">{medicalDetails.description}</p>
        </div>
      </div>

      {/* Documents */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('uploadedDocuments')}</h3>
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.localId}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              {fileIcon(doc.mime_type)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{doc.file_name}</p>
                <p className="text-xs text-slate-400">{formatBytes(doc.file_size_bytes)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {tDocTypes(doc.document_type)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Disclosure */}
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        {t('disclosure')}
      </p>

      <div className="flex justify-between pt-1">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          {t('prev')}
        </Button>
        <Button
          onClick={onSubmit}
          loading={isSubmitting}
          className="bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60"
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </div>
    </div>
  )
}
