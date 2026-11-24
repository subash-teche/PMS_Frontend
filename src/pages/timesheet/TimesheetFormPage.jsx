import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Cloud, Info, Plus } from 'lucide-react';
import { timesheetsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { Topbar } from '@/components/layout/Topbar';
import { DatePicker } from '@/components/ui/DatePicker';
import { ErrorAlert } from '@/components/ui/Display';
import { Dropdown } from '@/components/ui/Dropdown';
import { Field } from '@/components/ui/Field';
import { FullPageLoader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/toast-context';
import { useApiFormError } from '@/hooks/useApiForm';
import { blockNonNumericKeys } from '@/lib/percent';
import { todayIso } from '@/lib/timezone';
import NotFoundPage from '@/pages/errors/NotFoundPage';

const schema = z.object({
  workDate: z.string().min(1, 'Select the date'),
  taskId: z.number({ error: 'Select the task' }).nullable().refine((v) => v != null, 'Select the task'),
  minutes: z
    .string()
    .trim()
    .min(1, 'Enter the time spent')
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1440, 'Enter whole minutes, 1 to 1440'),
  comment: z.string().trim().min(1, 'Describe the work you did').max(2000),
});

const EMPTY = { workDate: todayIso(), taskId: null, minutes: '', comment: '' };

/** Log time / edit a time entry: pick the task you worked on (project, type and category come from the task), the time and the work done. */
export default function TimesheetFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const options = useQuery({ queryKey: ['timesheets', 'options'], queryFn: timesheetsApi.options });
  const entry = useQuery({
    queryKey: ['timesheets', 'entry', id],
    queryFn: () => timesheetsApi.get(id),
    enabled: isEdit,
    retry: false,
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { formError, handleApiError } = useApiFormError(setError);
  const addAnother = useRef(false); // "Log & add another" stays on the form
  const taskId = useWatch({ control, name: 'taskId' });

  useEffect(() => {
    const e = entry.data;
    if (e) reset({ workDate: e.workDate, taskId: e.taskId, minutes: String(e.minutes), comment: e.comment ?? '' });
  }, [entry.data, reset]);

  // the tasks I work on; an edited entry's own task stays selectable
  const taskOptions = useMemo(() => {
    const list = (options.data ?? []).map((t) => ({
      value: t.id,
      label: `${t.projectTitle ? `${t.projectTitle} · ` : t.categoryName ? `${t.categoryName} · ` : ''}${t.name}`,
      title: t.name,
    }));
    const e = entry.data;
    if (e && !list.some((x) => x.value === e.taskId)) list.unshift({ value: e.taskId, label: `${e.projectTitle ?? e.categoryName ?? ''} · ${e.taskName ?? 'Task'}`, title: e.taskName ?? '' });
    return list;
  }, [options.data, entry.data]);

  const pickTask = (v) => {
    setValue('taskId', v ?? null);
    clearErrors('taskId');
    const t = taskOptions.find((x) => x.value === v);
    if (t && !getValues('comment')?.trim()) setValue('comment', t.title);
  };

  const save = useMutation({
    mutationFn: (body) => (isEdit ? timesheetsApi.update(id, body) : timesheetsApi.create(body)),
    onSuccess: (saved, body) => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'efforts'] });
      toast.success(isEdit ? 'Time entry updated' : `${saved.minutes} mins logged on ${saved.projectTitle ?? saved.categoryName ?? 'the task'}`);
      if (addAnother.current) {
        // next entry: same day, the rest cleared
        reset({ ...EMPTY, workDate: body.workDate });
        return;
      }
      navigate('/timesheet');
    },
    onError: (err) => handleApiError(err),
  });

  if (options.isLoading || (isEdit && entry.isLoading)) return <FullPageLoader />;
  if (isEdit && entry.isError) {
    return entry.error?.response?.status === 404 ? <NotFoundPage what="Time entry" /> : <ErrorAlert>{errorMessage(entry.error)}</ErrorAlert>;
  }

  const err = (n) => errors[n]?.message;
  const onSubmit = (v) =>
    save.mutateAsync({ workDate: v.workDate, taskId: v.taskId, minutes: Number(v.minutes), comment: v.comment.trim() }).catch(() => {});

  const noTasks = !taskOptions.length;

  return (
    <>
      <Topbar title={isEdit ? 'Edit time entry' : 'Log time'} breadcrumb={['Timesheet', 'Timesheet']} back="/timesheet" />
      <form className="form-layout" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-main">
          <ErrorAlert>{formError}</ErrorAlert>
          {noTasks && (
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              <Info />
              <div>You are not on any task yet. Ask the project owner to add you to a task, or create your own task, then log the time on it.</div>
            </div>
          )}
          <section className="card card-lg form-card">
            <div className="fc-head">
              <span className="fc-num">1</span>
              <div>
                <div className="form-section-title">Time entry</div>
                <div className="form-section-sub">Pick the task you worked on – its project, task type and category are taken from the task.</div>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Date" required error={err('workDate')}>
                <Controller
                  name="workDate"
                  control={control}
                  render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} onBlur={field.onBlur} clearable={false} max={todayIso()} placeholder="Select date" />}
                />
              </Field>
              <Field label="Task" required span={2} error={err('taskId')}>
                <Dropdown search disabled={noTasks} placeholder={noTasks ? 'No tasks' : 'Select a task'} options={taskOptions} value={taskId} onChange={pickTask} />
              </Field>
              <Field label="Time spent" required error={err('minutes')} help="in minutes, e.g. 90 = 1 h 30 min">
                <div className="input-group">
                  <input
                    className="input has-trail"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    onKeyDown={(e) => {
                      blockNonNumericKeys(e);
                      if (e.key === '.' || e.key === ',') e.preventDefault(); // whole minutes only
                    }}
                    {...register('minutes')}
                  />
                  <span className="trail">mins</span>
                </div>
              </Field>
              <Field label="Work done" required span="all" error={err('comment')}>
                <textarea className="textarea" rows={3} maxLength={2000} placeholder="Explain the work you did…" {...register('comment')} />
              </Field>
            </div>
          </section>
          <div className="form-bar">
            <span className="note">
              <Cloud />
              Fields marked * are required
            </span>
            <div className="actions">
              <Link className="btn btn-ghost" to="/timesheet">
                Cancel
              </Link>
              {!isEdit && (
                <button type="submit" className="btn btn-secondary" disabled={isSubmitting || noTasks} onClick={() => (addAnother.current = true)}>
                  <Plus />
                  Log &amp; add another
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || noTasks} onClick={() => (addAnother.current = false)}>
                <Check />
                {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Log time'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
