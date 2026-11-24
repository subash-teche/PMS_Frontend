import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { createPortal } from 'react-dom'
import { eventTarget, portalTarget } from '../portal'
import { dubaiMonth, dubaiToday } from '../../shared/dates'
import { defaultDay, monthName, monthShort, shiftMonth, slotOf, weekDays, weekLabel, weekOfDay, weeksIn, type PlanSlot } from '../../shared/plan'
import { choiceDialog, DialogX, notifyError } from '../dialogs'
import { useClients, usePlan, usePlanActions, useTaskActions, useTasks, useTypes } from '../hooks'
import { Icon } from '../icons'
import { currentStep, type PlanItem, type Step, type Task, type User } from '../types'
import { Avatar } from './FlowEditor'
import { CatchUpDialog } from './CatchUp'
import { TaskDialog } from './TaskDialog'
import { TimerControls, useTimer } from './Timesheet'

const ALL = { month: '', owner: '', client: '', type: '' }
/** Asks which day of a week a task goes to. */
function DayPicker({ title, slot, today, initial, planned, onConfirm, onRemove, onCancel }: {
  title: string; slot: PlanSlot; today: string; initial: number; planned: boolean
  onConfirm: (day: number) => void; onRemove: () => void; onCancel: () => void
}) {
  const [day, setDay] = useState(initial)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const r = weekDays(slot)
  const days = Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)
  const todayDay = today.slice(0, 7) === slot.month ? Number(today.slice(8)) : 0
  const label = (d: number) => `${DOW[dowOf(slot.month, d)]} ${d} ${monthShort(slot.month)}`
  const isPast = (d: number) => `${slot.month}-${String(d).padStart(2, '0')}` < today
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog day-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); if (!isPast(day)) onConfirm(day) }}>
        <DialogX onClose={onCancel} />
        <h2>{planned ? 'Move to' : 'Plan for'} {weekLabel(slot.week)} · {r.from}–{r.to} {monthShort(slot.month)}</h2>
        <p className="muted modal-text"><strong>{title}</strong></p>
        <span className="time-heading">Day</span>
        <div className="day-chips" role="radiogroup" aria-label="Day of the week">
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={d === day} disabled={isPast(d)} className={`day-chip${d === day ? ' on' : ''}${d === todayDay ? ' now' : ''}`} onClick={() => setDay(d)}>
              <small>{DOW[dowOf(slot.month, d)]}</small><strong>{d}</strong>{d === todayDay && <em>Now</em>}
            </button>
          ))}
        </div>
        <p className="muted modal-text">Will move to <strong>{label(day)}</strong></p>
        <div className="dialog-actions">
          {planned && <button type="button" className="danger" onClick={onRemove}><Icon name="x" size={14} /> Remove from plan</button>}
          <span className="spacer" />
          <button className="primary" autoFocus disabled={isPast(day)}>{planned ? 'Move' : 'Plan'}</button>
        </div>
      </form>
    </div>
  )
}

type Slot = number | 'unplanned' // a week number, or the pool of steps not planned yet

interface Entry {
  task: Task; step: Step; item?: PlanItem; slot: Slot
  /** Planned in an earlier month and not finished: it comes back into the pool of this month. */
  from?: PlanSlot
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** 2026-11-12 -> "12th" */
export const dueText = (ymd: string) => {
  const n = Number(ymd.slice(8, 10))
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
const dowOf = (month: string, day: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day)).getUTCDay()

/** "W2", or "W2 Oct" when it is not in the month being looked at. */
export const slotText = (s: PlanSlot, month: string) => weekLabel(s.week) + (s.month === month ? '' : ` ${monthShort(s.month)}`)


/** The three-dot menu on a planned card. */
/** `onlyCopy`: a finished task can only be copied to another day, not moved or removed. */
export function CardMenu({ onMove, onCopy, onRemove, removeLabel = 'Remove from plan', onlyCopy = false, only, extra = [] }: { extra?: { label: string; onClick: () => void }[]; onMove: () => void; onCopy: () => void; onRemove: () => void; removeLabel?: string; onlyCopy?: boolean; /** Show just this one action (a task of a day that is over). */ only?: 'move' | 'copy' }) {
  const [open, setOpen] = useState(false)
  // The list is placed on the screen (fixed) so the column's own scrolling cannot cut it off; near the bottom it opens upwards.
  const [at, setAt] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setAt({ right: window.innerWidth - r.right, ...(r.bottom + 150 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    }
    setOpen((o) => !o)
  }
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const away = (e: MouseEvent) => { const t = eventTarget(e); if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  const pick = (fn: () => void) => () => { setOpen(false); fn() }
  return (
    <span className="card-menu" ref={ref}>
      <button type="button" className="icon card-menu-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋮</button>
      {open && createPortal(
        <div className="card-menu-list" role="menu" style={at} ref={listRef}>
          {extra.map((x) => <button key={x.label} type="button" role="menuitem" onClick={pick(x.onClick)}>{x.label}</button>)}
          {!onlyCopy && only !== 'copy' && <button type="button" role="menuitem" onClick={pick(onMove)}>Move…</button>}
          {only !== 'move' && <button type="button" role="menuitem" onClick={pick(onCopy)}>Copy…</button>}
          {!onlyCopy && !only && <button type="button" role="menuitem" className="danger" onClick={pick(onRemove)}>{removeLabel}</button>}
        </div>,
        portalTarget(ref.current),
      )}
    </span>
  )
}

/** Asks the week and the day to move a planned task to, or to copy it to. */
function PlanTo({ title, mode, month, initial, today, onConfirm, onCancel }: {
  title: string; mode: 'move' | 'copy'; month: string; initial: PlanSlot; today: string
  onConfirm: (slot: PlanSlot) => void; onCancel: () => void
}) {
  const [week, setWeek] = useState(initial.week)
  const [day, setDay] = useState(initial.day ?? defaultDay(initial, today))
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const weeks = Array.from({ length: weeksIn(month) }, (_, i) => i + 1)
  const r = weekDays({ month, week })
  const days = Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)
  const todayDay = today.slice(0, 7) === month ? Number(today.slice(8)) : 0
  const isPast = (d: number) => `${month}-${String(d).padStart(2, '0')}` < today
  const pickWeek = (w: number) => { setWeek(w); setDay(defaultDay({ month, week: w }, today)) }
  const label = `${DOW[dowOf(month, day)]} ${day} ${monthShort(month)}`
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog day-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); if (!isPast(day)) onConfirm({ month, week, day }) }}>
        <DialogX onClose={onCancel} />
        <h2>{mode === 'move' ? 'Move to' : 'Copy to'}</h2>
        <p className="muted modal-text"><strong>{title}</strong></p>
        <span className="time-heading">Week</span>
        <div className="week-chips" role="radiogroup" aria-label="Week">
          {weeks.map((w) => { const d = weekDays({ month, week: w }); return (
            <button key={w} type="button" role="radio" aria-checked={w === week} className={`day-chip${w === week ? ' on' : ''}`} onClick={() => pickWeek(w)}>
              <strong>{weekLabel(w)}</strong><small>{d.from}–{d.to} {monthShort(month)}</small>
            </button>
          ) })}
        </div>
        <span className="time-heading">Day</span>
        <div className="day-chips" role="radiogroup" aria-label="Day">
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={d === day} disabled={isPast(d)} className={`day-chip${d === day ? ' on' : ''}${d === todayDay ? ' now' : ''}`} onClick={() => setDay(d)}>
              <small>{DOW[dowOf(month, d)]}</small><strong>{d}</strong>{d === todayDay && <em>Now</em>}
            </button>
          ))}
        </div>
        <p className="muted modal-text">Will {mode === 'move' ? 'move' : 'copy'} to <strong>{label}</strong></p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button className="primary" autoFocus disabled={isPast(day)}>{mode === 'move' ? 'Move' : 'Copy'}</button>
        </div>
      </form>
    </div>
  )
}

interface Reorder { mark: { id: number; after: boolean } | null; over: (e: DragEvent, entry: Entry) => void; drop: (e: DragEvent, entry: Entry) => void; leave: () => void }

/** 70 -> "1h 10m", 125 -> "2h 05m", 12 -> "12m" */
export const spent = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`)

function PlanCard({ entry, editable, onOpen, reorder, timer, menu, paused = false, running = false, carryover = false }: { entry: Entry; editable: boolean; onOpen: () => void; reorder?: Reorder; timer?: ReactNode; menu?: ReactNode; /** Its timer is paused (the time shows in amber) or running (green). */ paused?: boolean; running?: boolean; /** The task went on to a later day: this day only keeps the record, shown as Carryover. */ carryover?: boolean }) {
  const { task, step } = entry
  const done = step.status === 'done' && !carryover
  // the time spent on THIS day (the task is one, but its time is logged day by day); a whole-week plan shows the total
  const dayItem = entry.item?.scope === 'day' ? entry.item : undefined
  const minutes = dayItem ? (task.timeLogs ?? []).filter((l) => l.stepId === step.id && l.workDate === dayItem.startDate).reduce((n, l) => n + l.minutes, 0) : (step.minutes ?? 0)
  const today = dubaiToday()
  const overdue = !!task.dueDate && !done && task.dueDate < today
  const dueToday = !!task.dueDate && !done && task.dueDate === today
  const draggable = editable // a finished task can still be moved: it keeps the day it was planned for
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', `${step.id}:${entry.item?.startDate ?? ''}`); e.dataTransfer.effectAllowed = 'move'
    const card = e.currentTarget as HTMLElement
    // The picture that follows the pointer is taken now, so it gets the highlighted look; right after, the card left behind becomes a faded placeholder.
    card.classList.add('drag-pick')
    setTimeout(() => { card.classList.remove('drag-pick'); card.classList.add('is-dragging') }, 0)
  }
  const onDragEnd = (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('is-dragging', 'drag-pick')
  const clientName = (useClients().data ?? []).find((c) => c.id === task.clientId)?.name
  const typeName = (useTypes().data ?? []).find((t) => t.id === task.typeId)?.name
  return (
    <div
      className={`plan-card wk status-${carryover ? 'carryover' : step.status}${done ? ' is-done' : ''}${reorder?.mark?.id === step.id ? (reorder.mark.after ? ' mark-after' : ' mark-before') : ''}`}
      draggable={draggable} onDragStart={draggable ? onDragStart : undefined} onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={reorder && editable ? (e) => reorder.over(e, entry) : undefined}
      onDragLeave={reorder && editable ? reorder.leave : undefined}
      onDrop={reorder && editable ? (e) => reorder.drop(e, entry) : undefined}
    >
      {carryover && <span className="carry-pill" title="Not finished on this day: the work went on another day"><Icon name="arrow-right" size={12} /> Carryover</span>}
      {typeName && <div className="day-type" title={typeName}>{typeName}</div>}
      <div className="plan-card-head">
        {draggable && <span className="plan-grip" aria-hidden="true" title="Drag to plan">⠿</span>}
        {done && <Icon name="check-circle" size={16} className="plan-tick" />}
        <button type="button" className="link title" title={task.title} onClick={onOpen}>{task.title}</button>
        {menu}
      </div>
        {/* a day of the week: type above the title, client under it, then the due date (left) and the time spent (right), then the timer */}
        {clientName && <div className="day-meta" title={clientName}>{clientName}</div>}
        {(task.dueDate || minutes > 0) && (
          <div className="day-foot">
            {task.dueDate && (
              <span className={`day-due${overdue ? ' bad' : dueToday ? ' warn' : ''}`}>
                <Icon name="calendar" size={13} /> {dueToday ? 'Due today' : `Due ${Number(task.dueDate.slice(8, 10))} ${monthShort(task.dueDate.slice(0, 7))}`}
              </span>
            )}
            {minutes > 0 && <span className={`day-time${done || running ? ' done' : paused ? ' paused' : ''}`} title="Time logged on this day"><Icon name="clock" size={13} /> {spent(minutes)}</span>}
          </div>
        )}
      {timer}
    </div>
  )
}

/** The month plan for one person: pick a week, then drop tasks on its days. Only that person can change it. */
export function PlanBoard({ owner, me, withNew = true, filters }: { owner: User; me: User; withNew?: boolean; filters?: { client: string; type: string } }) {
  const editable = owner.id === me.id
  const allTasks = useTasks(ALL, 'board').data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  // Inside the Board the page's own Client and Type filters are used; on the Plan page they sit in the toolbar here.
  const [ownClient, setClientId] = useState('')
  const [ownType, setTypeId] = useState('')
  const clientId = filters ? filters.client : ownClient
  const typeId = filters ? filters.type : ownType
  const nav = useNavigate()
  const tasks = allTasks.filter((t) => (!clientId || t.clientId === Number(clientId)) && (!typeId || t.typeId === Number(typeId)))
  const plan = usePlan(owner.id).data ?? []
  const { set } = usePlanActions()
  const { act } = useTaskActions()
  const timer = useTimer(tasks)
  const [open, setOpen] = useState<Task | null>(null)
  const [over, setOver] = useState<string | null>(null) // 'unplanned', 'w2' (a week tab) or 'd8' (a day)
  const [month, setMonth] = useState(dubaiMonth())
  // The Waiting list list can be folded away to give the days more room. Open by default.
  const [poolOpen, setPoolOpen] = useState(true)
  const [poolTab, setPoolTab] = useState<'waiting' | 'accepted'>('accepted')
  const [poolSearch, setPoolSearch] = useState('')
  const today = dubaiToday()
  const thisMonth = dubaiMonth()
  const todayDay = Number(today.slice(8, 10))
  const weekNow = (m: string) => (m === thisMonth ? weekOfDay(m, todayDay) : 1)
  const [week, setWeek] = useState(weekNow(month))
  useEffect(() => { setWeek(weekNow(month)) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const entries: Entry[] = []
  for (const task of tasks) {
    const current = task.completedAt ? undefined : currentStep(task)
    for (const step of task.steps) {
      if (step.userId !== owner.id) continue
      // A step can be planned on several days (a copy), each one a card.
      const items = plan.filter((p) => p.stepId === step.id)
      if (!items.length) { if (current?.id === step.id) entries.push({ task, step, slot: 'unplanned' }); continue }
      const here = items.filter((p) => slotOf(p.startDate).month === month)
      for (const item of here) entries.push({ task, step, item, slot: slotOf(item.startDate).week })
      const earlier = items.find((p) => slotOf(p.startDate).month < month)
      if (!here.length && earlier && step.status !== 'done') entries.push({ task, step, item: earlier, slot: 'unplanned', from: slotOf(earlier.startDate) })
    }
  }
  const order = (a: Entry, b: Entry) => Number(a.step.status === 'done') - Number(b.step.status === 'done')
    || Number(!!b.from) - Number(!!a.from)
    || a.task.month.localeCompare(b.task.month)
    || (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999')
    || (a.item?.position ?? 0) - (b.item?.position ?? 0)
  // The search box of the task list: matches the title, the client or the task type.
  const needle = poolSearch.trim().toLowerCase()
  const matches = (e: Entry) => !needle || [e.task.title, clients.find((c) => c.id === e.task.clientId)?.name, types.find((t) => t.id === e.task.typeId)?.name].some((s) => s?.toLowerCase().includes(needle))
  // Not planned yet: waiting for me to accept, or accepted (including the ones already in progress).
  const pool = entries.filter((e) => e.slot === 'unplanned').sort(order)
  const waiting = pool.filter((e) => e.step.status === 'offered' && matches(e))
  const accepted = pool.filter((e) => e.step.status !== 'offered' && matches(e))
  // const tabNote = { waiting: 'Sent to you, not accepted yet. Accept a task to take it on.', accepted: 'Accepted, not planned yet. Drag one onto a day.' }
   const tabNote = { waiting: '', accepted: '' }
  // A task planned on a day that is over and not finished there: the day is closed, but it can be carried over to a new day.
  // Not started yet -> Move (it leaves that day). Already started -> Copy (that day keeps its record, the work goes on another day).
  // A card of a day that is over whose task went on to a later day (a copy was planned there): it stays on its day as a Carryover record -
  // the work and its time continue on the later day's card, and the task is finished (or not) there.
  const carried = (e: Entry) => !!e.item && e.item.startDate < today && plan.some((p) => p.stepId === e.step.id && p.startDate > e.item!.startDate)
  const carryOver = (e: Entry) => !!e.item && e.item.startDate < today && e.step.status !== 'done' && e.step.userId === me.id && currentStep(e.task)?.id === e.step.id && !carried(e)
  // Inside a day the person's own order counts (done ones last).
  const byPosition = (a: Entry, b: Entry) => Number(a.step.status === 'done') - Number(b.step.status === 'done') || (a.item?.position ?? 0) - (b.item?.position ?? 0) || (a.item?.id ?? 0) - (b.item?.id ?? 0)
  const dayList = (d: number) => inWeek(week).filter((e) => dayOf(e) === d).sort(byPosition)
  const dayOf = (e: Entry) => Number(e.item!.startDate.slice(8))
  const inWeek = (w: number) => entries.filter((e) => e.slot === w)
  // Counts tasks planned up to today: a task planned for a later day is not late yet.
  const openIn = (w: number) => new Set(inWeek(w).filter((e) => e.step.status !== 'done' && e.item!.startDate <= today).map((e) => e.step.id)).size

  // Dropping on a week (or choosing one in a menu) asks which day of it, before anything moves.
  const [asking, setAsking] = useState<{ entry: Entry; slot: PlanSlot } | null>(null)
  const ask = (entry: Entry, slot: PlanSlot) => setAsking({ entry, slot })
  const startedOn = (entry: Entry, day: string) =>
    timer.entries.some((x) => x.stepId === entry.step.id && x.day === day && (x.status === 'running' || x.status === 'paused' || x.minutes > 0)) ||
    (entry.task.timeLogs ?? []).some((l) => l.stepId === entry.step.id && l.workDate === day && l.minutes > 0)
  const planTo = (stepId: number, slot: PlanSlot | null, before?: number | null, from?: string, copy?: boolean, dropTime?: boolean) => {
    const entry = entries.find((x) => x.step.id === stepId)
    // work has begun on that day (a timer was started or time was logged): the day keeps it, so it can only be copied
    if (entry && from && !copy && startedOn(entry, from)) { notifyError('Work has already started on this day, so it cannot be moved or removed. Use Copy to plan it on another day.'); return }
    if (entry) set.mutate({ stepId, taskId: entry.task.id, userId: owner.id, slot, before, from, copy, dropTime })
  }
  // Taking a day out of the plan: if the timesheet has an entry for it, say that its time log goes too.
  const removeDay = async (entry: Entry) => {
    const day = entry.item!.startDate
    // Only time that was really spent counts: a timer running now, or minutes already logged. An empty entry is not a log.
    const logged = timer.entries.some((x) => x.stepId === entry.step.id && x.day === day && (x.status === 'running' || x.minutes > 0))
    if (logged) {
      const ok = await choiceDialog({
        title: 'Remove from plan?', subject: entry.task.title,
        message: 'Your time log for this day will also be removed. Is this OK?',
        choices: [{ value: 'ok', label: 'Yes, remove it and the time log', icon: 'x', primary: true }],
      })
      if (!ok) return
    }
    planTo(entry.step.id, null, undefined, day, undefined, logged)
  }
  // Move or copy from the card's three-dot menu: asks the week and the day.
  const [relocating, setRelocating] = useState<{ entry: Entry; mode: 'move' | 'copy' } | null>(null)
  const [catching, setCatching] = useState<Entry | null>(null) // a task of a day that is over: log its time / complete it
  // Dragging a card over another one shows a line above or below it; dropping puts it there, on that day.
  const [mark, setMark] = useState<{ id: number; after: boolean } | null>(null)
  const isAfter = (e: DragEvent) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2 }
  const cardOver = (e: DragEvent, entry: Entry) => { e.preventDefault(); e.stopPropagation(); setOver(null); setMark({ id: entry.step.id, after: isAfter(e) }) }
  const cardDrop = (e: DragEvent, entry: Entry) => {
    e.preventDefault(); e.stopPropagation()
    const after = isAfter(e)
    setMark(null); setOver(null)
    const { id, from } = dragged(e)
    if (!id || id === entry.step.id) return
    const d = dayOf(entry)
    const list = dayList(d).filter((x) => x.step.id !== id)
    const i = list.findIndex((x) => x.step.id === entry.step.id)
    planTo(id, { month, week, day: d }, after ? (list[i + 1]?.step.id ?? null) : entry.step.id, from)
  }
  // What is being dragged: a step, and the day it was planned on (none when it came from the waiting list).
  const dragged = (e: DragEvent) => { const [id, from] = e.dataTransfer.getData('text/plain').split(':'); return { id: Number(id), from: from || undefined } }
  const dropped = (e: DragEvent) => { e.preventDefault(); setOver(null); return dragged(e) }
  const allowDrop = (key: string) => editable ? { onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(key) }, onDragLeave: () => setOver((s) => (s === key ? null : s)) } : {}

  const weeks = Array.from({ length: weeksIn(month) }, (_, i) => i + 1)
  const range = weekDays({ month, week })
  // Sunday is not shown (unless something is planned on it, so nothing is hidden that you planned).
  const days = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
    .filter((d) => dowOf(month, d) !== 0 || inWeek(week).some((e) => dayOf(e) === d))
  const plannedCount = inWeek(week).length

  return (
    <>
      {!filters && editable && (
        <div className="toolbar plan-toolbar">
          {withNew && editable && <button type="button" className="primary" onClick={() => nav('/tasks/new', { state: { from: '/tasks/plan' } })}>+ New task</button>}
          <label className="plan-filter">Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="plan-filter">Type
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {(clientId || typeId) && <button type="button" className="link" onClick={() => { setClientId(''); setTypeId('') }}>Clear</button>}
        </div>
      )}
      <div className="board-head">
        <Avatar userId={owner.id} size={36} />
        <div>
          <h2>{editable ? 'Your plan' : `${owner.name.split(' ')[0]}'s plan`}</h2>
          <p className="muted">{editable ? 'Drag a task onto a week, then drop it on a day.' : 'Only they can change their plan.'}</p>
        </div>
        <div className="plan-nav">
          <button type="button" className="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><Icon name="back" size={14} /></button>
          <strong>{monthName(month)}</strong>
          <button type="button" className="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="next" size={14} /></button>
          {month !== thisMonth && <button type="button" onClick={() => setMonth(thisMonth)}>This month</button>}
        </div>
      </div>

      <div className="week-tabs" role="tablist" aria-label="Weeks of the month">
        {weeks.map((w) => {
          const d = weekDays({ month, week: w })
          const now = month === thisMonth && todayDay >= d.from && todayDay <= d.to
          const n = openIn(w) // not done yet: started or not
          // Only for this week and weeks that are over; a week still to come has nothing left undone yet.
          const begun = `${month}-${String(d.from).padStart(2, '0')}` <= today
          return (
            <button
              key={w} type="button" role="tab" aria-selected={w === week}
              className={`week-tab${w === week ? ' on' : ''}${over === `w${w}` ? ' drop' : ''}`}
              onClick={() => setWeek(w)}
              {...allowDrop(`w${w}`)}
              onDrop={editable ? (e) => { const { id, from } = dropped(e); setWeek(w); const entry = entries.find((x) => x.step.id === id && (x.item?.startDate === from || (!from && !x.item))); if (entry) ask(entry, { month, week: w }) } : undefined}
            >
              <span className="week-tab-main">
                <span className="week-tab-top"><strong>{weekLabel(w)}</strong>{now && <span className="chip plan-chip">This week</span>}</span>
                <small>{d.from}–{d.to} {monthShort(month)}</small>
              </span>
              {begun && <span className={n ? 'week-incomplete on' : 'week-incomplete'} title="Planned tasks not finished yet"><strong>{n}</strong><small>incomplete</small></span>}
            </button>
          )
        })}
      </div>

      <div className={editable && poolOpen ? 'plan-layout' : 'plan-layout alone'}>
        {editable && poolOpen && (
          <section
            className={`plan-pool${over === 'unplanned' ? ' drop' : ''}`}
            {...allowDrop('unplanned')}
            onDrop={(e) => { const { id, from } = dropped(e); if (!from || from >= today) planTo(id, null, undefined, from) }}
          >
            <div className="pool-head">
              <div className="pool-search">
                <Icon name="search" size={14} />
                <input type="search" value={poolSearch} onChange={(e) => setPoolSearch(e.target.value)} placeholder="Search tasks" aria-label="Search the task list" />
                {poolSearch && <button type="button" className="pool-search-x" onClick={() => setPoolSearch('')} aria-label="Clear the search"><Icon name="x" size={12} /></button>}
              </div>
              <button type="button" className="pool-hide" onClick={() => setPoolOpen(false)} aria-label="Hide the task list" title="Hide the task list">Hide</button>
            </div>
            <div className="seg pool-tabs" role="tablist" aria-label="Task list">
              {([['waiting', 'Waiting', waiting.length], ['accepted', 'Accepted', accepted.length]] as const).map(([key, label, n]) => (
                <button key={key} type="button" role="tab" aria-selected={poolTab === key} className={poolTab === key ? 'on' : ''} onClick={() => setPoolTab(key)}>{label} <span className="tab-count">{n}</span></button>
              ))}
            </div>
            <p className="col-sub">{tabNote[poolTab]}</p>
            {/* only the cards scroll: the search, Hide, the tabs and the note above stay in place */}
            <div className="pool-list">
              {(poolTab === 'waiting' ? waiting : accepted).map((e) => (
                <PlanCard key={`${e.step.id}-${e.item?.id ?? 'p'}`} entry={e} editable onOpen={() => setOpen(e.task)}
                  timer={poolTab === 'waiting' ? <button type="button" className="primary plan-accept" onClick={() => act.mutate({ task: e.task, action: 'accept' })}>Accept</button> : undefined} />
              ))}
              {!(poolTab === 'waiting' ? waiting : accepted).length && (
                <p className="muted empty">{needle ? 'No task matches your search' : poolTab === 'waiting' ? 'Nothing is waiting for you to accept' : 'Everything accepted is planned'}</p>
              )}
            </div>
          </section>
        )}
        <section className="plan-week">
          <div className="plan-week-head">
        {editable && !poolOpen && (
          <button type="button" className="pool-show" onClick={() => setPoolOpen(true)}><Icon name="list" size={14} /> Show task list</button>
        )}
            <h3>Week {week} <span className="muted plan-week-sub">{range.from}–{range.to} {monthShort(month)} · {plannedCount} {plannedCount === 1 ? 'task' : 'tasks'} planned</span></h3>
          </div>
          <div className="day-cols" style={{ ['--days' as string]: days.length }}>
            {days.map((d) => {
              const list = dayList(d)
              const isToday = month === thisMonth && d === todayDay
              const past = `${month}-${String(d).padStart(2, '0')}` < today // a day that is over cannot be changed
              const canEdit = editable && !past
              return (
                <div key={d} className={`day-col${isToday ? ' today' : ''}`}>
                  <div className={`day-head${isToday ? ' today' : ''}`}>
                    <small>{DOW[dowOf(month, d)]}</small><strong>{d}</strong>
                    <span className="day-right">
                      {list.some((e) => e.step.status === 'done' && !carried(e)) && <span className="day-done">{list.filter((e) => e.step.status === 'done' && !carried(e)).length} done</span>}
                      {isToday && <em className="day-today">Today</em>}
                    </span>
                  </div>
                  <div
                    className={`day-drop${over === `d${d}` ? ' drop' : ''}`}
                    {...(past ? {} : allowDrop(`d${d}`))}
                    onDrop={canEdit ? (e) => { const { id, from } = dropped(e); planTo(id, { month, week, day: d }, undefined, from) } : undefined}
                  >
                    {list.map((e) => <PlanCard key={`${e.step.id}-${e.item?.id}`} entry={e} editable={canEdit} onOpen={() => setOpen(e.task)} paused={!carried(e) && timer.forStep(e.step.id, e.item?.startDate)?.status === 'paused'} running={!carried(e) && timer.forStep(e.step.id, e.item?.startDate)?.status === 'running'} carryover={carried(e)}
                      menu={e.step.status === 'done' || carried(e) ? undefined // a finished task, or a day's carryover record, has no actions
                        : canEdit
                        ? <CardMenu only={startedOn(e, e.item!.startDate) ? 'copy' : undefined} onlyCopy={false} onMove={() => setRelocating({ entry: e, mode: 'move' })} onCopy={() => setRelocating({ entry: e, mode: 'copy' })} onRemove={() => removeDay(e)} />
                        : editable && carryOver(e)
                          // not finished on its day: not started -> only Move, already started -> only Copy
                          ? <CardMenu only={e.step.status === 'active' ? 'copy' : 'move'} onMove={() => setRelocating({ entry: e, mode: 'move' })} onCopy={() => setRelocating({ entry: e, mode: 'copy' })} onRemove={() => undefined} />
                          : undefined}
                      reorder={{ mark, over: cardOver, drop: cardDrop, leave: () => setMark(null) }}
                      timer={editable && carryOver(e)
                        ?<button type="button" className="primary plan-accept" onClick={() => setCatching(e)}><Icon name="edit" size={13} /> Log time / Complete</button>
                        : !canEdit || e.step.status === 'done' || e.item!.startDate > today ? undefined
                        : e.step.status === 'offered' ? <button type="button" className="primary plan-accept" onClick={() => act.mutate({ task: e.task, action: 'accept' })}>Accept</button>
                        : <TimerControls stepId={e.step.id} timer={timer} day={e.item!.startDate} />} />)}
                    {!list.length && <p className="muted empty">{canEdit ? 'Drop here' : '—'}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {asking && (() => {
        const { entry, slot } = asking
        const itemSlot = entry.item ? slotOf(entry.item.startDate) : null
        const sameWeek = !!itemSlot && itemSlot.month === slot.month && itemSlot.week === slot.week
        return (
          <DayPicker
            title={entry.task.title} slot={slot} today={today} planned={entry.slot !== 'unplanned'}
            initial={sameWeek ? Number(entry.item!.startDate.slice(8)) : defaultDay(slot, today)}
            onCancel={() => setAsking(null)}
            onRemove={() => { setAsking(null); if (entry.item) removeDay(entry); else planTo(entry.step.id, null) }}
            onConfirm={(day) => { planTo(entry.step.id, { ...slot, day }, undefined, entry.item?.startDate); setAsking(null) }}
          />
        )
      })()}
      {catching && <CatchUpDialog task={catching.task} plannedDay={catching.item!.startDate} onClose={() => setCatching(null)} />}
      {relocating && (
        <PlanTo
          title={relocating.entry.task.title} mode={relocating.mode} today={today}
          // a task of a day that is over goes to today or later: the picker opens on this month, this week
          month={relocating.entry.item!.startDate < today ? thisMonth : month}
          initial={relocating.entry.item!.startDate < today
            ? { month: thisMonth, week: weekOfDay(thisMonth, todayDay) }
            : { month, week: relocating.entry.slot as number, day: Number(relocating.entry.item!.startDate.slice(8)) }}
          onCancel={() => setRelocating(null)}
          onConfirm={(slot) => { planTo(relocating.entry.step.id, slot, undefined, relocating.entry.item!.startDate, relocating.mode === 'copy'); setRelocating(null) }}
        />
      )}
      {timer.dialog}
      {(timer.busy || act.isPending) && <div className="page-loader" role="status" aria-label="Working"><span className="page-loader-ring" /></div>}
      {open && <TaskDialog task={open} me={me} onClose={() => setOpen(null)} />}
    </>
  )
}
