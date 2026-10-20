'use client'

import { forwardRef } from 'react'
import ReactPhoneInput, { type Value } from 'react-phone-number-input'

type Props = {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  placeholder?: string
}

// Styled input that matches shadcn/ui Input — passed as inputComponent to the library
const PhoneNumberInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => (
    <input
      ref={ref}
      {...props}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    />
  ),
)
PhoneNumberInput.displayName = 'PhoneNumberInput'

export function PhoneInput({ value, onChange, onBlur, disabled, placeholder }: Props) {
  return (
    <ReactPhoneInput
      international
      defaultCountry="AU"
      value={value as Value | undefined}
      onChange={(val) => onChange(val ?? '')}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={placeholder ?? 'Phone number'}
      inputComponent={PhoneNumberInput}
    />
  )
}
