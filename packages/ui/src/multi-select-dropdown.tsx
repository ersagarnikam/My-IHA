'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Checkbox } from './checkbox'
import type { MultiSelectOption } from './multi-select-checklist'

type Props = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  emptyMessage?: string
}

/**
 * Closed-by-default multi-select: a dropdown trigger summarizing the
 * selection, opening a checkbox panel that stays open across toggles.
 */
export function MultiSelectDropdown({ options, value, onChange, placeholder, emptyMessage }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          selectedLabels.length > 0 ? 'text-slate-900' : 'text-muted-foreground'
        }`}
      >
        <span className="truncate">
          {selectedLabels.length > 0 ? selectedLabels.join(', ') : (placeholder ?? 'Select')}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-md">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {emptyMessage ?? 'No options available.'}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={value.includes(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span>
                    {option.label}
                    {option.description && (
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
