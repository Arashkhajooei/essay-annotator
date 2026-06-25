import { useEffect, useRef } from 'react'

/* Re-run `fn` whenever the tab regains focus/visibility and on a light interval,
 * so server-side changes (new essay assignments, role/label edits, …) show up
 * on their own — no manual reload or cache clear needed.
 *
 * Guards:
 *  - in-flight: never start a new run while the previous one is still resolving,
 *    so overlapping triggers can't land out of order and clobber fresh data.
 *  - coalesce: a single tab-return fires both `focus` and `visibilitychange`;
 *    collapse that burst into one run via a short debounce. */
export function useAutoRefresh(fn, intervalMs = 60000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let running = false
    let lastRun = 0
    let timer = null

    const invoke = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      lastRun = Date.now()
      try {
        await ref.current?.()
      } catch {
        /* fn handles its own errors; never let a rejection wedge the guard */
      } finally {
        running = false
      }
    }

    // debounce focus/visibility bursts (and back-to-back triggers) into one run
    const schedule = () => {
      if (document.visibilityState === 'hidden') return
      clearTimeout(timer)
      const since = Date.now() - lastRun
      timer = setTimeout(invoke, since < 1500 ? 1500 - since : 0)
    }

    window.addEventListener('focus', schedule)
    document.addEventListener('visibilitychange', schedule)
    const id = setInterval(invoke, intervalMs)
    return () => {
      window.removeEventListener('focus', schedule)
      document.removeEventListener('visibilitychange', schedule)
      clearInterval(id)
      clearTimeout(timer)
    }
  }, [intervalMs])
}
