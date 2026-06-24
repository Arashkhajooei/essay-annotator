import { useEffect, useRef } from 'react'

/* Re-run `fn` whenever the tab regains focus/visibility and on a light interval,
 * so server-side changes (new essay assignments, role/label edits, …) show up
 * on their own — no manual reload or cache clear needed. */
export function useAutoRefresh(fn, intervalMs = 60000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'hidden') ref.current?.()
    }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    const id = setInterval(run, intervalMs)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', run)
      clearInterval(id)
    }
  }, [intervalMs])
}
