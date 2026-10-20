import { useEffect, useState } from 'react'
import { authHeaders } from '../../../lib/api'

/** The profile photo needs the bearer token, so it's fetched as a blob URL. Bump `version` after an upload. */
export function useDoctorPhoto(hasPhoto: boolean, version = 0) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    fetch(`/api/doctor/profile/photo?v=${version}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [hasPhoto, version])
  return url
}
