'use client'

import { Checkbox } from './checkbox'

export type MultiSelectOption = {
  value: string
  label: string
  description?: string
}

type Props = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  emptyMessage?: string
}

/**
 * Checkbox-list multi-select for short, bounded catalogs (specialties,
 * languages, hospital affiliations) — these lists are small enough that a
 * searchable combobox (see apps/patient's SpecialtyCombobox, which is also
 * single-select only) would be overkill.
 */
export function MultiSelectChecklist({ options, value, onChange, emptyMessage }: Props) {
  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage ?? 'No options available.'}</p>
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
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
  )
}
