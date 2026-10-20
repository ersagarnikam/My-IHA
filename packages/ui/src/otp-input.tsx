'use client'

import * as React from 'react'
import { cn } from './lib/utils'

export type OtpInputProps = {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  className?: string
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  className,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  function updateAt(index: number, char: string) {
    const next = digits.map((d, i) => (i === index ? char : d === ' ' ? '' : d))
    onChange(next.join('').replace(/\s/g, '').slice(0, length))
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, '').slice(-1)
    updateAt(index, char)
    if (char && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    const focusIndex = Math.min(pasted.length, length - 1)
    inputsRef.current[focusIndex]?.focus()
  }

  return (
    <div className={cn('flex justify-center gap-1.5 sm:gap-2', className)}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={digits[index]?.trim() ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="h-10 w-9 rounded-md border border-input bg-background text-center text-base font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-14 sm:w-12 sm:text-lg"
          aria-label={`Digit ${index + 1} of ${length}`}
        />
      ))}
    </div>
  )
}
