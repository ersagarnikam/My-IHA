'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@iha/db/client'

type Props = {
  caseId: string
}

/**
 * Refreshes the (server-rendered) case detail page when the case row changes,
 * so the Status Timeline and other status-derived sections update live instead
 * of only after a manual page reload.
 */
export function CaseStatusListener({ caseId }: Props) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`case-status:${caseId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'cases', filter: `id=eq.${caseId}` },
          () => {
            router.refresh()
          },
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [caseId, router])

  return null
}
