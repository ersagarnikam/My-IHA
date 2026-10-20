'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { SpecialtyOption } from '@iha/db/specialties'

type Props = {
  specialties: SpecialtyOption[]
  value: string
  onChange: (value: string) => void
  error?: string
}

export function SpecialtyCombobox({ specialties, value, onChange, error }: Props) {
  const t = useTranslations('caseWizard.conditionDetails')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  function getLabel(s: string) {
    const option = specialties.find((o) => o.name === s)
    if (!option) return s
    return locale === 'zh' ? option.label_zh : option.label_en
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const names = specialties.map((s) => s.name)
  const filtered = query.trim()
    ? names.filter((s) => getLabel(s).toLowerCase().includes(query.toLowerCase()))
    : names

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(specialty: string) {
    onChange(specialty)
    setOpen(false)
    setQuery('')
  }

  function handleToggle() {
    setOpen((prev) => {
      if (!prev) setTimeout(() => inputRef.current?.focus(), 0)
      return !prev
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={`flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          error ? 'border-red-500' : 'border-input'
        } ${value ? 'text-slate-900' : 'text-muted-foreground'}`}
      >
        <span className="truncate">{value ? getLabel(value) : t('selectCondition')}</span>
        {value ? (
          <X
            className="h-4 w-4 shrink-0 text-slate-400 hover:text-slate-600"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
          />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">{t('noResults')}</li>
            ) : (
              filtered.map((s) => (
                <li
                  key={s}
                  onClick={() => select(s)}
                  className={`cursor-pointer px-3 py-2 text-sm transition hover:bg-cyan-50 hover:text-cyan-800 ${
                    s === value ? 'bg-cyan-50 font-medium text-cyan-800' : 'text-slate-700'
                  }`}
                >
                  {getLabel(s)}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
