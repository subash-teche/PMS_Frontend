export type StepStatus = 'waiting' | 'offered' | 'todo' | 'active' | 'done'

export interface User {
  id: number
  name: string
  email: string
  initials: string
  colour: string
  role: 'admin' | 'member'
  active: boolean
  mustChangePassword: boolean
}

export interface Lookup { id: number; name: string; active: boolean }

export interface Step {
  id: number
  taskId: number
  userId: number
  position: number
  status: StepStatus
  acceptedAt: string | null
  startedAt: string | null
  closedAt: string | null
  minutes: number | null // time spent, set when the step is closed
}

/** Some time someone logged on a task, part-way through a step or when closing it. */
export interface TimeLog { id: number; taskId: number; stepId: number | null; userId: number; minutes: number; note: string; workDate?: string; createdAt: string }

export interface Task {
  id: number
  month: string
  clientId: number | null
  typeId: number | null
  title: string
  description: string
  notes: string
  ownerId: number
  ownerIds: number[]
  dueDate: string | null
  media: string
  priorityRank: number
  version: number
  createdAt: string
  completedAt: string | null
  steps: Step[]
  timeLogs: TimeLog[]
  // a task belongs to a project, a task group and a task type
  projectId: number
  projectCode: string
  projectTitle: string
  customerName?: string | null
  taskGroupId: number
  taskGroupName: string
  taskTypeId: number
  taskTypeName: string
  status: 'to_do' | 'in_progress' | 'completed'
}

/** A step in someone's plan: stored as a day or a week by date; see shared/plan.ts for the column it shows in. */
export interface PlanItem { id: number; taskId: number; stepId: number; scope: 'day' | 'week'; startDate: string; position: number }

/** One line of a person's timesheet: a task they work on, with a timer. */
export type TimeEntryStatus = 'ready' | 'running' | 'paused' | 'ended' | 'abandoned'
export interface TimeEntry { id: number; taskId: number; stepId: number; day: string; status: TimeEntryStatus; runStartedAt: string | null; minutes: number }

export interface Template { id: number; name: string; createdBy: number | null; userIds: number[] }

/** A message in the team feed: visible to everyone, optionally tagged with a task and with people. */
export interface Post {
  id: number
  taskId: number | null
  taskTitle: string | null
  authorId: number
  kind: 'note' | 'handover' | 'close'
  body: string
  /** Sent in a one-to-one chat: only its author and the person it tags see it. */
  isPrivate: boolean
  createdAt: string
  mentions: { userId: number; readAt: string | null }[]
}
export interface Feed { unread: number; items: Post[] }

export interface Filters { month: string; owner: string; client: string; type: string }

export const STATUS_LABEL: Record<StepStatus, string> = {
  waiting: 'Waiting',
  offered: 'New',
  todo: 'To do',
  active: 'In progress',
  done: 'Done',
}

/** Total minutes logged on a task, across everyone who worked on it. */
export const totalMinutes = (t: Task) => (t.timeLogs ?? []).reduce((n, l) => n + l.minutes, 0)

/** Every owner of a task. They can all edit it. */
export const ownersOf = (t: Task) => (t.ownerIds?.length ? t.ownerIds : [t.ownerId])
export const isTaskOwner = (t: Task, userId: number) => ownersOf(t).includes(userId)

export const currentStep = (t: Task): Step | undefined =>
  [...t.steps].sort((a, b) => a.position - b.position).find((s) => s.status !== 'done')

/** One slot of a person's 1-3-5 for a day (the same list the PMS 1-3-5 page shows). */
export interface DayItem {
  id: number
  position: number
  size: 'big' | 'medium' | 'small'
  /** The task in this slot. */
  taskId: number
  title: string
  minutes: number
  isDone: boolean
  /** The day's plan is done but the task is still open ("Done for today"). */
  planDone?: boolean
  /** Where the person's own step is, for a Task Management task. */
  stepStatus: StepStatus | null
  /** A day that is over whose task went on to a later day: shown as Carryover, not as done / in progress. */
  carryover?: boolean
  dueDate: string | null
  projectCode: string | null
  projectTitle: string | null
}
export interface Day { date: string; today: string; slots: number; /** Tasks planned for the day that did not fit in the slots. */ waiting?: number; items: DayItem[] }
