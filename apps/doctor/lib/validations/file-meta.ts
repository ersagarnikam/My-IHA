import { z } from 'zod'

export const documentCategories = [
  'license',
  'registration_certificate',
  'medical_license',
  'degree_certificate',
  'other',
] as const
export type DocumentCategory = (typeof documentCategories)[number]

export type UploadedFileMeta = {
  fileName: string
  filePath: string
  mimeType: string
  fileSizeBytes: number
  category?: DocumentCategory
}

export const fileMetaSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
  category: z.enum(documentCategories).optional(),
})
