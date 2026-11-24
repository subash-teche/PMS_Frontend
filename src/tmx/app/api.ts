import { api as http } from '@/api/client'

/*
 * The old Task Management screens talk to "their" API (/tasks, /plan, /timesheet, /messages, /users, /clients, /task-types).
 * Here those calls are answered by the PMS API (/api/v1/flow/...): the paths are translated and the few answers whose
 * shape differs (people, clients, task types, a task's client / type) are adapted. The screens themselves are unchanged.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const COLOURS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f', '#9333ea', '#0f766e']
export const colourOf = (id: number) => COLOURS[id % COLOURS.length]
export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return w.length === 1 ? w[0].slice(0, 2).toUpperCase() : w.slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?'
}

interface FlowOptions {
  projects: { id: number; code: string; title: string; customerId: number | null; customerName: string | null; ownerId: number; memberIds: number[]; taskGroups: { id: number; name: string; taskTypes: { id: number; name: string }[] }[] }[]
  users: { id: number; name: string; empCode: string | null }[]
}
interface Lookups { customers: { id: number; name: string }[]; types: { id: number; name: string }[] }

/** A task as the old screens expect it: the customer is its "client", the task type its "type". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adaptTask = (t: any) => ({
  ...t,
  clientId: t.customerId ?? null,
  typeId: t.taskTypeId ?? null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: (t.steps ?? []).map((s: any) => ({ ...s, taskId: t.id })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timeLogs: (t.timeLogs ?? []).map((l: any) => ({ ...l, taskId: t.id })),
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adaptTasks = (data: any): any => (Array.isArray(data) ? (data.length && data[0]?.steps ? data.map(adaptTask) : data) : data?.steps ? adaptTask(data) : data)

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = (opts.method ?? (opts.body === undefined ? 'GET' : 'POST')).toUpperCase()
  const [pathname, query = ''] = path.split('?')
  try {
    // people, customers and task types come from the PMS lists
    if (method === 'GET' && pathname === '/users') {
      const o = (await http.get<FlowOptions>('/flow/options')).data
      return o.users.map((u) => ({ id: u.id, name: u.name, email: '', initials: initialsOf(u.name), colour: colourOf(u.id), role: 'member', active: true, mustChangePassword: false })) as T
    }
    if (method === 'GET' && (pathname === '/clients' || pathname === '/task-types')) {
      const l = (await http.get<Lookups>('/flow/lookups')).data
      return (pathname === '/clients' ? l.customers : l.types).map((x) => ({ ...x, active: true })) as T
    }
    if (method === 'GET' && pathname === '/options') return (await http.get('/flow/options')).data as T

    let url: string
    if (pathname.startsWith('/tasks')) {
      // the old filters are named client / type
      const q = new URLSearchParams(query)
      if (q.has('client')) { q.set('customerId', q.get('client')!); q.delete('client') }
      if (q.has('type')) { q.set('taskTypeId', q.get('type')!); q.delete('type') }
      url = `/flow${pathname}${q.toString() ? `?${q}` : ''}`
    } else if (pathname.startsWith('/plan') || pathname.startsWith('/day')) url = `/flow${path}`
    else if (pathname.startsWith('/timesheet')) url = `/flow/timer${path.slice('/timesheet'.length)}`
    else if (pathname.startsWith('/messages')) {
      const one = /^\/messages\/(\d+)\/read$/.exec(pathname) // marking one message read
      if (one) return (await http.post('/flow/messages/read-many', { ids: [Number(one[1])] })).data as T
      url = `/flow${path}`
    } else throw new ApiError(404, `Not available in Task Management: ${path}`)

    const res = await http.request({ url, method, data: opts.body })
    return (pathname.startsWith('/tasks') ? adaptTasks(res.data) : res.data) as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string }
    throw new ApiError(err.response?.status ?? 0, err.response?.data?.message ?? err.message ?? 'Request failed')
  }
}
