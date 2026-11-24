import { useEffect, useRef, useState } from 'react'
import { useClients, useTypes } from '../hooks'
import { Icon } from '../icons'
import { eventTarget } from '../portal'
import type { Filters } from '../types'

interface Option { value: string; label: string }

/** One filter: a pill with its label and the chosen value; it opens a styled list (not the browser's own). */
function Pick({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(eventTarget(e))) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const chosen = options.find((o) => o.value === value) ?? options[0]
  return (
    <div className={open ? 'fpill is-open' : 'fpill'} ref={box}>
      <button type="button" className="fpill-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fpill-label">{label}</span>
        <span className="fpill-value" title={chosen?.label}>{chosen?.label}</span>
        <Icon name="chevron" size={14} className="fpill-chev" />
      </button>
      {open && (
        <ul className="fpill-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => { onChange(o.value); setOpen(false) }}>
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={15} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The filters of the Tasks page: client and type. */
export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  const set = (k: keyof Filters) => (v: string) => onChange({ ...filters, [k]: v })

  return (
    <div className="filters-fill">
      <Pick label="Client" value={filters.client} onChange={set('client')} options={[{ value: '', label: 'All clients' }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
      <Pick label="Type" value={filters.type} onChange={set('type')} options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: String(t.id), label: t.name }))]} />
      <button className="link" onClick={() => onChange({ ...filters, client: '', type: '' })}>Clear</button>
    </div>
  )
}
