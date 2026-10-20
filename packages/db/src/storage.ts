import { createClient } from './server'

export type StorageObjectMeta = {
  size: number
  mimetype: string
}

/**
 * Reads the *actual* size/mimetype Supabase Storage recorded for an object at
 * upload time (authoritative — not the client-reported metadata sent alongside
 * a document row insert). Returns null if the object doesn't exist.
 */
export async function getStorageObjectMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  path: string,
): Promise<StorageObjectMeta | null> {
  const lastSlash = path.lastIndexOf('/')
  const folder = lastSlash === -1 ? '' : path.slice(0, lastSlash)
  const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1)

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    search: fileName,
    limit: 1,
  })
  if (error || !data) return null

  const entry = data.find((e) => e.name === fileName)
  const metadata = entry?.metadata as { size?: number; mimetype?: string } | undefined
  if (!metadata || typeof metadata.size !== 'number' || !metadata.mimetype) return null

  return { size: metadata.size, mimetype: metadata.mimetype }
}
