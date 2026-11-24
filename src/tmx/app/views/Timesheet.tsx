import { useEffect, useState } from 'react'
import { dubaiToday } from '../../shared/dates'
import { DialogX, endTaskDialog, logTimeDialog } from '../dialogs'
import { useTimesheet, useTimesheetActions, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Task, TimeEntry } from '../types'

const LABEL: Record<TimeEntry['status'], string> = { ready: 'Ready', running: 'Running', paused: 'Paused', ended: 'Ended', abandoned: 'Abandoned' }
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : 0)

/** Asks which day an abandoned entry goes to, and whether to move it there or copy it. */
function AgainDialog({ title, today, canMove, onPick, onCancel }: { title: string; today: string; /** false when time was already logged on that day: the entry can only be copied */ canMove: boolean; onPick: (mode: 'move' | 'copy', day: string) => void; onCancel: () => void }) {
  const [on, setOn] = useState(today)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(on) && on >= today
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog" role="dialog" aria-modal="true" onSubmit={(e) => e.preventDefault()}>
        <DialogX onClose={onCancel} />
        <h2>Add this entry again</h2>
        <p className="muted modal-text"><strong>{title}</strong> was left running and abandoned, so no time was counted.</p>
        <label>Day<input type="date" value={on} min={today} onChange={(e) => setOn(e.target.value)} /></label>
        <p className="muted modal-text">{canMove
          ? <><strong>Move</strong> puts this entry on that day. <strong>Copy</strong> keeps it as a record and adds a new one.</>
          : <>Time is already logged on this task on that day, so the entry cannot be moved. <strong>Copy</strong> adds a new one on the day you pick.</>}</p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className={canMove ? undefined : 'primary'} disabled={!ok} onClick={() => onPick('copy', on)}>Copy</button>
          {canMove ? <button type="button" className="primary" disabled={!ok} onClick={() => onPick('move', on)}>Move</button> : null}
        </div>
      </form>
    </div>
  )
}

/**
 * The timer on a planned task. Start moves the task to In progress (and adds it to my timesheet); Pause logs the time and it
 * stays In progress; End either completes my step or only logs the time. A timer left running past its day is abandoned.
 */
export function useTimer(tasks: Task[]) {
  const today = dubaiToday()
  const entries = useTimesheet().data ?? []
  const ts = useTimesheetActions()
  const users = useUsers().data ?? []
  const [again, setAgain] = useState<TimeEntry | null>(null)
  const busy = Object.values(ts).some((m) => m.isPending)
  const titleOf = (e: { taskId: number }) => tasks.find((t) => t.id === e.taskId)?.title ?? 'Task'

  /** The entry a card shows: one still open, else an abandoned one that was not redone. An ended one means a fresh Start. */
  const forStep = (stepId: number, day?: string) => {
    const all = entries.filter((e) => e.stepId === stepId)
    const open = all.find((e) => e.status === 'running') ?? all.find((e) => e.status === 'paused' || e.status === 'ready')
    if (open) return open
    const last = all.reduce<TimeEntry | undefined>((m, e) => (!m || e.id > m.id ? e : m), undefined)
    // a timer left running on a day that is over is shown on that day only; a new day starts fresh (Start)
    return last?.status === 'abandoned' && (!day || last.day === day) ? last : undefined
  }
  const start = async (stepId: number, entry?: TimeEntry) => {
    try {
      const id = entry?.id ?? ((await ts.add.mutateAsync({ stepId })) as TimeEntry).id
      ts.start.mutate(id)
    } catch { /* the error is shown as a message */ }
  }
  const pause = async (e: TimeEntry) => {
    const r = await logTimeDialog({ title: 'Pause and log time', subtitle: titleOf(e), logged: e.minutes, initial: minutesSince(e.runStartedAt, Date.now()) })
    if (r) ts.pause.mutate({ id: e.id, minutes: r.minutes, note: r.note })
  }
  const end = async (e: TimeEntry) => {
    // the next person in the flow after this step
    const steps = [...(tasks.find((t) => t.id === e.taskId)?.steps ?? [])].sort((a, b) => a.position - b.position)
    const at = steps.findIndex((x) => x.id === e.stepId)
    const next = steps.slice(at + 1).find((x) => x.status !== 'done')
    const r = await endTaskDialog({ title: 'End this task?', subtitle: titleOf(e), nextName: next ? users.find((u) => u.id === next.userId)?.name ?? null : null, startedAt: e.runStartedAt ? new Date(e.runStartedAt) : new Date(), logged: e.minutes, paused: e.status === 'paused' })
    if (!r) return
    if (r.complete) ts.end.mutate({ id: e.id, complete: true, minutes: r.minutes, comment: r.note })
    else ts.end.mutate({ id: e.id, complete: false, minutes: r.minutes, note: r.note })
  }
  const dialog = again && (
    <AgainDialog
      title={titleOf(again)} today={today} onCancel={() => setAgain(null)}
      canMove={!(entries.some((x) => x.id !== again.id && x.stepId === again.stepId && x.day === again.day && x.minutes > 0)
        || (tasks.find((t) => t.id === again.taskId)?.timeLogs ?? []).some((l) => l.stepId === again.stepId && l.workDate === again.day && l.minutes > 0))}
      onPick={(mode, day) => { (mode === 'move' ? ts.move : ts.copy).mutate({ id: again.id, day }); setAgain(null) }}
    />
  )
  return { entries, forStep, start, pause, end, setAgain, busy, dialog }
}

export type Timer = ReturnType<typeof useTimer>

/** Start / Pause / End on a task card. */
export function TimerControls({ stepId, timer, day }: { stepId: number; timer: Timer; day?: string }) {
  const e = timer.forStep(stepId, day)
  const { busy } = timer
  return (
    <div className={'plan-timer' + (e ? ' ts-' + e.status : '')}>
      {e?.status === 'abandoned' && <span className="ts-pill ts-pill-abandoned">{LABEL[e.status]} · no time counted</span>}
      <div className="ts-actions">
        {(!e || e.status === 'ready' || e.status === 'paused') && <button type="button" className="primary" disabled={busy} title={e?.status === 'paused' ? 'Resume the timer' : 'Start the timer: the task moves to In progress'} onClick={() => timer.start(stepId, e)}><Icon name="play" size={14} /> {e?.status === 'paused' ? 'Resume' : 'Start'}</button>}
        {e?.status === 'running' && <button type="button" disabled={busy} title="Pause: log the time so far, the task stays In progress" onClick={() => timer.pause(e)}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flex: "none" }}><rect x="3.5" y="2.5" width="6.5" height="19" rx="1.8" /><rect x="14" y="2.5" width="6.5" height="19" rx="1.8" /></svg> Pause</button>}
        {(e?.status === 'running' || e?.status === 'paused') && <button type="button" disabled={busy} title="End: complete the task, or finish for today" onClick={() => timer.end(e)}>End</button>}
        {e?.status === 'abandoned' && <button type="button" disabled={busy} title="Put this empty timer entry on another day" onClick={() => timer.setAgain(e)}>Move or copy</button>}
      </div>
    </div>
  )
}
