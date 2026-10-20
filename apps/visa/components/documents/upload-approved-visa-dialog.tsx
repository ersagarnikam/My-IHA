'use client'

import { useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react'
import { createClient } from '@iha/db/client'
import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@iha/ui'
import { uploadApprovedVisaDocumentAction } from '@/lib/actions/documents'

// Matches the visa-documents bucket's own restrictions
// (20260603000008_visa_update_and_storage.sql: allowed_mime_types, file_size_limit).
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

type Props = {
  caseId: string
  patientName: string
  trigger: React.ReactNode
}

export function UploadApprovedVisaDialog({ caseId, patientName, trigger }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(candidate: File | undefined) {
    if (!candidate) return
    if (!ACCEPTED_MIME.includes(candidate.type)) {
      toast.error('Unsupported format. Use PDF, JPEG, PNG, or WEBP.')
      return
    }
    if (candidate.size > MAX_BYTES) {
      toast.error('File exceeds the 10 MB limit.')
      return
    }
    setFile(candidate)
  }

  async function handleUpload() {
    if (!file) return
    setIsUploading(true)

    const path = `lawyer-issued/${caseId}/${Date.now()}-${sanitize(file.name)}`
    const supabase = createClient()
    const { error: uploadError } = await supabase.storage.from('visa-documents').upload(path, file)

    if (uploadError) {
      toast.error('Failed to upload the file. Please try again.')
      setIsUploading(false)
      return
    }

    const result = await uploadApprovedVisaDocumentAction(caseId, {
      fileName: file.name,
      filePath: path,
      fileSizeBytes: file.size,
      mimeType: file.type,
    })

    setIsUploading(false)

    if (!result.data) {
      toast.error(result.error ?? 'Something went wrong.')
      return
    }

    toast.success('Approved visa uploaded — the patient has been notified.')
    setOpen(false)
    setFile(null)
    router.refresh()
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isUploading) return
        setOpen(next)
        if (!next) setFile(null)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Upload approved visa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            This will be visible to <span className="font-medium text-slate-700">{patientName}</span> in their Visa
            &amp; Travel section immediately, with an in-portal, email, and SMS notification.
          </p>

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition ${
                dragging
                  ? 'border-cyan-400 bg-cyan-50'
                  : 'border-slate-300 bg-slate-50 hover:border-cyan-400 hover:bg-cyan-50/40'
              }`}
            >
              <Upload className="h-7 w-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Drag &amp; Drop or Click to Upload</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <AlertCircle className="h-3.5 w-3.5" />
                PDF, JPEG, PNG, or WEBP (Max 10MB)
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <FileText className="h-5 w-5 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="shrink-0 text-xs font-medium text-cyan-700 hover:underline"
                >
                  Change
                </button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!file || isUploading}
              onClick={handleUpload}
              className="bg-cyan-700 text-white hover:bg-cyan-800"
            >
              {isUploading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </span>
              ) : (
                'Upload & Notify Patient'
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
