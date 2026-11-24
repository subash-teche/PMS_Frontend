import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tasksApi } from "@/api/endpoints";
import { errorMessage } from "@/api/client";
import { Topbar } from "@/components/layout/Topbar";
import { ErrorAlert } from "@/components/ui/Display";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FullPageLoader } from "@/components/ui/Loader";
import { TaskPlanSection } from "./TaskPlanSection";

/**
 * Add tasks from a project's plan: pick an ongoing project, then create one task for each of its planned
 * task groups (dates from the weekly plan).
 */
export default function TaskFromPlanPage() {
  const [projectId, setProjectId] = useState(null);

  const options = useQuery({
    queryKey: ["tasks", "options"],
    queryFn: tasksApi.options,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always", // project members may have changed – the cached list shows meanwhile
  });
  const projects = useQuery({
    queryKey: ["tasks", "plan-projects"],
    queryFn: tasksApi.templateProjects,
  });

  const project = (projects.data ?? []).find((p) => p.id === projectId);
  const canAssign = options.data?.canAssignOthers ?? false;
  const users = options.data?.users ?? [];

  if (options.isLoading || projects.isLoading) return <FullPageLoader />;
  if (projects.isError) return <ErrorAlert>{errorMessage(projects.error)}</ErrorAlert>;

  const projectOptions = (projects.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.title} (${p.code})`,
  }));
  return (
    <>
      <Topbar title="Add tasks from the plan" breadcrumb={["Task", "Task"]} back="/tasks" />
      <div className="form-layout">
        <div className="form-main">
          <section className="card card-lg form-card">
            <div className="fc-head">
              <span className="fc-num">1</span>
              <div>
                <div className="form-section-title">Project</div>
                <div className="form-section-sub">Ongoing projects you own (not completed). Its weekly plan decides the tasks.</div>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Project" required span={2}>
                <Dropdown
                  search
                  placeholder={projectOptions.length ? "Select project" : "You own no ongoing projects"}
                  disabled={!projectOptions.length}
                  options={projectOptions}
                  value={projectId}
                  onChange={setProjectId}
                />
              </Field>
              {project && (
                <Field label="Project type" span={2}>
                  <div className="tpl-proj-meta">
                    <span className="badge badge-info">{project.projectTypeName ?? "No type"}</span>
                    {project.customerName && <span className="muted small">{project.customerName}</span>}
                  </div>
                </Field>
              )}
            </div>
          </section>
          {projectId && project && <TaskPlanSection key={projectId} project={project} canAssign={canAssign} users={users} />}
        </div>
      </div>
    </>
  );
}
