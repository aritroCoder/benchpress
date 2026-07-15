import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local text state with a debounced commit (~300ms), flushed on blur/unmount/pagehide.
 * Syncs from `source` (live query echo) only while not dirty, so typing never fights
 * the round-trip.
 */
export function useTextField(source: string, save: (v: string) => void, delay = 300) {
  const [text, setText] = useState(source)
  const dirty = useRef(false)
  const latest = useRef(source)
  const saveRef = useRef(save)
  saveRef.current = save
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!dirty.current) {
      setText(source)
      latest.current = source
    }
  }, [source])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (dirty.current) {
      dirty.current = false
      saveRef.current(latest.current)
    }
  }, [])

  const onChange = useCallback(
    (v: string) => {
      setText(v)
      latest.current = v
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  return { text, onChange, flush }
}
