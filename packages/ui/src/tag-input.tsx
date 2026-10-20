'use client'

import { useRef, useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from './lib/utils'

type TagInputProps = {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}

export function TagInput({ value, onChange, placeholder = 'Type and press Enter', className }: TagInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag(raw: string) {
    const tag = raw.trim()
    if (!tag || value.includes(tag) || value.length >= 20) return
    onChange([...value, tag])
    setInput('')
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  function handleBlur() {
    if (input.trim()) addTag(input)
  }

  return (
    <div
      className={cn(
        'flex min-h-10 w-full flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeTag(i)
            }}
            className="ml-0.5 text-cyan-500 hover:text-cyan-800"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-slate-400"
      />
    </div>
  )
}
