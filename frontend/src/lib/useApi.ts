import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from './api'

type State<T> = { data: T | null; error: Error | null; loading: boolean }

/**
 * GETs `path` (skipped while null) on mount and whenever it changes.
 * `reload()` refetches without clearing the current data, so screens don't flash.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: path !== null })
  const latest = useRef(0)

  const load = useCallback(
    async (keepData: boolean) => {
      if (path === null) return
      const run = ++latest.current
      setState((s) => ({ data: keepData ? s.data : null, error: null, loading: !keepData }))
      try {
        const data = await apiGet<T>(path)
        if (run === latest.current) setState({ data, error: null, loading: false })
      } catch (error) {
        if (run === latest.current)
          setState((s) => ({
            data: keepData ? s.data : null,
            error: error as Error,
            loading: false,
          }))
      }
    },
    [path],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const reload = useCallback(() => load(true), [load])
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), [])
  return { ...state, reload, setData }
}
