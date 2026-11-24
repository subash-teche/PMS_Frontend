import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Eye, LayoutTemplate, ListOrdered, CalendarClock, CheckCircle2, CircleDot, ClipboardList, Download, Pause, Pencil, Play, Plus, Lock, Search, Timer, Trash2, UserRound, Users } from 'lucide-react';
import { taskAccessApi, tasksApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useAuth, usePermissions } from '@/auth/auth-context';
import { Topbar } from '@/components/layout/Topbar';
import { EmptyState } from '@/components/ui/Display';
import { Dropdown } from '@/components/ui/Dropdown';
import { ActiveFilters, SingleFilter } from '@/components/ui/ListKit';
import { KpiSection, WatermarkCard } from '@/components/ui/MetricCards';
import { TableFoot } from '@/components/ui/Pager';
import { ColumnPicker, RowMenu, useColumns } from '@/components/ui/ColumnPicker';
import { TableLoading } from '@/components/ui/Loader';
import { useConfirm } from '@/components/ui/confirm-context';
import { useToast } from '@/components/ui/toast-context';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionState } from '@/hooks/useSessionState';
import { SCREENS, TASK_STATUS, TASK_STATUS_OPTIONS } from '@/lib/constants';
import { downloadCsv } from '@/lib/csv';
import { formatDate, formatDateTime, formatDayMonth } from '@/lib/format';
import { todayIso, zonedParts } from '@/lib/timezone';
import { StatusChangeModal } from './StatusChangeModal';
import { LogTimeModal } from '@/pages/timesheet/LogTimeModal';
import { TaskTabs } from './TaskTabs';

const EMPTY_FILTERS = { status: [], categoryId: [], projectId: [], assignedTo: [], employeeId: [], overdue: false };

/** "2 h 30 min" from minutes. */
export const formatMinutes = (m) => {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return [h && `${h} h`, min && `${min} min`].filter(Boolean).join(' ');
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (iso) => iso.split('-').map(Number);

/** "26 – 31 Oct", "28 Oct – 3 Nov", "28 Dec 2026 – 3 Jan 2027" (dates in the user's time zone). */
export function dateRange(start, end) {
  const a = start ? zonedParts(start).date : null;
  const b = end ? zonedParts(end).date : null;
  if (!a || !b) return a || b ? formatDayMonth(a || b) : '—';
  const [sy, sm, sd] = ymd(a);
  const [ey, em, ed] = ymd(b);
  const thisYear = ymd(todayIso())[0];
  if (sy !== ey) return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  const year = ey !== thisYear ? ` ${ey}` : '';
  if (sm !== em) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}${year}`;
  if (sd === ed) return `${ed} ${MONTHS[em - 1]}${year}`;
  return `${sd} – ${ed} ${MONTHS[em - 1]}${year}`;
}

/** "in 5 days" / "tomorrow" / "due today" / "2 days overdue" / "done 23 Oct" + its tone. */
export function dueLabel(t) {
  if (t.status === 'completed') return { text: t.completedOn ? `done ${formatDayMonth(t.completedOn)}` : 'done', tone: 'done' };
  if (!t.plannedEnd) return null;
  const days = Math.round((Date.parse(zonedParts(t.plannedEnd).date) - Date.parse(todayIso())) / 86400000);
  if (days > 1) return { text: `in ${days} days`, tone: '' };
  if (days === 1) return { text: 'tomorrow', tone: 'soon' };
  if (days === 0) return { text: t.isOverdue ? 'overdue' : 'due today', tone: t.isOverdue ? 'late' : 'soon' };
  return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'late' };
}

/** "26 – 31 Oct · in 5 days" */
export function TaskTimeline({ task: t }) {
  if (!t.plannedEnd) return <span className="muted small">No dates</span>;
  const due = dueLabel(t);
  return (
    <span className="task-timeline" title={`Earliest start ${formatDateTime(t.plannedStart)} · End before ${formatDateTime(t.plannedEnd)}`}>
      {dateRange(t.plannedStart, t.plannedEnd)}
      {due && (
        <>
          <span className="tt-sep">·</span>
          <span className={`tt-due${due.tone ? ` is-${due.tone}` : ''}`}>{due.text}</span>
        </>
      )}
    </span>
  );
}

/** "Sundar → Subash" (owner → assignee), or "Subash · own task" */
export function TaskPeople({ task: t }) {
  if (t.ownerId && t.ownerId === t.assignedTo) {
    return (
      <span className="task-people" title="Owner and assignee">
        <span className="tp-name">{t.ownerName}</span>
        <span className="tp-own">· own task</span>
      </span>
    );
  }
  return (
    <span className="task-people" title={`Owner: ${t.ownerName ?? '—'} · Assigned to: ${t.assignedToName ?? '—'}`}>
      <span className="tp-owner">{t.ownerName ?? '—'}</span>
      <span className="tp-arrow">→</span>
      <span className="tp-name">{t.assignedToName ?? '—'}</span>
    </span>
  );
}

/** "1/3" badge (green when all done), or a dash */
export const StatusBadge = ({ status }) => <span className={`badge ${TASK_STATUS[status]?.badge ?? ''}`}>{TASK_STATUS[status]?.label ?? status}</span>;

function Summary({ s }) {
  return (
    <KpiSection storageKey="tasks">
      <WatermarkCard tone="info" title="Open" icon={CircleDot} value={s ? s.toDo + s.inProgress : 0} subs={s && [[s.toDo, 'To do'], [s.inProgress, 'In progress']]} />
      <WatermarkCard tone="warning" title="Due today" icon={CalendarClock} value={s?.dueToday ?? 0} subs={s && [[s.hold, 'On hold']]} />
      <WatermarkCard tone="danger" title="Overdue" icon={AlarmClock} value={s?.overdue ?? 0} subs={s && [[s.total, 'All tasks']]} />
      <WatermarkCard tone="success" title="Completed" icon={CheckCircle2} value={s?.completed ?? 0} subs={s && [[s.completedThisWeek, 'This week']]} />
    </KpiSection>
  );
}

export default function TaskListPage() {
  const perms = usePermissions(SCREENS.TASKS);
  const [logFor, setLogFor] = useState(null);
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  // opened from the 1-3-5 tab on My / All tasks
  const [scope, setScope] = useSessionState('tasks.scope', useLocation().state?.scope ?? 'mine');
  const [search, setSearch] = useSessionState('tasks.search', '');
  const [filters, setFilters] = useSessionState('tasks.filters', EMPTY_FILTERS);
  const [page, setPage] = useSessionState('tasks.page', 1);
  const [pageSize, setPageSize] = useSessionState('tasks.pageSize', 10);
  const debouncedSearch = useDebounce(search);
  const all = scope === 'all';

  const options = useQuery({ queryKey: ['tasks', 'options'], queryFn: tasksApi.options, staleTime: 5 * 60 * 1000 });
  const opt = (rows, label = (r) => r.name) => (rows ?? []).map((r) => ({ value: r.id, label: label(r) }));
  const categoryOptions = opt(options.data?.categories);
  const projectOptions = opt(options.data?.projects);
  const userOptions = opt(options.data?.users);

  const params = { scope: all ? 'all' : 'mine', search: debouncedSearch, ...filters, overdue: filters.overdue || undefined, page, pageSize };
  const list = useQuery({ queryKey: ['tasks', 'list', params], queryFn: () => tasksApi.list(params), placeholderData: keepPreviousData });
  // Employee filter: people whose tasks I can see (role scope, my projects, Task Master)
  const people = useQuery({ queryKey: ['task-access', 'visible-users'], queryFn: taskAccessApi.visibleUsers, staleTime: 5 * 60 * 1000 });
  const employeeOptions = (people.data ?? []).map((u) => ({ value: u.id, label: u.id === user.id ? `${u.name} (me)` : u.name }));
  const employeeIds = filters.employeeId ?? []; // filters saved before this filter have none
  const summary = useQuery({ queryKey: ['tasks', 'summary', params.scope, employeeIds], queryFn: () => tasksApi.summary(params.scope, employeeIds) });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });
  const [statusChange, setStatusChange] = useState(null); // { task, status } waiting for confirmation
  const setStatus = useMutation({
    mutationFn: ({ id, status, completedOn }) => tasksApi.update(id, { status, ...(completedOn ? { completedOn } : {}) }),
    onSuccess: (t) => {
      setStatusChange(null);
      toast.success(`"${t.name}" is ${TASK_STATUS[t.status].label.toLowerCase()}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id) => tasksApi.remove(id),
    onSuccess: () => toast.success('Task deleted'),
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: refresh,
  });

  const setFilter = useCallback(
    (k, v) => {
      setFilters((f) => ({ ...f, [k]: v }));
      setPage(1);
    },
    [setFilters, setPage],
  );

  const chips = useMemo(
    () => (filters.overdue ? [{ key: 'overdue', label: 'Show', value: 'Overdue only', onRemove: () => setFilter('overdue', false) }] : []),
    [filters.overdue, setFilter],
  );

  const exportRows = () =>
    downloadCsv(
      'tasks.csv',
      ['Task', 'Category', 'Project', 'Owner', 'Assigned to', 'Status', 'Earliest start', 'End before', 'Estimate (mins)', 'Completed on'],
      items.map((t) => [
        t.name,
        t.categoryName,
        t.projectTitle,
        t.ownerName,
        t.assignedToName,
        TASK_STATUS[t.status]?.label,
        t.plannedStart ? formatDateTime(t.plannedStart) : '',
        t.plannedEnd ? formatDateTime(t.plannedEnd) : '',
        t.estimatedMinutes,
        t.completedOn ?? '',
      ]),
    );

  const askDelete = async (t) => {
    // time logged in the timesheet: the task stays – checked before asking
    if (t.timesheetCount > 0) {
      toast.error(`Time is logged on "${t.name}" in the timesheet (${t.timesheetCount} entr${t.timesheetCount === 1 ? 'y' : 'ies'}) – it cannot be deleted.`);
      return;
    }
    const ok = await confirm({
      title: 'Delete task?',
      message: `"${t.name}" will be removed.`,
    });
    if (ok) remove.mutate(t.id);
  };

  // Starting, timing and completing a task is done in Task Management. People whose role cannot open it keep these here.
  const rowMenu = (t) => {
    const edit = perms.edit && t.canManage; // whole task: owner, creator, admins
    const move = !session?.apps?.includes('tm') && (t.assignedTo === user.id || t.canManage);
    const to = (status) => () => setStatusChange({ task: t, status });
    return (
      <RowMenu
        items={[
          { label: 'View details', icon: Eye, onClick: () => navigate(`/tasks/${t.id}`) },
          { label: 'Start (in progress)', icon: Play, hidden: !move || t.status !== 'to_do', onClick: to('in_progress') },
          { label: 'Resume', icon: Play, hidden: !move || t.status !== 'hold', onClick: to('in_progress') },
          { label: 'Mark completed', icon: CheckCircle2, hidden: !move || t.status !== 'in_progress', onClick: to('completed') },
          { label: 'Put on hold', icon: Pause, hidden: !move || t.status !== 'in_progress', onClick: to('hold') },
          { label: 'Reopen', icon: Play, hidden: !move || t.status !== 'completed', onClick: to('in_progress') },
          { label: 'Edit', icon: Pencil, hidden: !edit, onClick: () => navigate(`/tasks/${t.id}/edit`) },
          { divider: true, hidden: !(perms.delete && t.canDelete) },
          { label: 'Delete', icon: Trash2, danger: true, hidden: !(perms.delete && t.canDelete), onClick: () => askDelete(t) },
        ]}
      />
    );
  };

  const cols = useColumns(
    'tasks',
    [
      {
        key: 'task',
        label: 'Task',
        locked: true,
        td: (t) => (
          <td key="task" style={{ minWidth: 240, maxWidth: 340 }}>
            <Link className={`cell-title${t.isMasked ? ' is-private' : ''}`} to={`/tasks/${t.id}`} style={{ color: 'var(--ink)' }} title={t.isMasked ? 'Personal – the details are private' : undefined}>
              {t.isMasked && <Lock className="private-ico" />}
              {t.name}
            </Link>
            <div className="cell-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.projectTitle ?? undefined}>
              {t.categoryName}
              {t.projectTitle ? ` · ${t.projectTitle}` : ''}
            </div>
            {t.inToday135 && (
              <span className="tl-135-tag" title={t.assignedTo === user.id ? "On your 1-3-5 for today" : `On ${t.assignedToName}'s 1-3-5 for today`}>
                <ListOrdered />
                In today&apos;s 1-3-5
              </span>
            )}
          </td>
        ),
      },
      // "Sundar → Subash" (owner → assignee); one name for an own task
      {
        key: 'people',
        label: 'Owner → Assigned to',
        td: (t) => (
          <td key="people" className="nowrap">
            <TaskPeople task={t} />
          </td>
        ),
      },
      { key: 'status', label: 'Status', td: (t) => <td key="status"><StatusBadge status={t.status} /></td> },
      // "26 – 31 Oct · in 5 days" (earliest start – end before)
      {
        key: 'schedule',
        label: 'Timeline',
        td: (t) => (
          <td key="schedule" className="nowrap">
            <TaskTimeline task={t} />
          </td>
        ),
      },
      { key: 'estimate', label: 'Estimate', className: 'right', td: (t) => <td key="estimate" className="num right nowrap">{formatMinutes(t.estimatedMinutes)}</td> },
      { key: 'completedOn', label: 'Completed on', td: (t) => <td key="completedOn" className="nowrap">{t.completedOn ? formatDate(t.completedOn) : <span className="muted">—</span>}</td> },
    ],
  );

  const filtered = debouncedSearch || Object.entries(filters).some(([, v]) => (Array.isArray(v) ? v.length : v));

  return (
    <>
      <Topbar title="Task" breadcrumb={['Task']} />
      <Summary s={summary.data} />

      <div className="page-head">
        <TaskTabs
          active={params.scope}
          onScope={(key) => {
            setScope(key);
            setFilters((f) => ({ ...f, assignedTo: [] }));
            setPage(1);
          }}
        />
        <div className="actions">
          {perms.export && (
            <button type="button" className="btn btn-secondary" onClick={exportRows} disabled={!items.length}>
              <Download />
              Export
            </button>
          )}
          {perms.create && (
            <Link className="btn btn-secondary" to="/tasks/from-plan">
              <LayoutTemplate />
              Add from plan
            </Link>
          )}
          {perms.create && (
            <Link className="btn btn-primary" to="/tasks/new">
              <Plus />
              New task
            </Link>
          )}
        </div>
      </div>

      <div className="card card-flush">
        <div className="filter-bar">
          <div className="input-group search">
            <Search />
            <input
              className="input"
              placeholder="Search by task, description or project…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Dropdown pill multi placeholder="Status" options={TASK_STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilter('status', v)} />
          <SingleFilter placeholder="Category" options={categoryOptions} value={filters.categoryId} onChange={(v) => setFilter('categoryId', v)} />
          <SingleFilter search placeholder="Project" options={projectOptions} value={filters.projectId} onChange={(v) => setFilter('projectId', v)} />
          {employeeOptions.length > 1 && <SingleFilter search placeholder="Employee" options={employeeOptions} value={employeeIds} onChange={(v) => setFilter('employeeId', v)} />}
          {all && <SingleFilter search placeholder="Assigned to" options={userOptions} value={filters.assignedTo} onChange={(v) => setFilter('assignedTo', v)} />}
          <button type="button" className={`btn btn-sm ${filters.overdue ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('overdue', !filters.overdue)}>
            <AlarmClock />
            Overdue
          </button>
          <span className="spacer" />
          <ColumnPicker cols={cols} />
        </div>

        <ActiveFilters chips={chips} show={chips.length > 0} onClearAll={() => setFilters(EMPTY_FILTERS)} />

        {!list.isLoading && items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No tasks"
            action={
              perms.create && !filtered ? (
                <Link className="btn btn-primary btn-sm" to="/tasks/new">
                  <Plus />
                  New task
                </Link>
              ) : undefined
            }
          >
            {filtered ? 'No tasks match the filters.' : 'Create a task for yourself or your team.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-menu" />
                  {cols.columns.map((c) => (
                    <th key={c.key} className={c.className}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.isLoading && <TableLoading colSpan={cols.columns.length + 1} />}
                {items.map((t) => (
                  <tr key={t.id} style={t.status === 'completed' ? { opacity: 0.7 } : undefined}>
                    <td className="col-menu">{rowMenu(t)}</td>
                    {cols.columns.map((c) => c.td(t))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <TableFoot
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </div>
      <LogTimeModal job={logFor} onClose={() => setLogFor(null)} />
      <StatusChangeModal
        change={statusChange}
        busy={setStatus.isPending}
        onClose={() => setStatusChange(null)}
        onConfirm={(b) => setStatus.mutate({ id: statusChange.task.id, ...b })}
      />
    </>
  );
}
