'use client'

import { useRouter } from 'next/navigation'
import { Filter } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

export type DateRangeOption = { value: string; label: string; href: string }

export function CaseDateFilter({
  options,
  value,
}: {
  options: DateRangeOption[]
  value: string
}) {
  const router = useRouter()

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next)
        if (option) router.push(option.href)
      }}
    >
      <SelectTrigger className="h-9 w-auto gap-1.5 border-slate-200 px-3 text-sm font-medium text-slate-600">
        <Filter className="h-4 w-4 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
