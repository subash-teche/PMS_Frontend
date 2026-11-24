import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { slotOf } from '../../shared/plan'
import { DialogX, notifyError, notifySuccess } from '../dialogs'
import { useDay, useDayActions, useTasks } from '../hooks'
import { Icon } from '../icons'
import { STATUS_LABEL, type DayItem, type Task, type User } from '../types'
import { CardMenu, dueText } from './Plan'
import { TaskDialog } from './TaskDialog'
import { CatchUpDialog } from './CatchUp'
import { TimerControls, useTimer } from './Timesheet'

/*
 * The Dashboard: my 1-3-5 for a day - 1 big, 3 medium and 5 small things (9 slots). It is the same list as the PMS 1-3-5 page
 * (one source), filled from what I planned in the Plan page. Time is logged in Task Management only, so the effort column shows
 * what was logged there for that day.
 */

const SLOTS = 9
const GROUPS = [
  { from: 1, to: 1, size: 'big', label: '1 big task - the one thing that matters most today' },
  { from: 2, to: 4, size: 'medium', label: '3 medium tasks' },
  { from: 5, to: 9, size: 'small', label: '5 small tasks' },
] as const
const SLOT_TIP = { big: 'Big slot: the one thing that matters most today', medium: 'Medium slot (1 of 3)', small: 'Small slot (1 of 5)' } as const
const STATUS_TIP: Record<string, string> = {
  offered: 'Yet to accept: waiting for you to accept it',
  todo: 'To do: accepted, not started yet',
  active: 'In progress: being worked on right now',
  done: 'Done: your step is finished',
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const shift = (iso: string, days: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const dayName = (iso: string) => DAYS[parse(iso).getUTCDay()]
const longDate = (iso: string) => { const d = parse(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
const effort = (min: number) => (min ? `${Math.floor(min / 60) ? `${Math.floor(min / 60)}h ` : ''}${min % 60 ? `${min % 60}m` : ''}`.trim() : '—')
const ALL = { month: '', owner: '', client: '', type: '' }

/** Pick the day a slot moves (or is copied) to. */
function MoveDialog({ item, from, today, mode, busy, onConfirm, onCancel }: { item: DayItem; from: string; today: string; mode: 'move' | 'copy'; busy: boolean; onConfirm: (date: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState(() => (shift(from, 1) < today ? today : shift(from, 1)))
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const same = to === from
  const quick: [string, string][] = ([['Today', today], ['Tomorrow', shift(today, 1)], ['Day after', shift(today, 2)]] as [string, string][]).filter(([, d]) => d !== from)
  const submit = (e: FormEvent) => { e.preventDefault(); if (!same && to) onConfirm(to) }
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog day-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <DialogX onClose={onCancel} />
        <h2>{mode === 'move' ? 'Move to another day' : 'Copy to another day'}</h2>
        <p className="muted modal-text"><strong>{item.title}</strong></p>
        <span className="time-heading">{mode === 'move' ? 'Move to' : 'Copy to'}</span>
        <input type="date" className="dash-date" value={to} min={today} onChange={(e) => setTo(e.target.value)} />
        <div className="dash-quick">
          {quick.map(([label, d]) => <button key={label} type="button" className={`day-chip${to === d ? ' on' : ''}`} onClick={() => setTo(d)}><strong>{label}</strong><small>{dayName(d).slice(0, 3)} {parse(d).getUTCDate()}</small></button>)}
        </div>
        <p className="muted modal-text">{same ? 'Pick another day: this is the day it is on.' : mode === 'move' ? 'It goes to the end of that day and leaves this one. Your Plan moves with it.' : 'A copy goes to the end of that day; this day keeps the slot.'}</p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button className="primary" disabled={busy || same || !to}>{mode === 'move' ? 'Move' : 'Copy'}</button>
        </div>
      </form>
    </div>
  )
}

/** "Add task": put a task you already have on this day, or create a new one. */
function AddDialog({ me, tasks, taken, dayText, busy, onPick, onNew, onClose }: { me: User; tasks: Task[]; taken: Set<number>; dayText: string; busy: boolean; onPick: (stepId: number) => void; onNew: () => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  // my tasks that are not finished (waiting to be accepted, accepted, in progress) and not on this day yet
  const WAY: Record<string, number> = { offered: 0, active: 1, todo: 2 }
  const list = tasks
    .map((t) => ({ t, step: t.steps.find((x) => x.userId === me.id && x.status in WAY) }))
    .filter((x) => !!x.step && x.t.status !== 'completed' && !taken.has(x.t.id))
    .map((x) => ({ t: x.t, step: x.step! }))
    .sort((a, b) => (WAY[a.step.status] ?? 3) - (WAY[b.step.status] ?? 3))
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog add-dialog" role="dialog" aria-modal="true">
        <DialogX onClose={onClose} />
        <h2>Add task</h2>
        <p className="modal-text muted">For {dayText}. Pick one of your tasks, or create a new one.</p>
        <button type="button" className="add-new" onClick={onNew}>
          <span className="add-new-icon"><Icon name="plus" size={16} /></span>
          <span><strong>Create a new task</strong><small>Open the task page</small></span>
        </button>
        <div className="add-sub">Or pick an existing task <span className="muted">({list.length})</span></div>
        <div className="add-list">
          {!list.length && <p className="muted empty">No open tasks left to add. Every task that is waiting, accepted or in progress is already on this day.</p>}
          {list.map(({ t, step }) => (
            <button key={t.id} type="button" className="add-row" disabled={busy} onClick={() => onPick(step.id)}>
              <span className="add-row-main">
                <b title={t.title}>{t.title}</b>
                <small>{t.projectTitle ?? t.projectCode ?? ''}{t.dueDate ? ` · Due ${dueText(t.dueDate)}` : ''}</small>
              </span>
              <span className={`badge ${step.status}`}>{step.status === 'offered' ? 'Yet to accept' : step.status === 'todo' ? 'Accepted' : STATUS_LABEL[step.status]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Dashboard({ me }: { me: User }) {
  const [date, setDate] = useState<string | null>(null) // null = today
  const day = useDay(date)
  const shown = date ?? day.data?.today ?? ''
  const today = day.data?.today ?? shown
  const items = day.data?.items ?? []
  const { reorder, move, remove, tick } = useDayActions(date)
  const [catching, setCatching] = useState<Task | null>(null) // a task of a day that is over: log its time / complete it
  const qc = useQueryClient()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const toPlan = () => setAdding(true) // "Add task": pick an existing task, or go to the one task creation page
  const tasks = useTasks(ALL, 'all').data ?? []
  const timer = useTimer(tasks)
  const [moving, setMoving] = useState<{ item: DayItem; mode: 'move' | 'copy' } | null>(null)
  const [open, setOpen] = useState<Task | null>(null)
  const dragId = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  if (!shown) return <p className="muted pad">Loading…</p>
  const done = items.filter((i) => i.isDone).length
  const minutes = items.reduce((s, i) => s + i.minutes, 0)
  const full = items.length >= SLOTS
  const go = (d: string) => setDate(d === day.data?.today ? null : d)
  const fail = (e: unknown) => notifyError((e as Error).message)

  // an existing task goes on the day on show (it takes the next free slot, in plan order)
  const addExisting = async (stepId: number) => {
    setAddBusy(true)
    try {
      await api('/plan', { method: 'PUT', body: { stepId, slot: { ...slotOf(shown), day: Number(shown.slice(8)) } } })
      notifySuccess(`Added to ${shown === today ? 'today' : longDate(shown)}`)
      setAdding(false)
      for (const k of ['day', 'plan', 'tasks']) qc.invalidateQueries({ queryKey: [k] })
    } catch (e) { fail(e) }
    setAddBusy(false)
  }

  const dropOn = (targetId: number) => {
    const from = dragId.current
    dragId.current = null; setOver(null)
    if (!from || from === targetId) return
    const ids = items.map((i) => i.id).filter((x) => x !== from)
    const at = ids.indexOf(targetId) + (items.findIndex((i) => i.id === from) < items.findIndex((i) => i.id === targetId) ? 1 : 0)
    ids.splice(at, 0, from)
    reorder.mutate({ date: shown, ids }, { onError: fail })
  }

  const row = (pos: number) => {
    const it = items[pos - 1]
    if (!it) {
      // a day that is over is closed: nothing can be added to it
      if (shown < today) return <div key={`e${pos}`} className="dash-row is-empty"><span className="dash-no">{pos}</span></div>
      // the first free slot carries the button; the others open the same dialog
      if (pos === items.length + 1) {
        return (
          <div key={`e${pos}`} className="dash-row is-empty is-add">
            <span className="dash-no">{pos}</span>
            <button type="button" className="dash-add-btn" onClick={toPlan}><Icon name="plus" size={14} /> Add task</button>
          </div>
        )
      }
      return (
        <div key={`e${pos}`} className="dash-row is-empty is-clickable" onClick={toPlan}>
          <span className="dash-no">{pos}</span>
          <span className="dash-placeholder">Add task</span>
        </div>
      )
    }
    const flow = tasks.find((t) => t.id === it.taskId)
    const status = it.isDone ? 'done' : it.stepStatus ?? null
    // Start / Pause / End for my own step of a board task, on a day that has begun and is not carried over
    const step = flow?.steps.find((x) => x.userId === me.id && x.status !== 'done')
    const canTime = !it.isDone && !it.carryover && shown === today && step?.status !== 'offered' // a day that is over has no timer
    // work has begun on this day (a timer was started or time was logged): only Copy is left
    const started = !!step && (it.minutes > 0 || timer.entries.some((x) => x.stepId === step.id && x.day === shown && (x.status === 'running' || x.status === 'paused' || x.minutes > 0)))
    // my open step of a board task: finish only this day's plan (the task stays open), or catch up a day that is over
    const mine = !!flow && !!step && !it.carryover && !it.isDone && step.status !== 'offered'
    const extra = [
      ...(mine && shown < today ? [{ label: 'Catch up this day…', onClick: () => setCatching(flow!) }] : []),
      ...(it.planDone && shown >= today ? [{ label: 'Reopen this day', onClick: () => tick.mutate({ id: it.id, isDone: false }, { onError: fail }) }] : []),
    ]
    const overdue = !!it.dueDate && !it.isDone && it.dueDate < today
    return (
      <div
        key={it.id}
        className={`dash-row${it.isDone ? ' is-done' : ''}${it.carryover ? ' is-carry' : ''}${over === it.id ? ' is-over' : ''}`}
        draggable
        onDragStart={(e) => { dragId.current = it.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(it.id)) }}
        onDragEnd={() => { dragId.current = null; setOver(null) }}
        onDragOver={(e) => { e.preventDefault(); setOver(it.id) }}
        onDragLeave={() => setOver((x) => (x === it.id ? null : x))}
        onDrop={(e) => { e.preventDefault(); dragId.current ??= Number(e.dataTransfer.getData('text/plain')); dropOn(it.id) }}
      >
        <span className="dash-grip" aria-hidden="true" title="Drag to reorder">⠿</span>
        <span className="dash-no" title={SLOT_TIP[it.size]}>{pos}</span>
        <div className="dash-main">
          {flow ? <button type="button" className="link dash-title" title={it.title} onClick={() => setOpen(flow)}>{it.title}</button> : <span className="dash-title" title={it.title}>{it.title}</span>}
          <div className="dash-sub">
            {(it.projectTitle ?? it.projectCode) && <span title={it.projectCode ?? undefined}>{it.projectTitle ?? it.projectCode}</span>}
            {it.dueDate && <span className={overdue ? 'dash-due bad' : 'dash-due'}>{overdue ? 'Overdue ' : 'Due '}{dueText(it.dueDate)}</span>}
          </div>
        </div>
        <span className="dash-col is-timer">
          {step && canTime && <TimerControls stepId={step.id} timer={timer} day={shown} />}
          {step && shown < today && !it.isDone && !it.carryover && (
            <div className="plan-timer">
              {timer.forStep(step.id, shown)?.status === 'abandoned' && <span className="ts-pill ts-pill-abandoned" title="The timer was left running past the end of the day, so no time was counted">Abandoned · no time counted</span>}
              {mine && <span className="ts-actions"><button type="button" title="This day is over: log the time you worked on it, then complete the task or leave it open" onClick={() => setCatching(flow!)}>Catch up</button></span>}
            </div>
          )}
        </span>
        <span className="dash-col is-status">
          {it.planDone ? <span className="badge day-done" title="This day's plan is done. The task itself is still open and goes on another day.">Done for today</span>
            : it.carryover ? <span className="badge carryover" title="Not finished on this day: the work went on another day">Carryover</span>
            : status ? <span className={`badge ${status}`} title={STATUS_TIP[status] ?? STATUS_LABEL[status]}>{STATUS_LABEL[status]}</span> : <span className="badge" title="Planned, not started yet">Pending</span>}
        </span>
        <span className="dash-col is-effort" title="Time logged on this task on this day">{effort(it.minutes)}</span>
        <span className="dash-col is-menu">
          <CardMenu extra={extra} onlyCopy={it.isDone || it.stepStatus === 'done' || started} removeLabel="Remove from the day and plan" onMove={() => setMoving({ item: it, mode: 'move' })} onCopy={() => setMoving({ item: it, mode: 'copy' })}
            onRemove={() => remove.mutate(it.id, { onError: fail })} />
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="dash-panel">
      <div className="dash-head">
        <div className="dash-head-left">
          {shown !== today && <button type="button" onClick={() => setDate(null)}><Icon name="calendar" size={14} /> Today</button>}
        </div>
        <div className="dash-nav">
          <button type="button" className="icon" onClick={() => go(shift(shown, -1))} aria-label="Previous day"><Icon name="prev" size={16} /></button>
          <div className="dash-day">
            <strong>{shown === today ? 'Today' : shown === shift(today, 1) ? 'Tomorrow' : shown === shift(today, -1) ? 'Yesterday' : dayName(shown)}</strong>
            <span>{dayName(shown)}, {longDate(shown)}</span>
          </div>
          <button type="button" className="icon" onClick={() => go(shift(shown, 1))} aria-label="Next day"><Icon name="next" size={16} /></button>
        </div>
        <div className="dash-stats">
          <span><b>{items.length}</b>/{SLOTS} planned</span>
          <span><b>{done}</b> done</span>
          <span><b>{effort(minutes)}</b> spent</span>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-cols-head">
          <span className="dash-col is-item">Item</span>
          <span className="dash-col is-timer">Timer</span>
          <span className="dash-col is-status">Status</span>
          <span className="dash-col is-effort">Effort</span>
          <span className="dash-col is-menu" />
        </div>
        {day.isLoading ? <p className="muted empty">Loading…</p> : GROUPS.map((g) => (
          <section key={g.size} className={`dash-group is-${g.size}`}>
            {Array.from({ length: g.to - g.from + 1 }, (_, k) => row(g.from + k))}
          </section>
        ))}
        {full && <p className="muted dash-full">The day is full: move or remove a slot to add another.</p>}
        {!!day.data?.waiting && (
          <p className="dash-waiting" role="status">
            {day.data.waiting} more {day.data.waiting === 1 ? 'task is' : 'tasks are'} planned for this day but {day.data.waiting === 1 ? 'does' : 'do'} not fit in the 9 slots. Move {day.data.waiting === 1 ? 'one' : 'some'} to another day on the Plan page.
          </p>
        )}
      </div>
      </div>
      <p className="muted dash-note">Tasks you plan for a day on the <strong>Plan</strong> page appear here by themselves, in the order of your plan, and go when you take them out of that day. Click <strong>Add task</strong> to create a new task for this day. This is the same 1-3-5 you see in PMS. Time is logged on the task or the timer and shows under Effort.</p>

      {moving && (
        <MoveDialog
          item={moving.item} from={shown} today={today} mode={moving.mode} busy={move.isPending}
          onCancel={() => setMoving(null)}
          onConfirm={(to) => move.mutate({ id: moving.item.id, date: to, mode: moving.mode }, { onSuccess: () => { notifySuccess(`${moving.mode === 'copy' ? 'Copied' : 'Moved'} to ${longDate(to)}`); setMoving(null) }, onError: fail })}
        />
      )}
      {adding && (
        <AddDialog
          me={me} tasks={tasks} taken={new Set(items.map((i) => i.taskId))}
          dayText={shown === today ? 'today' : longDate(shown)} busy={addBusy}
          onPick={addExisting}
          onNew={() => nav('/tasks/new', { state: { from: '/tasks', planDay: shown } })} // the new task goes on the day on show
          onClose={() => setAdding(false)}
        />
      )}
      {timer.dialog}
      {catching && <CatchUpDialog task={catching} plannedDay={shown} onClose={() => setCatching(null)} />}
      {open && <TaskDialog task={open} me={me} onClose={() => setOpen(null)} />}
    </>
  )
}
