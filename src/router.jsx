import { lazy, Suspense } from 'react';
import { FullPageLoader } from '@/components/ui/Loader';
import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { RedirectIfAuthenticated, RequireApp, RequireAuth, RequirePermission } from '@/auth/guards';
import { AppLayout } from '@/components/layout/AppLayout';
import { SCREENS } from '@/lib/constants';
import LoginPage from '@/pages/auth/LoginPage';
import NotFoundPage from '@/pages/errors/NotFoundPage';
import { CONFIG_SCREENS } from '@/pages/config/screens';

// Screens are loaded on demand (one chunk per page).
const ChangePasswordPage = lazy(() => import('@/pages/account/ChangePasswordPage'));
const OverviewPage = lazy(() => import('@/pages/dashboard/OverviewPage'));
const UserListPage = lazy(() => import('@/pages/admin/users/UserListPage'));
const UserFormPage = lazy(() => import('@/pages/admin/users/UserFormPage'));
const RoleListPage = lazy(() => import('@/pages/admin/roles/RoleListPage'));
const TaskMasterPage = lazy(() => import('@/pages/admin/TaskMasterPage'));
const RoleFormPage = lazy(() => import('@/pages/admin/roles/RoleFormPage'));
const ProjectListPage = lazy(() => import('@/pages/projects/ProjectListPage'));
const ProjectFormPage = lazy(() => import('@/pages/projects/ProjectFormPage'));
const ProjectDetailsPage = lazy(() => import('@/pages/projects/ProjectDetailsPage'));
const ProjectEditPage = lazy(() => import('@/pages/projects/ProjectEditPage'));
const TimesheetListPage = lazy(() => import('@/pages/timesheet/TimesheetListPage'));
const TimesheetFormPage = lazy(() => import('@/pages/timesheet/TimesheetFormPage'));
const TaskListPage = lazy(() => import('@/pages/tasks/TaskListPage'));
const TaskFormPage = lazy(() => import('@/pages/tasks/TaskFormPage'));
const TaskViewPage = lazy(() => import('@/pages/tasks/TaskViewPage'));
<<<<<<< HEAD
const TaskFromPlanPage = lazy(() => import('@/pages/tasks/TaskFromPlanPage'));
const Task135Page = lazy(() => import('@/pages/tasks/Task135Page'));
=======
const TaskTemplatePage = lazy(() => import('@/pages/tasks/TaskTemplatePage'));
// Tasks (flow tasks): Board (with Plan), 1-3-5 and Messages with the original Task Management design (src/tmx),
// inside the PMS layout; open to ADMIN, PROJECT_MANAGER and EMPLOYEE (RequireApp)
const TmApp = lazy(() => import('@/tmx/TmApp'));
/** One app: Tasks opens the board (people who cannot use it keep the plain task list). Messages and the 1-3-5 / tracker views are its screens. */
function TmScreen({ tab }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <TmApp tab={tab} />
    </Suspense>
  );
}
function TasksHome() {
  const { session } = useAuth();
  return session?.apps?.includes('tm') ? <TmScreen tab="dashboard" /> : <TaskListPage />;
}
>>>>>>> 0e845f485abf3b37bdd6016aefee0e9d67c90057
const ConfigListPage = lazy(() => import('@/pages/config/ConfigListPage'));
const ConfigFormPage = lazy(() => import('@/pages/config/ConfigFormPage'));
const ProjectTypeFormPage = lazy(() => import('@/pages/config/ProjectTypeFormPage'));
const ResourceGradeFormPage = lazy(() => import('@/pages/config/ResourceGradeFormPage'));
const DivisionFormPage = lazy(() => import('@/pages/config/DivisionFormPage'));
const SiteFormPage = lazy(() => import('@/pages/config/SiteFormPage'));
const ConfigTabsPage = lazy(() => import('@/pages/config/ConfigTabsPage'));
const CUSTOM_FORMS = { projectType: ProjectTypeFormPage, resourceGrade: ResourceGradeFormPage, division: DivisionFormPage, site: SiteFormPage };
// one menu, several tabs: Task Groups & Types (groups / types / categories), Business Division (divisions / project types)
const TABBED = ['parameter-types', 'parameters', 'usd-rates', 'task-groups', 'task-types', 'task-categories', 'project-divisions', 'project-types'];
const CUSTOM_LISTS = Object.fromEntries(TABBED.map((k) => [k, ConfigTabsPage]));

// Every screen route is wrapped in RequirePermission with the same screen key the API checks.
const guard = (screen, action, element) => (
  <RequirePermission screen={screen} action={action}>
    {element}
  </RequirePermission>
);

// Configuration masters: list / new / edit for each screen in pages/config/screens.jsx
const configRoutes = CONFIG_SCREENS.flatMap((def) => {
  const base = (def.path ?? def.screen).slice(1); // path: pages of a screen that share another screen's permissions
  const Form = CUSTOM_FORMS[def.form] ?? ConfigFormPage;
  const List = CUSTOM_LISTS[def.key] ?? ConfigListPage;
  return [
    { path: base, element: guard(def.screen, 'view', <List key={def.key} def={def} />) },
    { path: `${base}/new`, element: guard(def.screen, 'create', <Form key={`${def.key}-new`} def={def} />) },
    { path: `${base}/:id/edit`, element: guard(def.screen, 'edit', <Form key={`${def.key}-edit`} def={def} />) },
  ];
});

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: 'select-app', element: <Navigate to="/" replace /> },
      { path: 'tm/*', element: <Navigate to="/tasks" replace /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'account/change-password', element: <ChangePasswordPage /> },

          { path: 'administration/users', element: guard(SCREENS.USERS, 'view', <UserListPage />) },
          { path: 'administration/users/new', element: guard(SCREENS.USERS, 'create', <UserFormPage key="new" />) },
          { path: 'administration/users/:id/edit', element: guard(SCREENS.USERS, 'edit', <UserFormPage />) },

          { path: 'administration/roles', element: guard(SCREENS.ROLES, 'view', <RoleListPage />) },
          { path: 'administration/task-master', element: guard(SCREENS.TASK_MASTER, 'view', <TaskMasterPage />) },
          { path: 'administration/roles/new', element: guard(SCREENS.ROLES, 'create', <RoleFormPage key="new" />) },
          { path: 'administration/roles/:id/edit', element: guard(SCREENS.ROLES, 'edit', <RoleFormPage />) },

          ...configRoutes,

          { path: 'projects', element: guard(SCREENS.PROJECTS, 'view', <ProjectListPage />) },
          { path: 'projects/new', element: guard(SCREENS.PROJECTS, 'create', <ProjectFormPage key="new" />) },
          { path: 'projects/:id', element: guard(SCREENS.PROJECTS, 'view', <ProjectDetailsPage />) },
          { path: 'projects/:id/edit', element: guard(SCREENS.PROJECTS, 'edit', <ProjectEditPage />) },
          { path: 'tasks', element: guard(SCREENS.TASKS, 'view', <TasksHome />) },
          { path: 'tasks/list', element: <Navigate to="/tasks" replace /> },
          { path: 'tasks/135', element: <Navigate to="/tasks" replace /> },
          { path: 'tasks/stages', element: <RequireApp app="tm" />, children: [{ index: true, element: <TmScreen tab="stages" /> }] },
          { path: 'tasks/plan', element: <RequireApp app="tm" />, children: [{ index: true, element: <TmScreen tab="plan" /> }] },
          { path: 'messages', element: <RequireApp app="tm" />, children: [{ index: true, element: <TmScreen tab="messages" /> }] },
          { path: 'tasks/new', element: guard(SCREENS.TASKS, 'create', <TaskFormPage key="new" />) },
<<<<<<< HEAD
          { path: 'task-135', element: guard(SCREENS.TASK_135, 'view', <Task135Page />) },
          { path: 'tasks/from-plan', element: guard(SCREENS.TASKS, 'create', <TaskFromPlanPage />) },
=======
          { path: 'tasks/from-template', element: guard(SCREENS.TASKS, 'create', <TaskTemplatePage />) },
>>>>>>> 0e845f485abf3b37bdd6016aefee0e9d67c90057
          { path: 'tasks/:id', element: guard(SCREENS.TASKS, 'view', <TaskViewPage />) },
          { path: 'tasks/:id/edit', element: guard(SCREENS.TASKS, 'edit', <TaskFormPage />) },
          { path: 'timesheet', element: guard(SCREENS.TIMESHEET, 'view', <TimesheetListPage />) },
          { path: 'timesheet/new', element: guard(SCREENS.TIMESHEET, 'create', <TimesheetFormPage key="new" />) },
          { path: 'timesheet/:id/edit', element: guard(SCREENS.TIMESHEET, 'edit', <TimesheetFormPage />) },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
