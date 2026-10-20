'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLinkStatus } from 'next/link'

type NavigationProgressContextValue = {
  increment: () => void
  decrement: () => void
}

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null)

// Middleware runs before Next.js starts rendering the destination route, so
// route-level `loading.tsx` files can never cover that window — this bar
// fires the instant a tracked link is clicked, independent of where the
// delay actually is (middleware, layout data, or page data).
export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const [activeCount, setActiveCount] = useState(0)

  const increment = useCallback(() => setActiveCount((count) => count + 1), [])
  const decrement = useCallback(() => setActiveCount((count) => Math.max(0, count - 1)), [])

  return (
    <NavigationProgressContext.Provider value={{ increment, decrement }}>
      <div
        aria-hidden
        className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ${
          activeCount > 0 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="h-full w-1/3 animate-nav-progress bg-cyan-500" />
      </div>
      {children}
    </NavigationProgressContext.Provider>
  )
}

// Rendered as a child of a `<Link>` — reports that link's pending state (via
// Next's `useLinkStatus`) to the nearest NavigationProgressProvider. Native
// `<Link>` click handling (modifier-key new-tab opens, prefetching, etc.) is
// untouched since this only observes, it doesn't intercept the click.
export function LinkProgressReporter() {
  const { pending } = useLinkStatus()
  const ctx = useContext(NavigationProgressContext)

  useEffect(() => {
    if (!pending || !ctx) return
    ctx.increment()
    return () => ctx.decrement()
  }, [pending, ctx])

  return null
}
