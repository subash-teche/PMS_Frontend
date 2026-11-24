import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { dubaiToday } from '../../shared/dates'
import { DialogX } from '../dialogs'
import { Icon } from '../icons'
import { currentStep, type Task } from '../types'

/** 2026-11-11 -> "Wed 11 Nov" */
const dayText = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

/**
 * A task planned for a day that is over can no longer be started with the timer (the day is closed), but the work may have been
 * done. This lets the person say so afterwards: log the time on the day it was worked on, and either complete the task or keep it open.
 * The time goes to the PMS Timesheet on that day, like any other time logged here.
 */
export function CatchUpDialog({ task, plannedDay, onClose }: { task: Task; plannedDay: string; onClose: () => void }) {
  const qc = useQueryClient()
  const today = dubaiToday()
  const step = currentStep(task)
  const [mode, setMode] = useState<'complete' | 'log'>('complete')
  const [date, setDate] = useState(plannedDay)
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, busy])

  const n = /^\d+$/.test(minutes) ? Number(minutes) : NaN
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
  // Completing may add no time (it can be 0 when the time was logged before); only logging needs at least one minute.
  const minutesOk = mode === 'complete' ? (minutes === '' || n >= 0) && !(n > 1440) : n >= 1 && n <= 1440
  const ok = !!step && dateOk && minutesOk && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ok || !step) return
    setBusy(true); setError('')
    try {
      const body = { version: task.version, workDate: date }
      if (mode === 'complete') {
        // whatever is still open between now and "done" is done in one go: accept -> start -> close
        const first = step.status === 'offered' ? 'accept' : step.status === 'todo' ? 'start' : 'close'
        await api(`/tasks/${task.id}/${first}`, { body: { ...body, then: first === 'close' ? undefined : 'close', minutes: Number.isFinite(n) ? n : 0, comment: note.trim() || undefined } })
      } else {
        if (step.status === 'offered') await api(`/tasks/${task.id}/accept`, { body: { version: task.version, then: 'start' } })
        else if (step.status === 'todo') await api(`/tasks/${task.id}/start`, { body: { version: task.version } })
        await api(`/tasks/${task.id}/log`, { body: { minutes: n, note: note.trim() || undefined, workDate: date, doneForDay: true } })
      }
      for (const k of ['tasks', 'timesheet', 'plan', 'day']) qc.invalidateQueries({ queryKey: [k] })
      onClose()
    } catch (err) {
      setError((err as Error).message || 'That did not work. Try again.')
      for (const k of ['tasks', 'timesheet', 'plan', 'day']) qc.invalidateQueries({ queryKey: [k] })
      setBusy(false)
    }
  }

  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog small-dialog catchup-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <DialogX onClose={onClose} disabled={busy} />
        <h2>Catch up this day</h2>
        <p className="modal-text choice-sub"><strong>{task.title}</strong><span className="muted"> · planned for {dayText(plannedDay)}, which is over</span></p>

        <div className="end-cards" role="radiogroup" aria-label="What to do">
          <button type="button" role="radio" aria-checked={mode === 'complete'} className={mode === 'complete' ? 'end-card on' : 'end-card'} onClick={() => setMode('complete')}>
            <span className="option-icon"><Icon name="check-circle" size={18} /></span>
            <strong>Complete the task</strong>
            <small>Log the time and close your step.</small>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'log'} className={mode === 'log' ? 'end-card on' : 'end-card'} onClick={() => setMode('log')}>
            <span className="option-icon"><Icon name="clock" size={18} /></span>
            <strong>Done for that day</strong>
            <small>Log the time and finish that day's plan. The task stays open with you.</small>
          </button>
        </div>

        <label>Work done on
          <input type="date" className="dash-date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="time-field">
          <span className="time-heading">Time spent{mode === 'complete' ? ' (optional)' : ''}</span>
          <div className="time-row">
            <div className="stepper">
              <input type="number" min={mode === 'complete' ? 0 : 1} max={1440} step={1} value={minutes} placeholder="0" aria-label="Time spent in minutes" onChange={(e) => setMinutes(e.target.value)} autoFocus />
              <span className="muted">minutes</span>
            </div>
            <div className="time-chips">
              {[5, 15, 30].map((m) => <button key={m} type="button" onClick={() => setMinutes(String((Number.isFinite(n) ? n : 0) + m))}>+{m}</button>)}
            </div>
          </div>
        </div>
        <label>{mode === 'complete' ? 'Note for the next person (optional)' : 'Note (optional)'}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={mode === 'complete' ? 1000 : 500} placeholder="What did you work on?" />
        </label>
        {error && <p className="bad-text modal-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <span className="spacer" />
          <button className="primary" disabled={!ok}>{mode === 'complete' ? 'Complete task' : 'Done for that day'}</button>
        </div>
      </form>
    </div>
  )
}
