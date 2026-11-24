import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Cloud,
  Plus,
  Trash2,
} from "lucide-react";
import { flowApi, mastersApi, task135Api, tasksApi } from "@/api/endpoints";
import { slotOf } from "@/tmx/shared/plan";
import { FlowPeople } from "./FlowPeople";
import { errorMessage } from "@/api/client";
import { useAuth, usePermissions } from "@/auth/auth-context";
import { Topbar } from "@/components/layout/Topbar";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { ErrorAlert } from "@/components/ui/Display";
import { Dropdown } from "@/components/ui/Dropdown";
import { Checkbox, ChoiceGroup, Field } from "@/components/ui/Field";
import { FullPageLoader } from "@/components/ui/Loader";
import { useToast } from "@/components/ui/toast-context";
import { useApiFormError } from "@/hooks/useApiForm";
import {
  SCREENS,
  TASK_STATUS_OPTIONS,
} from "@/lib/constants";
import { blockNonNumericKeys } from "@/lib/percent";
import { todayIso, zonedParts, zonedToIso } from "@/lib/timezone";

// a new task ends 10 days after its earliest start by default (editable)
const DEFAULT_SPAN_DAYS = 10;
const plusDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
import NotFoundPage from "@/pages/errors/NotFoundPage";

// earliest start / end before are typed and shown in the user's time zone (lib/timezone)
/** ISO timestamp → { date: 'YYYY-MM-DD', time: 'HH:MM' } */
const splitDateTime = (v) => (v ? zonedParts(v) : { date: "", time: "" });
/** date + time → ISO timestamp */
const joinDateTime = (date, time) => zonedToIso(date, time);

const whole = (max, msg) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= max), msg);

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the task title").max(300),
    description: z.string().max(5000),
    categoryId: z.number({ error: "Select the category" }),
    projectId: z.number().nullable(),
    taskGroupId: z.number().nullable(),
    taskTypeId: z.number().nullable(),
    ownerId: z.number({ error: "Select the task owner" }),
    assignedTo: z.number({ error: "Select who does the task" }),
    estHours: whole(9999, "Whole hours"),
    estMinutes: whole(99999, "Whole minutes"), // 60+ is carried into hours on blur
    status: z.string(),
    startDate: z.string(),
    startTime: z.string(),
    endDate: z.string(),
    endTime: z.string(),
    completedOn: z.string(),
    needsProject: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const add = (path, message) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.needsProject && !v.projectId) add("projectId", "Select the project");
    if (!v.startDate) add("startDate", "Select the earliest start");
    if (!v.endDate) add("endDate", "Select the end before date");
    if (
      v.startDate &&
      v.endDate &&
      joinDateTime(v.endDate, v.endTime) <=
        joinDateTime(v.startDate, v.startTime)
    )
      add("endDate", "Must be after the earliest start");
  });

export default function TaskFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const perms = usePermissions(SCREENS.TASKS);
  const navigate = useNavigate();
  // opened from the task details (which may itself come from a project): return there, keeping its own "back"
  const { from, viewFrom, category: wantedCategory, planDay } = useLocation().state ?? {}; // planDay: opened from a day of the 1-3-5 - the new task goes on that day // category: chosen on the Tasks page (Personal / Activity)
  const backTo = from ?? "/tasks";
  const backState = viewFrom ? { from: viewFrom } : undefined;
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const options = useQuery({
    queryKey: ["tasks", "options"],
    queryFn: tasksApi.options,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always", // project members may have changed – the cached list shows meanwhile
  });
  const task = useQuery({
    queryKey: ["tasks", "item", id],
    queryFn: () => tasksApi.get(id),
    enabled: isEdit,
    retry: false,
  });

  const EMPTY = useMemo(
    () => ({
      name: "",
      description: "",
      categoryId: undefined,
      projectId: null,
      taskGroupId: null,
      taskTypeId: null,
      ownerId: user.id,
      assignedTo: user.id,
      estHours: "",
      estMinutes: "",
      status: "to_do",
      startDate: todayIso(),
      startTime: "09:00",
      endDate: plusDays(todayIso(), DEFAULT_SPAN_DAYS),
      endTime: "18:00",
      completedOn: "",
      needsProject: false,
    }),
    [user.id],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { formError, handleApiError } = useApiFormError(setError);
  const addAnother = useRef(false);
  const [categoryId, status, taskGroupId, projectId, needsProject] = useWatch({
    control,
    name: ["categoryId", "status", "taskGroupId", "projectId", "needsProject"],
  });
  // task group → its task types
  const groups = useQuery({
    queryKey: ["masters", "task-groups"],
    queryFn: () => mastersApi.list("task-groups"),
    staleTime: 5 * 60 * 1000,
  });
  const types = useQuery({
    queryKey: ["masters", "task-types"],
    queryFn: () => mastersApi.list("task-types"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(
    () => options.data?.categories ?? [],
    [options.data],
  );
  const category = categories.find((c) => c.id === categoryId);
  // A new project task is a flow task (it goes to the Tasks board): one person, or several people in order.
  const flowCreate = !isEdit && Boolean(category?.isProject);
  const [isFlow, setIsFlow] = useState(true);
  const [flowIds, setFlowIds] = useState([user.id]);
  const flowOptions = useQuery({ queryKey: ["flow", "options"], queryFn: flowApi.options, enabled: flowCreate, staleTime: 60_000 }).data;
  const flowProject = (flowOptions?.projects ?? []).find((p) => p.id === projectId);
  const flowPeopleIds = flowProject ? [flowProject.ownerId, ...flowProject.memberIds] : undefined;
  const canAssign = options.data?.canAssignOthers ?? false;
  // Personal / Activity: the owner's own task (you, on a new one), done by them; ongoing or with dates, as chosen
  const ownTask = Boolean(category && !category.isProject);
  const makeOwn = useCallback(() => {
    const self = isEdit ? (task.data?.ownerId ?? user.id) : user.id;
    setValue("ownerId", self);
    setValue("assignedTo", self);
  }, [isEdit, task.data?.ownerId, user.id, setValue]);
  // dates of a new task: Personal / Activity default to a single day (end = start), project tasks to a span
  const span = ownTask ? 0 : DEFAULT_SPAN_DAYS;
  const setDefaultEnd = useCallback((own) => setValue("endDate", plusDays(getValues("startDate"), own ? 0 : DEFAULT_SPAN_DAYS)), [getValues, setValue]);

  // default category: the first one; Project when it is first
  useEffect(() => {
    if (!isEdit && categories.length && getValues("categoryId") === undefined) {
      const first = categories.find((c) => c.name.toLowerCase() === String(wantedCategory ?? "").toLowerCase()) ?? categories[0];
      setValue("categoryId", first.id);
      setValue("needsProject", first.isProject);
      if (!first.isProject) {
        makeOwn();
        setDefaultEnd(true);
      }
    }
  }, [categories, isEdit, wantedCategory, getValues, setValue, makeOwn, setDefaultEnd]);

  useEffect(() => {
    const t = task.data;
    if (!t) return;
    const s = splitDateTime(t.plannedStart);
    const e = splitDateTime(t.plannedEnd);
    reset({
      name: t.name,
      description: t.description ?? "",
      categoryId: t.categoryId ?? undefined,
      projectId: t.projectId,
      taskGroupId: t.taskGroupId ?? null,
      taskTypeId: t.taskTypeId ?? null,
      ownerId: t.ownerId ?? user.id,
      assignedTo: t.assignedTo ?? undefined,
      estHours: t.estimatedMinutes
        ? String(Math.floor(t.estimatedMinutes / 60))
        : "",
      estMinutes: t.estimatedMinutes ? String(t.estimatedMinutes % 60) : "",
      status: t.status,
      startDate: s.date,
      startTime: s.time || "09:00",
      endDate: e.date,
      endTime: e.time || "18:00",
      completedOn: t.completedOn ?? "",
      needsProject: t.isProjectCategory,
    });
  }, [task.data, reset, user.id]);

  const save = useMutation({
    mutationFn: (body) => {
      if (body.flowBody) return flowApi.create(body.flowBody);
      return isEdit ? tasksApi.update(id, body) : tasksApi.create(body);
    },
    onSuccess: async (saved, body) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(isEdit ? "Task updated" : `Task "${saved.name ?? saved.title}" created`);
      // created from a day of the 1-3-5: it is planned on that day (when it is for me)
      if (!isEdit && planDay) {
        try {
          if (body.flowBody) {
            const mine = (saved.steps ?? []).find((s) => s.userId === user.id && s.status !== "done");
            if (mine) await flowApi.setPlan({ stepId: mine.id, slot: { ...slotOf(planDay), day: Number(planDay.slice(8)) } });
          } else if (saved.assignedTo === user.id) {
            await task135Api.add({ taskId: saved.id, date: planDay });
          }
          queryClient.invalidateQueries({ queryKey: ["day"] });
          queryClient.invalidateQueries({ queryKey: ["plan"] });
        } catch (e) {
          toast.error("The task was created, but it could not be added to that day: " + (e?.response?.data?.message ?? e.message));
        }
      }
      if (body.flowBody) queryClient.invalidateQueries({ queryKey: ["flow"] });
      if (addAnother.current) {
        // next task: same category / project / people, the rest cleared
        reset({
          ...EMPTY,
          categoryId: body.categoryId,
          needsProject: getValues("needsProject"),
          projectId: body.projectId,
          ownerId: body.ownerId,
          assignedTo: body.assignedTo,
        });
        return;
      }
      navigate(backTo, { state: backState });
    },
    onError: (err) => handleApiError(err),
  });

  if (options.isLoading || (isEdit && task.isLoading))
    return <FullPageLoader />;
  if (isEdit && task.isError) {
    return task.error?.response?.status === 404 ? (
      <NotFoundPage what="Task" />
    ) : (
      <ErrorAlert>{errorMessage(task.error)}</ErrorAlert>
    );
  }

  const err = (n) => errors[n]?.message;
  const opt = (rows, label = (r) => r.name) =>
    (rows ?? []).map((r) => ({ value: r.id, label: label(r) }));
  const userOptions = (() => {
    const list = opt(options.data?.users);
    // keep people already on the task even when they are not in the list (e.g. assigned by a manager)
    for (const [uid, name] of [
      [task.data?.ownerId, task.data?.ownerName],
      [task.data?.assignedTo, task.data?.assignedToName],
    ]) {
      if (uid && !list.some((o) => o.value === uid))
        list.push({ value: uid, label: name });
    }
    return list;
  })();
  // a project task: assigned to someone on the project (its owner or a member, project Users tab)
  const selectedProject = needsProject ? (options.data?.projects ?? []).find((p) => p.id === projectId) : null;
  const assigneeOptions = selectedProject
    ? userOptions.filter((o) => selectedProject.peopleIds.includes(o.value) || o.value === task.data?.assignedTo)
    : userOptions;
  const projectOptions = opt(options.data?.projects, (p) =>
    p.code ? `${p.title ?? p.name} (${p.code})` : p.name,
  );
  if (
    task.data?.projectId &&
    !projectOptions.some((o) => o.value === task.data.projectId)
  )
    projectOptions.push({
      value: task.data.projectId,
      label: task.data.projectTitle,
    });

  // minutes over 59 move into hours: 2 h 80 min -> 3 h 20 min
  const normalizeEstimate = () => {
    const h = Number(getValues("estHours") || 0);
    const m = Number(getValues("estMinutes") || 0);
    if (!Number.isInteger(h) || !Number.isInteger(m) || m < 60) return;
    setValue("estHours", String(h + Math.floor(m / 60)), {
      shouldValidate: true,
    });
    setValue("estMinutes", String(m % 60), { shouldValidate: true });
  };
  const minutesReg = register("estMinutes");
  const estMinutesField = {
    ...minutesReg,
    onBlur: (e) => {
      minutesReg.onBlur(e);
      normalizeEstimate();
    },
  };

  const onSubmit = (v) => {
    const minutes = Number(v.estHours || 0) * 60 + Number(v.estMinutes || 0);
    let flowBody;
    if (flowCreate) {
      const fail = (field, message) => { setError(field, { message }); return true; };
      if (!v.projectId) return fail("projectId", "Select the project");
      if (!v.taskGroupId) return fail("taskGroupId", "Select the task group");
      if (!v.taskTypeId) return fail("taskTypeId", "Select the task type");
      if (isFlow && !flowIds.length) return setError("ownerId", { message: "Add at least one person to the flow" });
      flowBody = {
        title: v.name.trim(),
        dueDate: v.endDate || null,
        media: "",
        description: v.description.trim(),
        notes: "",
        projectId: v.projectId,
        taskGroupId: v.taskGroupId,
        taskTypeId: v.taskTypeId,
        // one person: the owner is left out, so the server makes the creator the owner
        flow: isFlow ? flowIds : [v.assignedTo],
        ...(isFlow && canAssign && v.ownerId ? { ownerIds: [v.ownerId] } : {}),
      };
    }
    return save
      .mutateAsync({
        ...(flowBody ? { flowBody } : {}),
        name: v.name.trim(),
        description: v.description.trim() || null,
        categoryId: v.categoryId,
        projectId: v.needsProject ? v.projectId : null,
        taskGroupId: v.taskGroupId ?? null,
        taskTypeId: v.taskTypeId ?? null,
        ownerId: v.ownerId,
        assignedTo: v.assignedTo,
        estimatedMinutes: minutes || null,
        status: v.status,
        plannedStart: joinDateTime(v.startDate, v.startTime),
        plannedEnd: joinDateTime(v.endDate, v.endTime),
        completedOn:
          v.status === "completed" ? v.completedOn || todayIso() : null,
      })
      .catch(() => {});
  };

  // only the owner / creator (and All-scope roles) edit the whole task; the assignee
  // works from the details page
  if (isEdit && task.data && !(perms.edit && task.data.canManage))
    return <Navigate to={`/tasks/${id}`} replace />;

  return (
    <>
      <Topbar
        title={isEdit ? "Edit task" : "New task"}
        breadcrumb={["Tasks", "Task"]}
        back={backTo}
        backState={backState}
      />
      <form
        className="form-layout"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="form-main">
          <ErrorAlert>{formError}</ErrorAlert>

          <div className="tf-cols">
          <section className="card card-lg form-card tf-card">
            <div className="fc-head">
              <span className="fc-num">1</span>
              <div>
                <div className="form-section-title">Task details</div>
              </div>
            </div>
            <div className="tf-grid">
              <Field label="Title" required className="tf-12" error={err("name")}>
                <input
                  className="input"
                  maxLength={300}
                  placeholder="e.g. Prepare the monthly report"
                  {...register("name")}
                />
              </Field>
              <Field label="Category" required className="tf-12" error={err("categoryId")}>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <div className="tf-chips" role="radiogroup" aria-label="Category">
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={field.value === c.id}
                          className={field.value === c.id ? "tf-chip on" : "tf-chip"}
                          onClick={() => {
                            field.onChange(c.id);
                            setValue("needsProject", !!c.isProject);
                            // a group the new category does not use no longer fits
                            if (c.taskGroupIds?.length && !c.taskGroupIds.includes(getValues("taskGroupId"))) {
                              setValue("taskGroupId", null);
                              setValue("taskTypeId", null);
                            }
                            if (!c.isProject) {
                              setValue("projectId", null);
                              makeOwn();
                            }
                            // a new task: the default end follows the category (one day for Personal / Activity)
                            if (!isEdit) setDefaultEnd(!c.isProject);
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </Field>
              {category?.isProject && (
                <Field label="Project" required className="tf-12" error={err("projectId")}>
                  <Controller
                    name="projectId"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        search
                        placeholder={
                          projectOptions.length
                            ? "Select project"
                            : "No projects"
                        }
                        disabled={!projectOptions.length}
                        options={projectOptions}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          // the project owner owns the task by default; the assignee must be on the project
                          const pr = (options.data?.projects ?? []).find((p) => p.id === v);
                          if (pr && canAssign) {
                            if (pr.ownerId) setValue("ownerId", pr.ownerId);
                            if (!pr.peopleIds.includes(getValues("assignedTo"))) setValue("assignedTo", pr.ownerId ?? null);
                          }
                        }}
                      />
                    )}
                  />
                </Field>
              )}
              <Field label="Task group" className="tf-6" error={err("taskGroupId")}>
                <Controller
                  name="taskGroupId"
                  control={control}
                  render={({ field }) => (
                    <Dropdown
                      search
                      clearable
                      placeholder="Select task group"
                      options={(groups.data ?? [])
                        .filter((g) => !category?.taskGroupIds?.length || category.taskGroupIds.includes(g.id))
                        .map((g) => ({
                          value: g.id,
                          label: g.name,
                        }))}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? null);
                        const type = (types.data ?? []).find(
                          (x) => x.id === getValues("taskTypeId"),
                        );
                        if (type && type.groupId !== v)
                          setValue("taskTypeId", null);
                      }}
                    />
                  )}
                />
              </Field>
              <Field label="Task type" className="tf-6" error={err("taskTypeId")}>
                <Controller
                  name="taskTypeId"
                  control={control}
                  render={({ field }) => {
                    const typeOptions = (types.data ?? [])
                      .filter((x) => x.groupId === taskGroupId)
                      .map((x) => ({ value: x.id, label: x.name }));
                    return (
                      <Dropdown
                        search
                        clearable
                        disabled={!taskGroupId}
                        placeholder={
                          !taskGroupId
                            ? "Select task group first"
                            : typeOptions.length
                              ? "Select task type"
                              : "No task types in this group"
                        }
                        options={typeOptions}
                        value={field.value}
                        onChange={(v) => field.onChange(v ?? null)}
                      />
                    );
                  }}
                />
              </Field>
              <Field label="Description" className="tf-12" error={err("description")}>
                <textarea
                  className="textarea"
                  rows={3}
                  style={{ minHeight: 90 }}
                  maxLength={5000}
                  placeholder="Details, links, notes…"
                  {...register("description")}
                />
              </Field>
            </div>
          </section>


          <div className="tf-side">
          <section className="card card-lg form-card tf-card">
            <div className="fc-head">
              <span className="fc-num">2</span>
              <div>
                <div className="form-section-title">People</div>
                {isEdit && task.data && task.data.ownerId !== user.id && (
                  <div className="form-section-sub">{task.data.ownerName} owns this task – only they can change the people.</div>
                )}
              </div>
            </div>
            <div className="tf-grid">
              {flowCreate && (
                <div className="tf-12 tf-seg" role="radiogroup" aria-label="Flow task">
                  <button type="button" role="radio" aria-checked={isFlow} className={isFlow ? "on" : ""} onClick={() => setIsFlow(true)}>Flow · several people</button>
                  <button type="button" role="radio" aria-checked={!isFlow} className={!isFlow ? "on" : ""} onClick={() => setIsFlow(false)}>One person</button>
                </div>
              )}
              {flowCreate && isFlow && (
                <div className="tf-12">
                  <FlowPeople value={flowIds} onChange={setFlowIds} users={flowOptions?.users ?? []} allowedIds={flowPeopleIds} />
                </div>
              )}
              <Field label="Task owner" required className="tf-12 tf-narrow" error={err("ownerId")}>
                <Controller
                  name="ownerId"
                  control={control}
                  render={({ field }) => (
                    <Dropdown
                      search
                      disabled={!canAssign || ownTask}
                      options={userOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select owner"
                    />
                  )}
                />
              </Field>
              {!(flowCreate && isFlow) && (
              <Field
                className="tf-12 tf-narrow"
                label="Assigned to"
                required
                error={err("assignedTo")}
                help={selectedProject ? "the project owner and members" : ownTask ? `${category.name} tasks are your own` : undefined}
              >
                <Controller
                  name="assignedTo"
                  control={control}
                  render={({ field }) => (
                    <Dropdown
                      search
                      disabled={!canAssign || ownTask}
                      options={assigneeOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select person"
                    />
                  )}
                />
              </Field>
              )}
            </div>
          </section>


          <section className="card card-lg form-card tf-card">
            <div className="fc-head">
              <span className="fc-num">3</span>
              <div>
                <div className="form-section-title">Schedule</div>
              </div>
            </div>
            <div className="tf-grid">
              <>
                  <Field
                    label="Starts"
                    required
                    className="tf-12 tf-row"
                    error={err("startDate")}
                  >
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 3 }}>
                        <Controller
                          name="startDate"
                          control={control}
                          render={({ field }) => (
                            <DatePicker
                              value={field.value}
                              onChange={(v) => {
                                // the end date follows the start while it is still the default (or now before the start)
                                const end = getValues("endDate");
                                if (v && (!end || end === plusDays(field.value || v, span) || end < v)) {
                                  setValue("endDate", plusDays(v, span), { shouldValidate: Boolean(errors.endDate) });
                                }
                                field.onChange(v);
                              }}
                              clearable={false}
                              placeholder="Date"
                            />
                          )}
                        />
                      </div>
                      <div style={{ flex: 2 }}>
                        <Controller
                          name="startTime"
                          control={control}
                          render={({ field }) => (
                            <TimePicker
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Time"
                            />
                          )}
                        />
                      </div>
                    </div>
                  </Field>
                  <Field
                    label="Ends"
                    required
                    className="tf-12 tf-row"
                    error={err("endDate")}
                  >
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 3 }}>
                        <Controller
                          name="endDate"
                          control={control}
                          render={({ field }) => (
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                              clearable={false}
                              min={getValues("startDate") || undefined}
                              placeholder="Date"
                            />
                          )}
                        />
                      </div>
                      <div style={{ flex: 2 }}>
                        <Controller
                          name="endTime"
                          control={control}
                          render={({ field }) => (
                            <TimePicker
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Time"
                            />
                          )}
                        />
                      </div>
                    </div>
                  </Field>
              </>
              {!flowCreate && (
              <Field
                className="tf-12 tf-narrow"
                label="Estimate time"
                error={err("estHours") ?? err("estMinutes")}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <input
                      className="input has-trail"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeys}
                      {...register("estHours")}
                    />
                    <span className="trail">h</span>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <input
                      className="input has-trail"
                      type="number"
                      min="0"
                      step="5"
                      inputMode="numeric"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeys}
                      {...estMinutesField}
                    />
                    <span className="trail">min</span>
                  </div>
                </div>
              </Field>
              )}
            </div>
          </section>
          </div>
          </div>


          {/* the status is set on the edit page; a new task starts as To do */}
          {isEdit && (
            <>
              <section className="card card-lg form-card">
                <div className="fc-head">
                  <span className="fc-num">4</span>
                  <div>
                    <div className="form-section-title">Status</div>
                    <div className="form-section-sub">
                      The completed date is set to today when the task is
                      completed – change it if needed.
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Status" span={2}>
                    <Controller
                      name="status"
                      control={control}
                      render={({ field }) => (
                        <ChoiceGroup
                          name="status"
                          options={TASK_STATUS_OPTIONS}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            if (v === "completed" && !getValues("completedOn"))
                              setValue("completedOn", todayIso());
                          }}
                        />
                      )}
                    />
                  </Field>
                  {status === "completed" && (
                    <Field label="Completed date" required span={2}>
                      <div style={{ maxWidth: 240 }}>
                        <Controller
                          name="completedOn"
                          control={control}
                          render={({ field }) => (
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                              clearable={false}
                              max={todayIso()}
                            />
                          )}
                        />
                      </div>
                    </Field>
                  )}
                </div>
              </section>

            </>
          )}

          <div className="form-bar">
            <span className="note">
              <Cloud />
              Fields marked * are required
            </span>
            <div className="actions">
              <Link className="btn btn-ghost" to={backTo} state={backState}>
                Cancel
              </Link>
              {!isEdit && (
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                  onClick={() => (addAnother.current = true)}
                >
                  <Plus />
                  Save &amp; add another
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={() => (addAnother.current = false)}
              >
                <Check />
                {isSubmitting
                  ? "Saving…"
                  : isEdit
                    ? "Save changes"
                    : "Create task"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
