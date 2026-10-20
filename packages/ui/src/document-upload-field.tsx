'use client'

import { useRef, useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react'
import { FileText, ImageIcon, Loader2, Trash2, Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@iha/db/client'

const ACCEPTED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Structurally compatible with each app's own (portal-specific) `UploadedFileMeta` type. */
export type UploadedFileMetaLike<TCategory extends string = string> = {
  fileName: string
  filePath: string
  mimeType: string
  fileSizeBytes: number
  category?: TCategory
}

type StagedFile<TCategory extends string> = UploadedFileMetaLike<TCategory> & {
  localId: string
  status: 'uploading' | 'done' | 'error'
}

type Props<TCategory extends string = string> = {
  bucket: string
  pathPrefix: string
  maxFiles?: number
  category?: TCategory
  value: UploadedFileMetaLike<TCategory>[]
  onChange: (files: UploadedFileMetaLike<TCategory>[]) => void
}

function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  if (mime === 'image/jpeg' || mime === 'image/png') return <ImageIcon className="h-5 w-5 text-blue-500" />
  return <FileText className="h-5 w-5 text-indigo-500" />
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Direct-to-storage upload field shared by the doctor, hospital, and visa
 * registration flows (same MIME/size limits, same drag-drop UX). Generic
 * over each portal's own document-category union.
 */
export function DocumentUploadField<TCategory extends string = string>({
  bucket,
  pathPrefix,
  maxFiles = 10,
  category,
  value,
  onChange,
}: Props<TCategory>) {
  const [staged, setStaged] = useState<StagedFile<TCategory>[]>(
    value.map((f) => ({ ...f, localId: f.filePath, status: 'done' as const })),
  )
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Notify the parent form after the commit, not from inside the setStaged
  // updater (which React can invoke during another component's render and
  // trigger "Cannot update a component while rendering a different component").
  useEffect(() => {
    onChangeRef.current(
      staged.filter((f) => f.status === 'done').map(({ localId: _localId, status: _status, ...meta }) => meta),
    )
  }, [staged])

  async function uploadFile(file: File): Promise<void> {
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(`${file.name}: unsupported format. Use PDF, JPEG, PNG, or DOC/DOCX.`)
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} exceeds the 10 MB limit.`)
      return
    }

    const localId = crypto.randomUUID()
    const safeName = sanitize(file.name)
    const path = `${pathPrefix}/${Date.now()}-${safeName}`

    const stagedFile: StagedFile<TCategory> = {
      localId,
      fileName: file.name,
      filePath: path,
      mimeType: file.type,
      fileSizeBytes: file.size,
      category,
      status: 'uploading',
    }

    setStaged((prev) => [...prev, stagedFile])

    const supabase = createClient()
    const { error } = await supabase.storage.from(bucket).upload(path, file)

    setStaged((prev) =>
      prev.map((f) => (f.localId === localId ? { ...f, status: error ? ('error' as const) : ('done' as const) } : f)),
    )

    if (error) toast.error(`Failed to upload ${file.name}.`, { duration: Infinity })
  }

  async function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList)
    const currentDone = staged.filter((f) => f.status === 'done').length
    const available = maxFiles - currentDone
    if (available <= 0) {
      toast.error(`Maximum ${maxFiles} file(s) allowed.`)
      return
    }
    const toUpload = arr.slice(0, available)
    if (arr.length > available) toast.error(`Only ${available} more file(s) can be added.`)
    await Promise.all(toUpload.map(uploadFile))
  }

  function removeFile(localId: string) {
    setStaged((prev) => prev.filter((f) => f.localId !== localId))
  }

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      await addFiles(e.dataTransfer.files)
    },
    [staged],
  )

  const handleInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-3">
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
        <p className="text-sm font-medium text-slate-600">Drag & Drop Files Here or Click to Upload</p>
        <p className="flex items-center gap-1 text-xs text-slate-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Allowed File Types: PDF, JPEG, PNG, DOC (Max 10MB each)
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={maxFiles > 1}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {staged.length > 0 && (
        <ul className="space-y-2">
          {staged.map((f) => (
            <li
              key={f.localId}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              {f.status === 'uploading' ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-cyan-500" />
              ) : (
                fileIcon(f.mimeType)
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{f.fileName}</p>
                <p className="text-xs text-slate-400">{formatBytes(f.fileSizeBytes)}</p>
              </div>
              {f.status === 'error' && <span className="text-xs text-red-500">Upload failed</span>}
              <button
                type="button"
                onClick={() => removeFile(f.localId)}
                disabled={f.status === 'uploading'}
                className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
