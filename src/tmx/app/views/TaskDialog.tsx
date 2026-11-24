import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { confirmDialog, DialogX } from '../dialogs'
import { useUsers } from '../hooks'
import { isTaskOwner, STATUS_LABEL, totalMinutes, type Task, type User } from '../types'
import { Icon } from '../icons'
import { Avatar, FlowEditor, PersonName } from './FlowEditor'
import { TaskThread, when } from './Chat'
import { DatePicker } from './Pickers'

interface FlowOptions {
  projects: { id: number; code: string; title: string; customerName: string | null; ownerId: number; memberIds: number[]; taskGroups: { id: number; name: string; taskTypes: { id: number; name: string }[]; mainTasks: { id: number; name: string }[] }[] }[]
}

interface ActivityRow { id: number; action: string; detail: string; createdAt: string; userId: number | null }

/** How an activity row reads: who did what, with the detail shown as a pill, a quote or plain text. */
const ACTIVITY: Record<string, { verb: string; tone: string }> = {
  created: { verb: 'created the task', tone: 'grey' },
  imported: { verb: 'imported the task', tone: 'grey' },
  accept: { verb: 'accepted the task', tone: 'blue' },
  start: { verb: 'started working', tone: 'blue' },
  close: { verb: 'closed their step', tone: 'green' },
  'logged time': { verb: 'logged time', tone: 'amber' },
  comment: { verb: 'left a note', tone: 'purple' },
  passed: { verb: 'handed it over', tone: 'purple' },
  'circled back': { verb: 'sent it for a circle back', tone: 'purple' },
  edited: { verb: 'edited the task', tone: 'grey' },
  'flow edited': { verb: 'changed the flow', tone: 'grey' },
}

type DialogProps = { task?: Task; me: User; onClose: () => void; /** A new task was created (e.g. to plan it for the day it was added from). */ onCreated?: (task: Task) => void }

export function TaskDialog(props: DialogProps) {
  return <TaskDialogForm {...props} />
}

function TaskDialogForm({ task, me, onClose, onCreated }: DialogProps) {
  const qc = useQueryClient()
  const users = useUsers().data ?? []
  // the projects the person may create tasks in, with their task groups, task types and main tasks
  const projects = useQuery({ queryKey: ['flow-options'], queryFn: () => api<FlowOptions>('/options'), staleTime: 60_000 }).data?.projects ?? []

  const canEditFlow = true // any Task Management user may change who is in a flow
  const canDelete = !task || me.role === 'admin' || isTaskOwner(task, me.id)
  const doneIds = task?.steps.filter((s) => s.status === 'done').map((s) => s.userId) ?? []
  const openIds = task?.steps.filter((s) => s.status !== 'done').map((s) => s.userId) ?? []

  const [form, setForm] = useState({
    title: task?.title ?? '',
    projectId: task ? String(task.projectId) : '',
    groupId: task ? String(task.taskGroupId) : '',
    typeId: task ? String(task.taskTypeId) : '',
    dueDate: task?.dueDate ?? '',
    media: task?.media ?? '',
    description: task?.description ?? '',
    notes: task?.notes ?? '',
    ownerId: task ? String(task.ownerId) : '', // empty: the server decides (you, or the project owner for an admin who is not on the project)
  })
  const [flow, setFlowState] = useState<number[]>(task ? openIds : me.role === 'admin' ? [] : [me.id]) // a new task starts with its owner as the first person
  // A new task is either a flow (several people, in order) or goes to one person. The owner of a task that is not a flow is whoever creates it.
  const [isFlow, setIsFlow] = useState(true)
  const [assignee, setAssignee] = useState(task ? '' : String(me.id))
  // On a new task the owner is the first person in the flow, until an admin picks someone else by hand.
  const [ownerPicked, setOwnerPicked] = useState(false)
  const setFlow = (next: number[]) => {
    setFlowState(next)
    if (!task && me.role === 'admin' && !ownerPicked && next.length) setForm((f) => ({ ...f, ownerId: String(next[0]) }))
  }
  const project = projects.find((p) => String(p.id) === form.projectId)
  const group = project?.taskGroups.find((g) => String(g.id) === form.groupId)
  // everyone in a flow, and every owner, must be on the project (its owner or a member)
  const peopleIds = project ? [project.ownerId, ...project.memberIds] : undefined
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const activity = useQuery({
    queryKey: ['activity', task?.id],
    queryFn: () => api<ActivityRow[]>(`/tasks/${task!.id}/activity`),
    enabled: !!task,
  })

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        title: form.title,
        dueDate: form.dueDate || null,
        media: form.media,
        description: form.description,
        notes: form.notes,
      }
      if (!task) {
        if (!project) throw new Error('Select the project')
        if (!group) throw new Error('Select the task group')
        if (!form.typeId) throw new Error('Select the task type')
        if (!isFlow && !assignee) throw new Error('Select who the task is assigned to')
        return api('/tasks', {
          // not a flow: one person, and the owner is left out so the server makes the creator the owner
          body: { ...fields, projectId: Number(form.projectId), taskGroupId: Number(form.groupId), taskTypeId: Number(form.typeId), flow: isFlow ? flow : [Number(assignee)], ...(isFlow && form.ownerId ? { ownerIds: [Number(form.ownerId)] } : {}) },
        })
      }
      const ownerChanged = me.role === 'admin' && Number(form.ownerId) !== task.ownerId
      let updated = await api<Task>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: { ...fields, version: task.version, ...(form.typeId && Number(form.typeId) !== task.taskTypeId ? { taskTypeId: Number(form.typeId) } : {}), ...(ownerChanged ? { ownerIds: [Number(form.ownerId)] } : {}) },
      })
      if (canEditFlow && JSON.stringify(flow) !== JSON.stringify(openIds)) {
        updated = await api<Task>(`/tasks/${task.id}/flow`, { method: 'PUT', body: { version: updated.version, userIds: flow } })
      }
      return updated
    },
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ['tasks'] }); if (!task) onCreated?.(saved as Task); onClose() },
  })

  const remove = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); onClose() },
  })

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate() }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <DialogX onClose={onClose} />
        <h2>{task ? 'Edit task' : 'New task'}</h2>
        <p className="muted help">{task ? 'Change the details, or the people in its flow.' : 'Fill in the details, then choose who works on it and in what order.'}</p>
        <label>Title<input value={form.title} onChange={set('title')} required maxLength={300} autoFocus /></label>
        <div className="grid2">
          <label>Due date<DatePicker value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} /></label>
          <label>Project
            {task ? (
              <input value={`${task.projectCode} · ${task.projectTitle}`} disabled />
            ) : (
              <select value={form.projectId} onChange={(e) => { setForm((f) => ({ ...f, projectId: e.target.value, groupId: '', typeId: '' })); setFlowState((fl) => fl.filter((id) => { const p = projects.find((x) => String(x.id) === e.target.value); return !p || id === p.ownerId || p.memberIds.includes(id) })); setAssignee((a) => { const p = projects.find((x) => String(x.id) === e.target.value); return !p || !a || Number(a) === p.ownerId || p.memberIds.includes(Number(a)) ? a : '' }) }} required>
                <option value="">Select a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}{p.customerName ? ` (${p.customerName})` : ''}</option>)}
              </select>
            )}
          </label>
          <label>Task group
            {task ? (
              <input value={task.taskGroupName} disabled />
            ) : (
              <select value={form.groupId} onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value, typeId: '' }))} disabled={!project} required>
                <option value="">{project ? 'Select a task group…' : 'Select a project first'}</option>
                {(project?.taskGroups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </label>
          <label>Task type
            <select value={form.typeId} onChange={set('typeId')} disabled={!group} required>
              <option value="">{group ? 'Select a task type…' : task ? task.taskTypeName : 'Select a task group first'}</option>
              {(group?.taskTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>Media<input value={form.media} onChange={set('media')} placeholder="Link or file name" /></label>
          <label>Owner
            {!task && !isFlow ? (
              <input value={users.find((u) => u.id === (me.role === 'admin' && project && peopleIds && !peopleIds.includes(me.id) ? project.ownerId : me.id))?.name ?? ''} disabled title="Whoever creates the task owns it" />
            ) : me.role === 'admin' ? (
              <select value={form.ownerId} onChange={(e) => { setOwnerPicked(true); set('ownerId')(e) }}>
                {!task && <option value="">Default</option>}
                {users.filter((u) => u.active && (!peopleIds || peopleIds.includes(u.id))).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input value={users.find((u) => u.id === Number(form.ownerId || me.id))?.name ?? ''} disabled />
            )}
          </label>
        </div>
        <label>Description<textarea rows={4} value={form.description} onChange={set('description')} /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>

        {!task && (
          <div className="flow-switch">
            <span className="time-heading">Flow task?</span>
            <div className="seg" role="radiogroup" aria-label="Flow task">
              <button type="button" role="radio" aria-checked={isFlow} className={isFlow ? 'on' : ''} onClick={() => setIsFlow(true)}>Yes · several people, in order</button>
              <button type="button" role="radio" aria-checked={!isFlow} className={!isFlow ? 'on' : ''} onClick={() => setIsFlow(false)}>No · one person</button>
            </div>
          </div>
        )}
        {task || isFlow ? (
          <fieldset>
            <legend>Flow: who works on it, in order</legend>
            <p className="muted help">The first person receives the task. When they close their step it goes to the next person.</p>
            <FlowEditor value={flow} onChange={setFlow} locked={doneIds} disabled={!canEditFlow} allowRepeat allowedIds={peopleIds} />
            {!task && <p className="muted help">Only people on the project can be added.</p>}
          </fieldset>
        ) : (
          <label>Assigned to
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} required>
              <option value="">Select a person…</option>
              {users.filter((u) => u.active && (!peopleIds || peopleIds.includes(u.id))).map((u) => <option key={u.id} value={u.id}>{u.id === me.id ? `${u.name} (you)` : u.name}</option>)}
            </select>
            <span className="muted help">This person receives the task to accept. Only people on the project can be chosen.</span>
          </label>
        )}

        {task && task.timeLogs.length > 0 && (
          <section className="panel time-panel">
            <div className="panel-head">
              <h3>Time spent</h3>
              <span className="time-total">{totalMinutes(task)} <small>min</small></span>
            </div>
            <div className="time-people">
              {[...task.timeLogs.reduce((m, l) => m.set(l.userId, (m.get(l.userId) ?? 0) + l.minutes), new Map<number, number>())].map(([id, mins]) => (
                <span key={id} className="time-person"><Avatar userId={id} size={22} /><PersonName id={id} /><strong>{mins} min</strong></span>
              ))}
            </div>
            <table className="time-table">
              <thead>
                <tr><th>Date</th><th>Person</th><th>Step</th><th className="num">Minutes</th><th>Note</th></tr>
              </thead>
              <tbody>
                {[...task.timeLogs].reverse().map((l) => {
                  const ordered = [...task.steps].sort((a, b) => a.position - b.position)
                  const at = ordered.findIndex((s) => s.id === l.stepId)
                  return (
                    <tr key={l.id}>
                      <td className="muted nowrap">{when(l.createdAt)}</td>
                      <td><span className="time-who"><Avatar userId={l.userId} size={22} /><PersonName id={l.userId} /></span></td>
                      <td className="muted nowrap">{at >= 0 ? `Step ${at + 1}` : '–'}</td>
                      <td className="num"><span className="pill">{l.minutes} min</span></td>
                      <td className="time-note">{l.note || <span className="muted">–</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Total</td><td className="num"><strong>{totalMinutes(task)} min</strong></td><td /></tr>
              </tfoot>
            </table>
          </section>
        )}

        {task && (
          <fieldset>
            <legend>Messages about this task</legend>
            <TaskThread taskId={task.id} me={me} />
          </fieldset>
        )}

        {task && (
          <details className="panel history-panel">
            <summary>History <span className="count">{activity.data?.length ?? 0}</span></summary>
            <ol className="timeline">
              {activity.data?.map((a) => {
                const kind = ACTIVITY[a.action] ?? { verb: a.action, tone: 'grey' }
                const to = a.action === 'passed' || a.action === 'circled back' ? users.find((u) => u.id === Number(/user (\d+)/.exec(a.detail)?.[1]))?.name : undefined
                return (
                  <li key={a.id} className={`tl-${kind.tone}`}>
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <span>
                        <strong>{a.userId ? <PersonName id={a.userId} /> : 'System'}</strong> {kind.verb}
                        {to && <> to <strong>{to}</strong></>}
                        {(a.action === 'close' || a.action === 'logged time') && a.detail && <> <span className="pill">{a.detail}</span></>}
                        {(a.action === 'edited' || a.action === 'imported') && a.detail && <span className="muted"> · {a.detail}</span>}
                      </span>
                      {a.action === 'comment' && a.detail && <q className="tl-quote">{a.detail}</q>}
                    </div>
                    <span className="muted when">{when(a.createdAt)}</span>
                  </li>
                )
              })}
            </ol>
            <div className="step-chain" aria-label="Where the task is in its flow">
              {[...task.steps].sort((a, b) => a.position - b.position).map((s, i) => (
                <span key={s.id} className="chain-item">
                  {i > 0 && <Icon name="arrow-right" size={14} className="chain-arrow" />}
                  <Avatar userId={s.userId} size={22} /><PersonName id={s.userId} /> <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </span>
              ))}
            </div>
          </details>
        )}

        <div className="dialog-actions">
          {task && canDelete && (
            <button type="button" className="danger" onClick={async () => (await confirmDialog({ title: 'Delete this task?', message: 'The task, its flow and its history are removed. Time already logged stays in the PMS Timesheet.', confirmLabel: 'Delete', danger: true })) && remove.mutate()}>Delete</button>
          )}
          <span className="spacer" />
          <button className="primary" disabled={save.isPending}>{task ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}
