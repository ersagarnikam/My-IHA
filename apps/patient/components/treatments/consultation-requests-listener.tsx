'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@iha/db/client'

type Props = {
  caseId: string
}

/**
 * Refreshes the (server-rendered) case detail page when any consultation
 * request for this case changes — e.g. the doctor proposes or re-proposes
 * slots — so the consultation panel updates live instead of only after a
 * manual page reload. Mirrors CaseStatusListener's pattern.
 */
export function ConsultationRequestsListener({ caseId }: Props) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`consultation-requests:${caseId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'consultation_requests', filter: `case_id=eq.${caseId}` },
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
