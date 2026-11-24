import { useEffect, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Cloud } from 'lucide-react';
import { configApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { Topbar } from '@/components/layout/Topbar';
import { Dropdown } from '@/components/ui/Dropdown';
import { ErrorAlert } from '@/components/ui/Display';
import { Field, Switch } from '@/components/ui/Field';
import { FullPageLoader } from '@/components/ui/Loader';
import { useToast } from '@/components/ui/toast-context';
import { useApiFormError } from '@/hooks/useApiForm';
import { useMasterOptions } from '@/hooks/useOptions';
import { SCREENS } from '@/lib/constants';
import { num } from '@/lib/percent';
import { PercentBox } from '@/pages/projects/tabs/EditTabs';
import { ColorDot } from '@/pages/projects/tabs/shared';
import NotFoundPage from '@/pages/errors/NotFoundPage';

const api = configApi('project-types');

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the name').max(100),
  projectDivisionId: z.number({ error: 'Select the division' }),
  description: z.string().max(2000),
  isActive: z.boolean(),
  // default effort split: % per task group
  split: z.array(z.object({ taskGroupId: z.number(), name: z.string(), pct: z.string() })),
});

const EMPTY = { name: '', projectDivisionId: undefined, description: '', isActive: true, split: [] };
const round2 = (n) => Math.round(n * 100) / 100;

/** Project Types tab: name, division, description, active and the default effort split. */
export default function ProjectTypeFormPage() {
  const backTo = SCREENS.PROJECT_TYPES;
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const groups = useMasterOptions('project-task-groups').options;
  const divisions = useMasterOptions('project-divisions').options;
  // "New project type" from a division row can pass ?divisionId=
  const presetDivision = Number(new URLSearchParams(useLocation().search).get('divisionId')) || undefined;

  const record = useQuery({ queryKey: ['config', 'project-types', id], queryFn: () => api.get(id), enabled: isEdit, retry: false });
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { ...EMPTY, projectDivisionId: presetDivision } });
  const { formError, handleApiError } = useApiFormError(setError);

  const splitReady = useRef(false);
  useEffect(() => {
    const r = record.data;
    if (!r) return;
    reset({
      name: r.name,
      projectDivisionId: r.projectDivisionId ?? undefined,
      description: r.description ?? '',
      isActive: r.isActive,
    });
    splitReady.current = false; // the split is filled again once the task groups are here
  }, [record.data, reset]);

  // default effort split: every task group a project can use, with the saved % (once the groups are loaded)
  useEffect(() => {
    if (splitReady.current || !groups.length || (isEdit && !record.data)) return;
    const saved = new Map((record.data?.estimates ?? []).map((e) => [e.taskGroupId, e.effortPercentage]));
    setValue(
      'split',
      groups.map((g) => ({ taskGroupId: g.value, name: g.label, pct: saved.has(g.value) ? String(saved.get(g.value)) : '' })),
    );
    splitReady.current = true;
  }, [groups, record.data, isEdit, setValue]);

  const split = useWatch({ control, name: 'split' }) ?? [];
  const splitTotal = round2(split.reduce((s, x) => s + num(x.pct), 0));
  const splitOk = splitTotal === 0 || splitTotal === 100;
  const setPct = (gid, v) => {
    setValue('split', split.map((x) => (x.taskGroupId === gid ? { ...x, pct: v } : x)));
    clearErrors('split');
  };

  const save = useMutation({
    mutationFn: (body) => (isEdit ? api.update(id, body) : api.create(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'project-types'] });
      queryClient.invalidateQueries({ queryKey: ['masters', 'project-types'] });
      queryClient.invalidateQueries({ queryKey: ['config', 'project-divisions'] });
      toast.success(isEdit ? 'Project type saved' : 'Project type created');
      navigate(backTo);
    },
    onError: (err) => handleApiError(err),
  });

  if (isEdit && record.isLoading) return <FullPageLoader />;
  if (isEdit && record.isError) {
    return record.error?.response?.status === 404 ? <NotFoundPage what="Project type" /> : <ErrorAlert>{errorMessage(record.error)}</ErrorAlert>;
  }

  const onSubmit = (v) => {
    if (!(splitTotal === 0 || splitTotal === 100)) {
      setError('split', { type: 'validate', message: `The default split must total 100% (now ${splitTotal}%)` });
      return undefined;
    }
    return save
      .mutateAsync({
        name: v.name,
        projectDivisionId: v.projectDivisionId,
        description: v.description.trim() || null,
        isActive: v.isActive,
        // the default effort split new projects of this type start with (0 or 100 %)
        estimates: v.split.filter((s) => num(s.pct) > 0).map((s) => ({ taskGroupId: s.taskGroupId, effortPercentage: num(s.pct) })),
      })
      .catch(() => {});
  };

  return (
    <>
      <Topbar
        title={isEdit ? `Edit project type · ${record.data.name}` : 'New project type'}
        breadcrumb={['Administration', 'Business Division', 'Project Types']}
        back={backTo}
      />
      <form className="form-layout" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-main">
          <ErrorAlert>{formError}</ErrorAlert>

          <section className="card card-lg form-card">
            <div className="fc-head">
              <div>
                <div className="form-section-title">Project type</div>
                <div className="form-section-sub">e.g. Website Development, SEO &amp; Google Ads.</div>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Name" required error={errors.name?.message}>
                <input className="input" placeholder="Enter name" {...register('name')} />
              </Field>
              <Field label="Division" required error={errors.projectDivisionId?.message} help="projects of this type use this division">
                <Controller
                  name="projectDivisionId"
                  control={control}
                  render={({ field }) => <Dropdown search placeholder="Select division" options={divisions} value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field span="all" label="Description" error={errors.description?.message}>
                <textarea className="textarea" placeholder="Add description…" {...register('description')} />
              </Field>
              <Field style={{ justifyContent: 'flex-end' }}>
                <Controller name="isActive" control={control} render={({ field }) => <Switch label="Active" checked={field.value} onChange={field.onChange} />} />
              </Field>
            </div>
          </section>

            <section className="card card-lg form-card">
              <div className="fc-head">
                <div>
                  <div className="form-section-title">Default effort split</div>
                  <div className="form-section-sub">
                    The % of effort for each task group. New projects of this type start with this split on their Estimate tab; it can still be changed per project. Leave all empty for no default.
                  </div>
                </div>
              </div>
              <div className="alloc-bar" style={{ marginBottom: 16 }}>
                {split.filter((s) => num(s.pct) > 0).map((s, i) => (
                  <span key={s.taskGroupId} className={`c${(i % 8) + 1}`} style={{ width: `${Math.min(100, num(s.pct))}%` }} />
                ))}
              </div>
              <div className="editor">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task group</th>
                      <th style={{ width: 170 }}>% of effort</th>
                    </tr>
                  </thead>
                  <tbody>
                    {split.map((s, i) => (
                      <tr key={s.taskGroupId}>
                        <td>
                          <span className="row" style={{ gap: 10 }}>
                            <ColorDot i={i} />
                            <b>{s.name}</b>
                          </span>
                        </td>
                        <td>
                          <PercentBox value={s.pct} onChange={(v) => setPct(s.taskGroupId, v)} inputStyle={{ textAlign: 'right', paddingRight: 40 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="editor-foot">
                  <span className={`small${splitOk ? ' muted' : ''}`} style={splitOk ? undefined : { color: 'var(--danger)', fontWeight: 600 }}>
                    {errors.split?.message ?? (splitTotal === 100 ? 'Total is 100%' : splitTotal === 0 ? 'No default split' : splitTotal > 100 ? `${round2(splitTotal - 100)}% over – reduce a value` : `${round2(100 - splitTotal)}% left to allocate`)}
                  </span>
                  <div className="editor-total">
                    <span className={`badge ${splitTotal === 100 ? 'badge-success' : splitTotal === 0 ? '' : 'badge-danger'}`}>{splitTotal}%</span>
                    <span className="muted">Total</span>
                  </div>
                </div>
              </div>
            </section>

          <div className="form-bar">
            <span className="note">
              <Cloud />
              Fields marked * are required
            </span>
            <div className="actions">
              <Link className="btn btn-ghost" to={backTo}>
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                <Check />
                {isSubmitting ? 'Saving…' : isEdit ? 'Save project type' : 'Create project type'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
