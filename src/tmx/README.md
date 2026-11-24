# Task screens (Board with Plan, 1-3-5, Messages)

These are the screens of the original Task Management app, with its design, shown inside the PMS layout: Board at `/tasks`, 1-3-5 at `/tasks/135`, Messages at `/messages`.

- `app/` and `shared/` are copies of the original `src/` and `shared/` (same folder shape, so their imports work unchanged),
  with a few changes where PMS needs something different:
  - `app/api.ts` is new: it answers the screens' data calls (`/tasks`, `/plan`, `/timesheet`, `/messages`, `/users`, `/clients`,
    `/task-types`) from the PMS API (`/api/v1/flow/...`). The customer of a project is the task's "client".
  - `app/views/TaskDialog.tsx`: a task is filed under project -> task group -> task type and is a sub task of a main task
    (instead of client / type); only people on the project can be in a flow; no templates; any user may edit a flow.
  - `app/views/FlowEditor.tsx`: `allowedIds` (people of the project).
  - `app/views/Board.tsx`: drag a card onto a member to pass it on.
  - `app/portal.ts` and four click-outside handlers: needed because the screens run inside a Shadow DOM.
  - `shared/dates.ts`: "today" follows the PMS user's time zone (the original used Dubai time).
- `tmx.css` is the original stylesheet (`:root` / `body` became the Shadow DOM host).
- `TmApp.tsx` is the shell for one screen (`tab`). It renders inside a Shadow DOM so the original
  stylesheet cannot clash with PMS styles (and the reverse), and has its own data cache.

Not included from the original: Overview, List, Tracker, Templates, Import, Admin (users / clients / task types) and its own login.
