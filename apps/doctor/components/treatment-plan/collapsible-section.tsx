'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, cn } from '@iha/ui'

type Props = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

// No shared Accordion/Collapsible primitive exists in @iha/ui yet, and the
// module doc doesn't call for single-open-at-a-time semantics (doctors jump
// between sections freely) — a plain toggle is enough.
export function CollapsibleSection({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <CardContent className="space-y-4 pt-0">{children}</CardContent>}
    </Card>
  )
}
