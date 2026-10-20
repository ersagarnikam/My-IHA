import * as React from 'react'
import { Clock } from 'lucide-react'
import { cn } from './lib/utils'

export type TimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// Same click-anywhere-to-open treatment as DateInput: native <input
// type="time"> only opens its picker when you hit the small clock icon, so
// this stretches the (hidden) native picker trigger across the whole field
// and draws a decorative icon pinned to the right in its place.
export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ className, value, ...props }, ref) => {
    const isEmpty = !value

    return (
      <div className="relative">
        <input
          type="time"
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
        <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  },
)
TimeInput.displayName = 'TimeInput'
