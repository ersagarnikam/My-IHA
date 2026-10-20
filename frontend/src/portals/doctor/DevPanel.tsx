import { DevActions } from '../patient/DevPanel'

// Development only (stripped from production builds): plays MTA admin and the
// patient via /api/dev/doctor/* until the admin portal is ported.

export function DevDoctorPanel({
  actions,
  onChanged,
}: {
  actions: { label: string; path: string }[]
  onChanged: () => void
}) {
  if (!import.meta.env.DEV || actions.length === 0) return null
  return <DevActions actions={actions} onChanged={onChanged} />
}
