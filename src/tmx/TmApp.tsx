import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityBar } from '../hooks/useActivity'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/auth-context'
import css from './tmx.css?inline'
import { dubaiMonth } from './shared/dates'
import { ApiError, colourOf, initialsOf } from './app/api'
import { DialogHost, notifyError } from './app/dialogs'
import { Icon } from './app/icons'
import type { Filters, User } from './app/types'
import { Board } from './app/views/Board'
import { Dashboard } from './app/views/Dashboard'
import { MessagesView, type Convo } from './app/views/MessagesPage'
import { FilterBar } from './app/views/FilterBar'

/*
 * Tasks: the Board (with Plan), 1-3-5 and Messages, with the design of the original Task Management app.
 * The original screens (./app) run unchanged except where PMS needs something different (see ./README.md); their
 * stylesheet is applied inside a Shadow DOM so it cannot clash with PMS styles, and ./app/api.ts answers their data
 * calls from the PMS API.
 */

export type Tab = 'dashboard' | 'stages' | 'plan' | 'messages'
/** One app: the Tasks menu opens the board; the 1-3-5 and the tracker are buttons on it; Messages is its own menu. */
const PATH: Record<Tab, string> = { dashboard: '/tasks', stages: '/tasks/stages', plan: '/tasks/plan', messages: '/messages' }
const TITLE: Record<Tab, string> = { dashboard: 'Tasks', stages: 'Tasks', plan: 'Tasks', messages: 'Messages' }
const SUBTITLE: Record<Tab, string> = {
  dashboard: 'Your day as a 1-3-5: one big, three medium and five small things.',
  stages: 'Every task, in the column of the person who has it now.',
  plan: 'Plan the work of the day, week or month.',
  messages: 'Chat with the team or one person. Tag a task to link a message to it.',
}

function Shell({ me, tab }: { me: User; tab: Tab }) {
  const nav = useNavigate()
  const setTab = (k: Tab) => nav(PATH[k])
  const [filters, setFilters] = useState<Filters>({ month: '', owner: '', client: '', type: '' })
  // Which chat the Messages tab shows. The bell opens it on the person who wrote.
  // The bell in the PMS menu opens the chat of the person who wrote (it passes their id in the route state).
  const opened = (useLocation().state as { personId?: number } | null)?.personId
  const [convo, setConvo] = useState<Convo>(opened ? { kind: 'person', id: opened } : { kind: 'team' })
  const filtered = tab === 'stages' || tab === 'plan'
  const title = TITLE[tab]

  return (
    <>
      <ActivityBar />
      <div className={tab === 'messages' ? 'content content-chat' : 'content'}>
        {tab !== 'messages' && (
          <div className="task-bar">
            <h1 className="task-bar-title">{title}</h1>
            <div className="seg" role="tablist" aria-label="Tasks view">
              {([['dashboard', '1-3-5'], ['stages', 'Stages'], ['plan', 'Plan']] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            <button type="button" className="primary" onClick={() => nav('/tasks/new', { state: { from: '/tasks' } })}>+ New task</button>
            {filtered && <FilterBar filters={filters} onChange={setFilters} />}
          </div>
        )}
        <main>
          {tab === 'dashboard' && <Dashboard me={me} />}
          {(tab === 'stages' || tab === 'plan') && <Board me={me} filters={filters} mode={tab} />}
          {tab === 'messages' && <MessagesView me={me} convo={convo} onConvo={setConvo} />}
        </main>
      </div>
    </>
  )
}

/** The signed-in PMS user, in the shape the old screens use. */
function useMe(): User | null {
  const { user } = useAuth()
  return useMemo(
    () => (user ? { id: user.id, name: user.name, email: user.email ?? '', initials: initialsOf(user.name), colour: colourOf(user.id), role: user.isSuperAdmin || user.role?.code === 'ADMIN' ? 'admin' : 'member', active: true, mustChangePassword: false } : null),
    [user],
  )
}

/** Task Management has its own data cache, so its query keys never meet PMS's. */
function makeClient() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: true } },
    mutationCache: new MutationCache({ onSuccess: () => qc.invalidateQueries() }), // after any save, every screen is fetched again
    queryCache: new QueryCache({ onError: (e) => { if (e instanceof ApiError && e.status === 403) notifyError(e.message) } }),
  })
  return qc
}

/** Draws its children inside a Shadow DOM that carries the Task Management stylesheet. */
function ShadowHost({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const host = hostRef.current!
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    if (!shadow.querySelector('style')) {
      const style = document.createElement('style')
      style.textContent = css
      shadow.appendChild(style)
    }
    let container = shadow.querySelector<HTMLElement>('.tmx-root')
    if (!container) {
      container = document.createElement('div')
      container.className = 'tmx-root'
      shadow.appendChild(container)
    }
    setMount(container)
  }, [])
  return <div ref={hostRef} className="tmx-host" style={{ display: 'block', minHeight: '100vh' }}>{mount && createPortal(children, mount)}</div>
}

function Inner({ tab }: { tab: Tab }) {
  const me = useMe()
  useEffect(() => { document.title = `${TITLE[tab]} · emQube` }, [tab])
  if (!me) return <p className="muted pad">Loading…</p>
  return <Shell me={me} tab={tab} />
}

/** A Task Management screen inside the PMS layout (the PMS sidebar stays). */
export default function TmApp({ tab }: { tab: Tab }) {
  const client = useMemo(makeClient, [])
  return (
    <div className="tm-page">
      <ShadowHost>
        <QueryClientProvider client={client}>
          <Inner tab={tab} />
          <DialogHost />
        </QueryClientProvider>
      </ShadowHost>
    </div>
  )
}
