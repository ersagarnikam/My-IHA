'use client'

import { Search } from 'lucide-react'
import { Input } from './input'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** Instant, client-side search box — filters as you type, no Enter/submit needed. */
export function SearchInput({ value, onChange, placeholder, className }: Props) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Search'}
        className="h-9 w-64 pl-8 text-sm sm:w-72"
      />
    </div>
  )
}
