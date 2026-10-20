'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@iha/ui'

type Props = {
  title: string
  /** A rendered icon element (e.g. `<User className="h-4 w-4" />`), not a component
   * reference — this is a client component, and a bare component type isn't
   * serializable across the server/client boundary the way an already-rendered
   * element is. */
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({ title, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          {icon}
          <span className="text-base font-semibold text-slate-900">{title}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <CardContent className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {children}
        </CardContent>
      )}
    </Card>
  )
}
