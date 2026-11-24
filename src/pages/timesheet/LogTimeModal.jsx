import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Timer } from 'lucide-react';
import { timesheetsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/toast-context';
import { blockNonNumericKeys } from '@/lib/percent';
import { formatDayMonth } from '@/lib/format';
import { todayIso } from '@/lib/timezone';

const QUICK = [15, 30, 60];
const hm = (min) => [Math.floor(min / 60) && `${Math.floor(min / 60)} h`, min % 60 && `${min % 60} min`].filter(Boolean).join(' ');

/**
 * Quick "Add to timesheet" for a task (from the task list, the task page or the 1-3-5): a small popup where
 * everything comes from the task (shown read-only) and only the time spent, in minutes, is entered.
 * Day: the 1-3-5 day it was opened from (not in the future), else today. Opens when `job` is set:
 *   { taskId, title, minutes?, date? }
 */
export function LogTimeModal({ job, onClose }) {
  if (!job) return <Modal open={false} />;
  return <LogTimeForm key={`${job.taskId}-${job.date ?? ''}`} job={job} onClose={onClose} />;
}

function LogTimeForm({ job, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = todayIso();
  const date = job.date && job.date <= today ? job.date : today;
  const comment = job.title ?? '';
  // everything comes from the task: the tasks I work on, with their project and category
  const options = useQuery({ queryKey: ['timesheets', 'options'], queryFn: timesheetsApi.options });
  const loaded = options;
  const [minutes, setMinutes] = useState(job.minutes ? String(job.minutes) : '');
  const [tried, setTried] = useState(false);

  let facts = [];
  let body = null;
  let blocked = null;
  if (loaded.isSuccess) {
    const task = options.data.find((t) => t.id === job.taskId);
    if (!task) blocked = 'Only a person on the task can log time on it.';
    else {
      facts = [task.projectTitle ? ['Project', task.projectTitle] : ['Category', task.categoryName ?? '—']];
      body = {};
    }
  }
  const total = Number(minutes) || 0;

  const save = useMutation({
    mutationFn: () => timesheetsApi.create({ workDate: date, taskId: job.taskId, minutes: total, comment, ...body }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`${hm(saved.minutes)} added to the timesheet for ${date === today ? 'today' : formatDayMonth(date)}`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const timeError = !total ? 'Enter the minutes spent' : total > 1440 ? 'At most 1440 minutes (24 h)' : null;
  const submit = () => {
    setTried(true);
    if (!timeError && body) save.mutate();
  };

  return (
    <Modal
      open
      title="Add to timesheet"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary" disabled={save.isPending || !body} onClick={submit}>
            <Check />
            {save.isPending ? 'Adding…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="t135-tm-task">
        <span className="t135-tm-ico">
          <Timer />
        </span>
        <div>
          <span className="t135-tm-label">Task</span>
          <b>{job.title}</b>
        </div>
      </div>

      {loaded.isLoading ? (
        <Spinner />
      ) : loaded.isError ? (
        <div className="alert alert-warning">
          <Info />
          <div>{errorMessage(loaded.error)}</div>
        </div>
      ) : blocked ? (
        <div className="alert alert-warning">
          <Info />
          <div>{blocked}</div>
        </div>
      ) : (
        <>
          <dl className="lt-facts">
            {facts.map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </span>
            ))}
            <dt>Day</dt>
            <dd>{date === today ? `Today, ${formatDayMonth(date)}` : formatDayMonth(date)}</dd>
          </dl>

          <label className="lt-minutes">
            <span>Time spent (minutes)</span>
            <div className="lt-min-row">
              <div className="input-group">
                <input
                  className="input has-trail"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                  value={minutes}
                  onKeyDown={(e) => {
                    blockNonNumericKeys(e);
                    if (e.key === '.' || e.key === ',') e.preventDefault();
                    if (e.key === 'Enter') submit();
                  }}
                  onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                <span className="trail">mins</span>
              </div>
              {QUICK.map((add) => (
                <button key={add} type="button" className="t135-tm-chip" onClick={() => setMinutes(String(Math.min(1440, total + add)))}>
                  +{add}
                </button>
              ))}
            </div>
            <small className={tried && timeError ? 'lt-error' : 'muted'}>{tried && timeError ? timeError : total ? `= ${hm(total)}` : 'e.g. 90 = 1 h 30 min'}</small>
          </label>
        </>
      )}
    </Modal>
  );
}
