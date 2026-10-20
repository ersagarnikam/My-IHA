import * as React from 'react'
import { Calendar } from 'lucide-react'
import { cn } from './lib/utils'

export type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// Native <input type="date"> renders its calendar icon snug against the
// text segments rather than at the field's edge, and only that icon opens
// the picker on click. This stretches the (hidden) native picker trigger
// across the whole field and draws a decorative icon pinned to the right,
// so the entire input opens the calendar, not just a small icon.
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, ...props }, ref) => {
    // <input type="date"> has no real ::placeholder — the empty "mm/dd/yyyy"
    // segments just render in the default text color. Fake the same muted
    // placeholder look while empty, then switch to normal text once a date
    // is picked.
    const isEmpty = !value

    return (
      <div className="relative">
        <input
          type="date"
          ref={ref}
          value={value}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            isEmpty ? 'text-muted-foreground' : 'text-foreground',
            '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
            className,
          )}
          {...props}
        />
        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  },
)
DateInput.displayName = 'DateInput'
