import { useEffect, useRef, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'

/**
 * Shows that the system is working, everywhere, without every button having to do it itself:
 *  - a thin progress bar at the top while anything is loading or saving (after a short delay, so quick calls do not flicker);
 *  - the button that was clicked shows a spinner (and cannot be clicked twice) until its save has finished.
 * It follows the data cache it sits in, so the PMS pages and the Task Management screens (own cache) each get their own.
 */
export function ActivityBar() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const busy = fetching + mutating > 0
  const [show, setShow] = useState(false)
  const lastClick = useRef<{ button: HTMLButtonElement; at: number } | null>(null)

  useEffect(() => {
    if (!busy) { setShow(false); return }
    const t = setTimeout(() => setShow(true), 180)
    return () => clearTimeout(t)
  }, [busy])

  // remember the button the person clicked (works inside the Task Management Shadow DOM too)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const b = e.composedPath().find((n): n is HTMLButtonElement => n instanceof HTMLButtonElement)
      lastClick.current = b ? { button: b, at: Date.now() } : null
    }
    document.addEventListener('click', down, true)
    return () => document.removeEventListener('click', down, true)
  }, [])

  const saving = mutating > 0
  useEffect(() => {
    const c = lastClick.current
    if (!saving || !c || Date.now() - c.at > 2000) return
    c.button.classList.add('is-loading')
    c.button.setAttribute('aria-busy', 'true')
    return () => { c.button.classList.remove('is-loading'); c.button.removeAttribute('aria-busy') }
  }, [saving])

  return <div className={show ? 'net-bar is-on' : 'net-bar'} role="progressbar" aria-hidden={!show} aria-busy={show} />
}
