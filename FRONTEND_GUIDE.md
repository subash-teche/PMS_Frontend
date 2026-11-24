# emQube PMS – Frontend Design & Build Guide

A complete reference to the look, components and page patterns of the emQube PMS frontend, written so the same design can be rebuilt in another application.

Everything here is taken from the source (`src/styles/theme.css`, `src/styles/app.css`, `src/styles/login.css`, `src/components/**`, `src/pages/**`). Where the code does not have something (for example a chat screen), this guide says so and marks the suggestion as a recommendation.

---

## Contents

1. [Stack and project structure](#1-stack-and-project-structure)
2. [Fastest way to reuse this design](#2-fastest-way-to-reuse-this-design)
3. [The ten design rules](#3-the-ten-design-rules)
4. [Fonts and typography](#4-fonts-and-typography)
5. [Colour codes](#5-colour-codes)
6. [Gradients](#6-gradients)
7. [Shape, shadow, spacing, sizes](#7-shape-shadow-spacing-sizes)
8. [Icons](#8-icons)
9. [App shell and left menu](#9-app-shell-and-left-menu)
10. [Page header (Topbar)](#10-page-header-topbar)
11. [Buttons](#11-buttons)
12. [Tabs and segmented switches](#12-tabs-and-segmented-switches)
13. [Badges, chips, avatars](#13-badges-chips-avatars)
14. [Form controls](#14-form-controls)
15. [Dropdowns, date and time pickers](#15-dropdowns-date-and-time-pickers)
16. [Cards](#16-cards)
17. [Metric (KPI) cards and graphs](#17-metric-kpi-cards-and-graphs)
18. [List page](#18-list-page)
19. [Add / Edit page](#19-add--edit-page)
20. [Details page](#20-details-page)
21. [Popups: modal, confirm, drawer, menus](#21-popups-modal-confirm-drawer-menus)
22. [Alerts](#22-alerts)
23. [Toaster](#23-toaster)
24. [Comments thread and chat](#24-comments-thread-and-chat)
25. [Other building blocks](#25-other-building-blocks)
26. [Login page](#26-login-page)
27. [Empty, loading and error states](#27-empty-loading-and-error-states)
28. [Responsive and print](#28-responsive-and-print)
29. [Behaviour conventions](#29-behaviour-conventions)
30. [Things to clean up when porting](#30-things-to-clean-up-when-porting)

---

## 1. Stack and project structure

| Area | Choice |
|---|---|
| Framework | React 19, Vite 8, plain JavaScript (`.jsx`) |
| Routing | React Router 8 data router, one lazy chunk per page |
| Server state | TanStack Query 5 |
| Forms | React Hook Form + Zod 4 (`@hookform/resolvers`) |
| HTTP | Axios; access token in memory, refresh token in an httpOnly cookie |
| Icons | `lucide-react` |
| Styling | **Plain CSS with custom properties.** No Tailwind, no CSS-in-JS, no component library |
| Charts | **Hand-written SVG and CSS.** No chart library |
| Import alias | `@` → `src` |

```
src/
├── main.jsx          providers: QueryClient → Toast → Confirm → Auth → Router
├── router.jsx        routes; every screen wrapped in RequirePermission
├── api/              client.js (axios + refresh), endpoints.js
├── auth/             AuthProvider, auth-context (useAuth, usePermissions), guards
├── components/
│   ├── layout/       AppLayout, Sidebar, SidebarFooter, Topbar, icons
│   └── ui/           Dropdown, ChipSelect, DatePicker, TimePicker, AmountInput, Field,
│                     Modal, Confirm, Toast, Pager, ListKit, ColumnPicker, MetricCards,
│                     Display, Loader, popover
├── hooks/            useDebounce, useSessionState, useOptions, useApiForm
├── lib/              constants, format, dates, timezone, csv, validation, password
├── pages/            auth, account, dashboard, admin, config, projects, tasks, timesheet, errors
└── styles/           theme.css (design system), app.css (React additions), login.css
```

Provider order in `main.jsx` matters: toasts and the confirm popup sit outside auth so they work on every screen.

---

## 2. Fastest way to reuse this design

The design system does not depend on the PMS business code. To carry it to another React app, copy these and you have the whole look:

| Copy | Gives you |
|---|---|
| `src/styles/theme.css` | Tokens and every component style |
| `src/styles/app.css` | Spinner, date/time picker, chip select, column picker, comments thread, toast position |
| `src/styles/login.css` | Sign-in page |
| `src/components/ui/*` | All shared components |
| `src/components/layout/*` | Shell, left menu, page header |
| `src/hooks/useDebounce.js`, `useSessionState.js` | List search and "remember my filters" |
| `src/lib/format.js`, `csv.js` | Date, money, number formatting; CSV export |

Then install `lucide-react`, add the `@` alias in `vite.config.js`, and import `theme.css` followed by `app.css` in your entry file. **Order matters:** `app.css` overrides a few `theme.css` rules (toast position, disabled button opacity).

Things you must change for a new app:

- Logo files in `src/assets/` and the alt text in `Sidebar.jsx`.
- `document.title` suffix in `Topbar.jsx` (`· emQube PMS`).
- `localStorage` / `sessionStorage` key prefix `pms.` (sidebar, view mode, columns, KPI collapse, list state).
- The menu source: `Sidebar` reads `session.menus` from `useAuth()`.
- `Display.jsx` imports `PROJECT_STATUS` for `StageBadge`; drop or replace it.
- Number and money formatting uses the `en-IN` locale (lakh/crore grouping) and defaults to `INR`.

For a non-React app, `theme.css` alone is enough: every component is a class name, and the original static mock-ups used exactly that.

---

## 3. The ten design rules

These come from the original UI kit and are followed across the app. Keep them and the app stays consistent.

1. Use only the shared components and class names. Never add a colour, radius or shadow inside a page; extend `theme.css` instead.
2. **Tables** always follow this order: `.card.card-flush` → `.filter-bar` → `.active-filters` → `.bulk-bar` → `.table-wrap > table.data-table` → `.table-foot` with `.pager`.
3. **Lists** are always `.list > .list-item` with `.lead`, `.body > .title + .meta`, `.trail`.
4. **Dropdowns** are always the custom `Dropdown`. Never a native `<select>`.
5. **Filters**: search pill, pill dropdowns, "More filters" drawer, view switch, export.
6. **Checkbox, radio, switch** use `.check`, `.radio`, `.switch`. Never the browser default.
7. **Status is always a badge**, with one colour per meaning (see [Colour codes](#5-colour-codes)).
8. **Forms**: section → `.form-grid` → `.field` (label, control, help), actions at the end.
9. **Page-level tabs** use `.tabs / .tab`. Switches inside a card use `.segmented`.
10. **Buttons**: one primary button per area; secondary actions use `.btn-secondary`; destructive actions use `.btn-danger` and always go through a confirmation popup.

Field type to control:

| Data | Control |
|---|---|
| Foreign key | Searchable dropdown |
| 2–4 fixed values | Choice chips |
| 5 or more values | Dropdown |
| On/off setting | Switch |
| Option | Checkbox |
| Long text | Textarea |
| Hours, %, money | Number input with a unit |
| Date / time | DatePicker / TimePicker |
| Email, phone, URL | Input with a leading icon |
| Several values | Chips input (multi dropdown) |
| Child records | Inline row editor |

---

## 4. Fonts and typography

**Font family:** Plus Jakarta Sans, weights 400, 500, 600, 700, 800, loaded from Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
--font: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
```

**Monospace** (inline code only): `ui-monospace, 'Cascadia Code', Consolas, monospace`, 12.5px.

Base: `font-size: 14px; line-height: 1.5; color: var(--ink); -webkit-font-smoothing: antialiased`.

| Use | Size | Weight | Notes |
|---|---|---|---|
| Page title (`.page-title`, `h1`) | 28px | 700 | letter-spacing −0.02em, line-height 1.15; 22px under 960px |
| `h2` | 20px | 700 | letter-spacing −0.01em |
| `h3` / card title | 16px | 700 | |
| `h4` | 14px | 700 | |
| Body | 14px | 400 | |
| Inputs, buttons, table cells, menu links | 13.5px | 400–600 | buttons 600 |
| Field label | 12.5px | 600 | colour `--ink-2` |
| Help text, `.small`, breadcrumb, meta | 12px | 400–500 | colour `--ink-3` |
| Table header | 11.5px | 700 | uppercase, letter-spacing 0.04em, `--ink-3` |
| Section title (`.section-title`) | 13px | 700 | uppercase, letter-spacing 0.05em, `--ink-3` |
| Badge | 12px | 600 | |
| Metric card title | 16px | 600 | |
| Metric card value | 30px | 700 | letter-spacing −0.03em, tabular numbers |
| Hero name | 26px | 700 | white on deep green |
| Login headline | `clamp(36px, 4.2vw, 60px)` | 800 | colour `#183A35` |

Numbers that line up in columns use `.num` (`font-variant-numeric: tabular-nums`).

Text helpers: `.muted` (`--ink-3`), `.text-2` (`--ink-2`), `.small` (12px), `.cell-trunc` (one line with `…`).

---

## 5. Colour codes

### Brand greens

| Token | Hex | Use |
|---|---|---|
| `--green-950` | `#052E16` | Text on lime |
| `--green-900` | `#0B3B22` | Promo button, darkest gradient stop |
| `--green-800` | `#115C33` | Active menu text, text on green-50 |
| `--green-700` | `#15803D` | Links, icons on green-50, primary hover |
| `--green-600` | `#16A34A` | **Primary** – buttons, focus border, checked controls, scrollbar |
| `--green-500` | `#22C55E` | Active tab icon, dots, bars |
| `--green-300` | `#86EFAC` | Toast success icon, light accents |
| `--green-200` | `#BBF7D0` | Soft borders |
| `--green-100` | `#DCFCE7` | Avatar background, selected ring |
| `--green-50` | `#F0FDF4` | Selected rows, icon tiles, soft buttons |
| `--lime` | `#C5F06B` | Highlight accent on dark green |
| `--tint-deep` | `#14532D` | Deep green card and hero base |

### Neutrals (slightly green-tinted)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#EEF2EF` | Page background |
| `--surface` | `#FFFFFF` | Cards, inputs, menus |
| `--surface-2` | `#F5F7F5` | Row hover, segmented track, read-only inputs |
| `--surface-3` | `#E9EEEA` | Progress tracks, switch off |
| `--border` | `#E2E8E3` | Default border |
| `--border-strong` | `#CBD5CE` | Hover border, checkbox border |
| `--ink` | `#13221A` | Main text, dark buttons, toast, tooltip |
| `--ink-2` | `#45554B` | Secondary text |
| `--ink-3` | `#85918A` | Muted text, placeholders, table headers |

### Status colours

| Meaning | Text | Background | Badge class |
|---|---|---|---|
| Success | `#16A34A` | `#DCFCE7` | `.badge-success` |
| Warning | `#D97706` | `#FEF3C7` | `.badge-warning` |
| Danger | `#DC2626` | `#FEE2E2` | `.badge-danger` |
| Info | `#2563EB` | `#DBEAFE` | `.badge-info` |
| Neutral | `#64748B` | `#EEF1F4` | `.badge` |

Status meaning is fixed everywhere:

| Colour | Means |
|---|---|
| Success (green) | Completed, approved, active |
| Info (blue) | In progress, medium priority |
| Warning (amber) | On hold, pending, high priority |
| Danger (red) | Overdue, rejected, cancelled, urgent, locked |
| Plain (grey) | Not started, draft, to do, inactive, low priority |
| Dark (`--ink`) | Submitted |
| Lime | New |

### Supporting colours

| Use | Value |
|---|---|
| Card tints | lime `#E4F5B4`, mint `#D6F2E1`, sage `#C7DCAE`, fog `#EEF6EA`, rose `#FDE8E7` |
| Alert-red text (softer than `--danger`) | `#B42318`, pill background `#FEE4E2` |
| Danger button hover | `#B91C1C` |
| Alert text on tint | info `#1E3A8A`, warning `#78350F`, danger `#7F1D1D`, success `--green-900` |
| Default avatar | background `#D9E3DC`, silhouette `#8FA197` |
| Star rating | `#F5B301` |
| Toast icons | success `#86EFAC`, error `#FCA5A5`, warning `#FCD34D` |
| Modal backdrop | `rgba(19, 34, 26, .35)` with `blur(2px)` |
| Drawer backdrop | `rgba(19, 34, 26, .25)` |
| Access levels | view `#B45309` on `#FEF3C7`; advanced view = info; edit `--green-700` on `--green-100` |

### Chart and series palettes

| Palette | Colours, in order |
|---|---|
| Series classes `.c1`–`.c8` | `#16A34A` `#0B3B22` `#86EFAC` `#C5F06B` `#4ADE80` `#15803D` `#BBF7D0` `#45554B` |
| Pie / multi-colour donut | `#15803D` `#4ADE80` `#0B3B22` `#BEF264` `#22C55E` `#166534` `#A3E635` `#86EFAC` `#14532D` `#65A30D` |
| Row bars | `#15803D` `#22C55E` `#0B3B22` `#86EFAC` |
| Gantt group bars | `#7C3AED` `#EA580C` `#DB2777` `#475569` `#7C2D12` `#A21CAF` `#111827` `#9F1239` |
| Gantt task status | done `#16A34A`, in progress `#2563EB`, to do `#FBBF24` |

The Gantt group palette is deliberately not green, so group bars stand apart from the green status colours.

---

## 6. Gradients

| Name | Where | CSS |
|---|---|---|
| Sidebar | Left menu background | `linear-gradient(180deg, #EAF7EC 0%, #DDF0E1 100%)` |
| Deep green hero | Details hero, quick-view hero, columns card, help card | `radial-gradient(90% 140% at 100% 0%, #1F7A45 0%, #14532D 55%, #0B3B22 100%)` |
| Soft green panel | Watermark card, task timeline, grouped headers | `linear-gradient(160deg, #F4F9EF 0%, #E3EFD6 100%)` |
| Mint | Area (trend) card | `linear-gradient(160deg, #E3F8EA 0%, #D6F2E1 100%)` |
| Lime | Rows (breakdown) card | `linear-gradient(150deg, #EEFAC9 0%, #E4F5B4 100%)` |
| Sage | People stack card | `linear-gradient(150deg, #D7E8C3 0%, #C7DCAE 100%)` |
| Rose | Alert card | `linear-gradient(160deg, #FFF6F5 0%, #FDE3E0 100%)` + border `#F8D3CF` |
| Gauge glow | Gauge card | `radial-gradient(90% 80% at 50% 100%, #F0FDF4 0%, #FFFFFF 70%)` |
| Promo | Sidebar promo card | `linear-gradient(180deg, #F6FBF5 0%, #E9F5EA 100%)` + border `#D5EBD9` |
| Over-limit bar | Alert card bar | `linear-gradient(90deg, #F97066, #D92D20)` |
| Login page | Sign-in background | `linear-gradient(135deg, #F7FAF8 0%, #EEF4F0 100%)` |
| Login blob | Sign-in top-left circle | `radial-gradient(circle at 60% 60%, #DDF3E5 0%, #E9F6EE 60%, transparent 61%)` |
| Tone card | Coloured watermark card | `linear-gradient(160deg, color-mix(in srgb, var(--mc-tone) 5%, #fff) 0%, color-mix(in srgb, var(--mc-tone) 16%, #fff) 100%)` |
| Striped actual | Gantt "actual" bar | `repeating-linear-gradient(135deg, var(--pl-tone) 0 5px, color-mix(in srgb, var(--pl-tone) 55%, #fff) 5px 10px)` |

The deep green hero varies slightly by place: the quick-view hero, help card and columns card use `120% 120%` for the size and 55–60% for the middle stop.

SVG gradients inside charts:

| Chart | Stops |
|---|---|
| Area fill | `#16A34A` at 35% opacity → 0% (top to bottom) |
| Donut ring | `#22C55E` → `#14532D` (diagonal) |
| Gauge arc | `#86EFAC` → `#15803D` (left to right) |

Decoration on dark green surfaces is always a low-opacity circle: a ring `border: 22–34px solid rgba(255,255,255,.05)` in the top-right corner, sometimes with a lime blob `rgba(197,240,107,.12)`.

---

## 7. Shape, shadow, spacing, sizes

```css
/* Radius */
--r-xs: 8px;  --r-sm: 12px;  --r-md: 14px;  --r-lg: 20px;  --r-xl: 28px;  --r-pill: 999px;

/* Elevation */
--shadow-xs: 0 1px 2px rgba(19,34,26,.05);
--shadow-sm: 0 1px 2px rgba(19,34,26,.04), 0 6px 16px rgba(19,34,26,.05);
--shadow-md: 0 2px 6px rgba(19,34,26,.06), 0 18px 40px rgba(19,34,26,.10);
--ring:      0 0 0 4px rgba(22,163,74,.16);      /* focus ring */

/* Spacing */
--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px;

/* Sizes */
--control-h: 42px;  --control-h-sm: 34px;
--sidebar-w: 268px; --sidebar-w-collapsed: 84px;
```

| Radius | Used for |
|---|---|
| 8px | Tooltips, small buttons inside inputs |
| 12px | Menu modules, small tiles |
| 14px | Inputs, dropdowns, menus, alerts, toasts |
| 20px | Cards, tiles |
| 24px | Metric cards |
| 28px | Large cards, modals, drawers, hero |
| pill | Buttons, tabs, badges, chips, filter controls, pager |

| Shadow | Used for |
|---|---|
| `xs` | Resting cards, active segmented button |
| `sm` | Floating pills |
| `md` | Menus, modals, drawers, toasts, card hover |
| `ring` | Every keyboard focus and open control |

Scrollbars are thin and brand green everywhere: `scrollbar-color: var(--green-600) transparent`, 8px wide, pill thumb.

Layout helpers: `.row` (flex, centred, gap 12), `.col` (column, gap 12), `.wrap`, `.grow`, `.between`, `.grid` (gap 20) with `.grid-2/3/4`, `.span-2`, `.span-3`, `.span-all`, `.stack` (20px between children), `.hidden`.

Z-index layers: sidebar on mobile 90 · modal and drawer 100 · toast 200 · busy overlay 200 · dropdown menus 300 (so a dropdown inside a modal shows above it).

---

## 8. Icons

All icons come from `lucide-react`.

| Context | Size |
|---|---|
| Default (`svg.lucide`) | 18px, stroke-width 1.8 |
| Buttons, inputs, small icon buttons | 17px |
| Menu module | 19px |
| Tab icon, small tiles | 15–16px |
| Meta lines, pills | 12–14px |
| Empty state | 28px inside a 64px tile |
| Watermark card background | 170px, stroke 1.4, 12% opacity, rotated −12° |

Icon tile pattern (used in lists, tiles, empty states): a rounded square `background: var(--green-50); color: var(--green-700)`, 34–64px, radius 11–20px, icon centred with `display: grid; place-items: center`.

Menu icons are stored in the database as lucide kebab-case names and mapped in `components/layout/icons.js`; unknown names fall back to `Circle`.

Common icon meanings: `Plus` new · `Pencil` edit · `Trash2` delete · `Download` export · `Search` search · `SlidersHorizontal` more filters · `Columns3` columns · `EllipsisVertical` row menu · `Eye` quick view · `Check` save · `X` close · `ArrowLeft` back · `ArrowRight` go · `ChevronDown` dropdown caret.

---

## 9. App shell and left menu

```html
<div class="app [is-collapsed]">
  <aside class="sidebar"><div class="sidebar-inner"> … </div></aside>
  <div class="main"> page: Topbar + content </div>
</div>
```

- `.app` is a two-column grid: `268px | 1fr`; collapsed `84px | 1fr`; transition 0.2s.
- `.sidebar` is sticky, full height, flush to the left edge.
- `.main` padding: `16px 24px 40px 28px`.
- The collapsed state is saved in `localStorage` (`pms.sidebar`).

### Sidebar look

| Part | Style |
|---|---|
| Background | `linear-gradient(180deg, #EAF7EC, #DDF0E1)`, right border `1px solid #CDE5D2`, no radius |
| Brand row | Padding `18px 14px 14px 38px`, bottom border `rgba(20,83,45,.1)`; full logo 130px wide |
| Collapse button | 36×36, radius 10, `--ink-3`; hover `rgba(255,255,255,.75)` |
| Module row (`.nav-module`) | Padding `10px 12px`, radius 12, gap 12, weight 600, `--ink-2` |
| Module hover | `rgba(255,255,255,.65)`, text `--ink` |
| Module active | White background, `--shadow-xs`, text `--ink`, icon `--green-600` |
| Module icon (`.nav-ico`) | 22×22, no background, `--green-800`, icon 19px |
| Chevron | Right side, rotates 90° when open |
| Sub-items (`.nav-items`) | Indented 34px |
| Link (`.nav-link`) | Padding `7px 12px`, pill, 13.5px, weight 500, `--ink-2` |
| Link hover | `rgba(255,255,255,.65)` |
| Link active | `rgba(255,255,255,.85)`, text `--green-800`, weight 700, 6px green dot before the label |
| Footer hills | Decorative SVG, 105px tall, pinned to the bottom behind the footer |

### Sidebar behaviour

- The menu is built from the server: only modules and screens the role can view.
- A module with one screen is a plain link; a module with several is an accordion.
- **One module is open at a time** — the current page's module, or the one just clicked.
- "Overview" is always the first item.
- Collapsed: labels, chevrons, sub-items and the promo card are hidden; only the logo mark (38px) and icons show. Hovering the logo swaps it for the expand button. Clicking a module while collapsed expands the sidebar.

### Sidebar footer

1. **Promo card** – white-green gradient card, radius 22, small leaf illustration, two-line heading (16px bold), one-line caption, full-width dark button (`--green-900`, height 40, radius 12, label left and arrow right). Hidden when the window is shorter than 820px.
2. **User row** – avatar, name (13px bold), role (11px), up/down caret. Opens a menu: profile header, My profile, Change password, divider, Log out (red).
3. **Bell button** – 40px round. Opens the notifications menu, 300px wide. Unread count uses `.su-count` (red pill, 18px, 10.5px bold).

---

## 10. Page header (Topbar)

Every page renders its own header as the first element.

```jsx
<Topbar
  title="Users"
  breadcrumb={['Administration']}
  back="/administration/users"      // optional: shows a round back button
  actions={<>…buttons…</>}          // optional: right side
/>
```

| Part | Style |
|---|---|
| Container | Flex, gap 16, padding `8px 0 20px` |
| Back button | `.btn.btn-secondary.btn-icon` with `ArrowLeft` |
| Breadcrumb | 12px, weight 500, `--ink-3`, items separated by `/` |
| Title | `.page-title`, 28px bold |
| Actions | Pushed to the right, gap 8 |

`Topbar` also sets the browser tab title to `<title> · <app name>`.

Typical titles: list `Users`; add `New user`; edit `Edit user · <name>`; details `Project details`.

---

## 11. Buttons

Base `.btn`: inline-flex, gap 8, height 42, padding `0 18px`, pill, weight 600, 13.5px, icon 17px, focus shows `--ring`.

| Class | Look | Use |
|---|---|---|
| `.btn-primary` | Green `#16A34A`, white text; hover `#15803D` | The one main action of an area |
| `.btn-secondary` | White, border `--border`; hover `--surface-2` | Other actions (Export, Edit, Back) |
| `.btn-ghost` | Transparent, `--ink-2`; hover `--surface-2` | Cancel, close, quiet actions |
| `.btn-soft` | `--green-50`, text `--green-800`; hover `--green-100` | Light positive action ("Today") |
| `.btn-dark` | `--ink`, white text | Strong neutral action |
| `.btn-danger` | Red `#DC2626`, white; hover `#B91C1C` | Delete, only inside a confirmation |
| `.btn-light` / `.btn-glass` | White / `rgba(255,255,255,.12)` | Only on the dark green hero |

Modifiers: `.btn-sm` (height 34, 12.5px), `.btn-icon` (square, no padding), `.btn-group` (gap 8).

Disabled: `opacity .6; pointer-events: none`.

Other small buttons:

- `.icon-btn` – 34px round, transparent, `--ink-3`; hover `--surface-3`. Add `.is-danger` for a red hover.
- `.link-btn` – text-only button in `--green-700`, weight 600, underline on hover.

Button text conventions: icon first, then a verb and the object — `New user`, `Save user`, `Create user`, `Export`. While saving the label changes to `Saving…` and the button is disabled.

---

## 12. Tabs and segmented switches

**Page tabs** (`.tabs > .tab`) switch between big sections of a page.

| State | Style |
|---|---|
| Rest | Height 40, pill, white, border `--border`, 13.5px weight 600, `--ink-2`; 28px round icon in `--surface-2` on the left |
| Hover | Text `--ink`, border `--border-strong` |
| Active | Background `--ink`, white text; icon circle `--green-500` |
| Count | `.count` pill, 11px bold |

```jsx
<div className="tabs" role="tablist">
  <button role="tab" className={`tab${active ? ' is-active' : ''}`}>
    <span className="tab-ico"><Users /></span> Users
  </button>
</div>
```

**Segmented control** (`.segmented`) switches views inside a card: pill track in `--surface-2` with 4px padding; buttons 32px high, 12.5px; the active one is white with `--shadow-xs`. `.seg-sm` is the compact size. The Table / Cards / List view switch uses it.

**Sub-tabs** (`.subtabs`) are a smaller segmented control with a border, used inside a tab.

The selected tab on a details page is written to the URL hash (`#users`), so a link can open a given tab.

---

## 13. Badges, chips, avatars

**Badge** – height 24, pill, 12px weight 600, with a 6px dot of the text colour in front. Add `.no-dot` to hide the dot. Tones: default grey, `-success`, `-warning`, `-danger`, `-info`, `-dark`, `-lime`.

```jsx
<Badge tone="success">Active</Badge>
<ActiveBadge active={user.isActive} />
```

**Chip** – height 30, pill, white with border, 12.5px weight 600. Shows `Label: <b>value</b>` plus a 20px round remove button that turns red on hover. Inside inputs, chips are green (`--green-50` background, `--green-100` border, `--green-800` text). A `+N` overflow chip is solid green with white text.

**Avatar** – round, initials (first letter of the first two words), background `--green-100`, text `--green-800`, weight 700.

| Size | Class | Pixels |
|---|---|---|
| Small | `.avatar-sm` | 28 |
| Medium | (none) | 36 |
| Large | `.avatar-lg` | 56 |

`.avatar-group` overlaps avatars by 8px with a 2px white border. `.is-default` shows a grey person silhouette when there is no name.

**User cell** (`UserCell`) – small avatar, bold name, and a 12px muted second line (email or role). Used in tables.

**Dot** – 8px green circle; `.dot-lime` adds a soft lime halo.

---

## 14. Form controls

### Field wrapper

```jsx
<Field label="Name" required error={errors.name?.message} help="Shown on reports" span={2}>
  <input className="input" {...register('name')} />
</Field>
```

- Label 12.5px weight 600 `--ink-2`; a red `*` when required.
- Help text 12px `--ink-3` under the control.
- An error replaces the help text, turns it red and gives the control a red border (`.field.has-error`).
- `span={2}` or `span="all"` makes the field wider in the grid.

### Input and textarea

| State | Style |
|---|---|
| Rest | Height 42, padding `0 14px`, border `1px solid --border`, radius 14, 13.5px |
| Hover | Border `--border-strong` |
| Focus | Border `--green-600` plus `--ring` |
| Disabled / read-only | Background `--surface-2`, text `--ink-2` |
| Placeholder | `--ink-3` |

Variants: `.input-sm` (height 34), `.input-pill` (pill radius), `.textarea` (min-height 55, vertical resize).

**Input with icon or unit** – wrap in `.input-group`. A leading lucide icon sits 13px from the left and the input gets 40px left padding. A unit (`%`, `hrs`) goes in `.trail` on the right with `.has-trail` on the input. Number inputs inside a group hide the browser spin arrows.

Ready-made: `IconInput`, `PasswordInput` (lock icon and a show/hide eye button), `AmountInput` (money with live comma grouping; the value stays a plain number string).

### Checkbox, radio, switch

| Control | Style |
|---|---|
| Checkbox `.check` | 20px box, radius 6, border 1.5px `--border-strong`; checked = green fill with a white tick; supports an indeterminate dash |
| Radio `.radio` | 20px circle; checked = green fill with a white 8px dot |
| Switch `.switch` | 40×24 track in `--surface-3`, 18px white knob; on = green track, knob moves 16px |

All three hide the real input and show `--ring` on keyboard focus.

### Choice chips

`ChoiceGroup` shows 2–4 options as pills (height 38, border, 13px weight 600). The selected one is solid green with white text. With a `tone`, the selected pill takes that colour and shows a white dot:

| Tone | Colour |
|---|---|
| `low`, `to_do` | `#64748B` |
| `medium`, `in_progress` | info blue |
| `high`, `hold` | warning amber |
| `urgent` | danger red |
| `completed` | success green |

### Form layout classes

| Class | Purpose |
|---|---|
| `.form-grid` | Two equal columns, gap `16px 20px`; `.cols-3` for three |
| `.form-card .form-grid` | Auto-fill columns, minimum 230px each |
| `.form-section` | Group with a top border between sections |
| `.form-section-title` / `-sub` | 15px bold title, 12.5px muted line |
| `.form-actions` | Right-aligned button row |
| `.form-bar` | Sticky floating action bar (see [Add / Edit page](#19-add--edit-page)) |

---

## 15. Dropdowns, date and time pickers

All of them share one look: the field (`.dropdown-toggle`) matches an input, and the menu is a white panel with radius 14, a border, `--shadow-md` and 6px padding.

### Dropdown

```jsx
<Dropdown options={[{ value, label }]} value={v} onChange={setV}
          placeholder="Select role" search clearable pill size="sm" multi disabled />
```

| Prop | Effect |
|---|---|
| `search` | Search box at the top of the menu, focused on open |
| `clearable` | Adds a "Clear selection" row when something is selected |
| `pill` | Pill shape, height 38 — the filter-bar style |
| `size="sm"` | Height 34 |
| `multi` | Becomes a chip select (below) |

Open state: green border and focus ring, caret rotates 180°. Option rows: padding `9px 10px`, radius 10; hover `--surface-2`; selected `--green-50` with `--green-800` text and a green tick on the right. Empty list shows "No options". List height is capped at 240px and scrolls.

### Chip select (multi)

Selected values show as green chips inside the field. Clicking or typing opens a list: selected items on top (click to remove), a divider, then the rest. Backspace removes the last chip; Enter adds the first match. In a filter bar (`pill`) it shows two chips and a `+N` chip.

### Action menu

`ActionMenu` is the "⋯" menu. Items are `{ label, icon, onClick, danger, divider, hidden }`. Each action is on one line, the menu is as wide as its longest label, and danger items are red. `RowMenu` is the ready-made version for table rows.

### Menu positioning

Menus use `position: fixed` and are placed by the `usePlacement` hook, so a table or card with `overflow` never clips them. They open upward when there is no room below. `useDismiss` closes them on outside click, Escape, outside scroll and window resize.

### Date picker

- Value in and out is `'YYYY-MM-DD'`; shown as `15 Oct 2026`.
- The field has a calendar icon on the left and a clear (×) button when filled.
- The popup is always 300px wide: month header with previous/next buttons, Monday-first day grid, footer with **Clear** and **Today**.
- Click the month title for a month grid; click again for a year grid.
- Day states: today has a green inset ring; selected is solid green with a `--green-100` halo; days outside the month are faded; out-of-range days are disabled.
- Supports `min`, `max`, `clearable`.

### Time picker

- Value in and out is `'HH:MM'` (24-hour); shown as `09:00 AM`.
- The popup is 260px wide with three scrolling columns — hour, minute (steps of 5 by default), AM/PM — and a footer showing the chosen time with a **Done** button.

Never use the browser's native date, time or select controls; they look different in every browser.

---

## 16. Cards

Base `.card`: white, radius 20, `--shadow-xs`, padding 20.

| Class | Effect |
|---|---|
| `.card-lg` | Radius 28, padding 24 |
| `.card-flush` | No padding, hidden overflow — for tables and lists |
| `.card-soft` | `--surface-2`, no shadow |
| `.card-green` | Solid primary green, white text |
| `.card-dark` | `--ink`, white text |
| `.card-head` | Title row: `h3` (16px), `.sub` (12px muted), `.actions` on the right |

### Record cards (the "Cards" view of a list)

Grid: `.rec-grid` — `repeat(auto-fill, minmax(280px, 1fr))`, gap 16, padding 20.

`.rec-card`: radius 22, padding 18, minimum height 210, border, lifts 3px with `--shadow-md` on hover.

| Part | Content |
|---|---|
| `.rc-top` | Small icon, 11.5px bold kicker, and a 36px round "go" arrow on the right |
| `.rc-title` | 19px bold |
| `.rc-meta` | Icon and text lines, 12.5px |
| `.rc-progress` | Optional label row and a 6px progress bar |
| `.rc-foot` | Avatar and name on the left, badge on the right |

Colours cycle through `['rc-deep', '', 'rc-lime', 'rc-mint', 'rc-sage']` so a grid never looks flat: deep green with white text, plain white, lime, mint, sage. `rc-rose` is available for flagged records.

### Tiles

`.tiles` is a two-column grid; `.tile` is a white card (radius 20, padding `18px 20px`) with a `.tile-head` (34px green icon tile and an `h4`). `.tile.wide` spans both columns. Used for read-only detail blocks.

### Stat blocks

`.stat` stacks a label (12px, muted), a value (30px bold) and an optional trend (`.up` green, `.down` red). `.stat-card` adds a 44px icon tile.

---

## 17. Metric (KPI) cards and graphs

There is no chart library. Every graph is inline SVG or CSS, and all of it lives in `components/ui/MetricCards.jsx`.

All metric cards share `.metric-card`: fixed height 224px, radius 24, padding `18px 20px`, lifts 3px on hover. The header has a 16px title on the left and a 34px round icon on the right.

**Pick the card by what the number means, never by position:**

| Component | Shows | Graph | Background |
|---|---|---|---|
| `AreaCard` | Trend of a count | Sparkline with gradient fill | Mint gradient |
| `ColumnsCard` | Volume over time | 7 columns; the highlighted one is lime with its value above | Deep green, white text |
| `DonutCard` | Percentage or rate | Ring with the % in the centre and a legend | White |
| `PieCard` | Breakdown by category | Multi-colour ring, total in the centre, top 4 in the legend, "+N more" | White |
| `GaugeCard` | Used versus limit | Half-circle gauge with a needle dot | White with green glow |
| `RowsCard` | Breakdown by status | Horizontal bars, label and count | Lime gradient |
| `StackCard` | People | Up to 4 overlapping avatars and "+N" | Sage gradient |
| `AlertCard` | Needs attention | Flagged items with over-limit bars or pills, action button | Rose gradient, pulsing icon |
| `WatermarkCard` | Plain count | Big number over a huge faded icon; optional `tone` | Soft green or tinted |

Shared parts:

- `McSubs` – a row of small sub-metrics (15px value, 10px uppercase label, underline accent).
- Trend pill – `▲ 12 this month` in green, or `▼` in red.

### KPI section

`KpiSection` wraps a row of cards in a 4-column grid with a **Summary · Hide/Show** header. Collapsed, the cards become a slim strip of pills (`title` and value); an alert card with a value above zero shows as a red pill. The choice is remembered per page in `localStorage`.

```jsx
<KpiSection storageKey="users">
  <AreaCard title="Total users" icon={Users} value={120} series={[…]} trend={{ value: 8, label: 'this month' }} />
  <DonutCard title="Active users" icon={UserCheck} percent={92} value={110} legend={[['Active', 92, '#16A34A'], ['Inactive', 8, 'var(--surface-3)']]} />
  <StackCard title="On leave today" icon={Plane} value={3} people={[…]} />
  <RowsCard title="Logins" icon={Building2} value={14} rows={[['Customer', 9], ['Vendor', 5]]} />
</KpiSection>
```

### Graph geometry (to rebuild them elsewhere)

| Graph | How it is drawn |
|---|---|
| Sparkline | `viewBox="0 0 100 100"`, `preserveAspectRatio="none"`; points spread evenly on x, y between 20 and 66; 2.2px green line; closed path below filled with the area gradient |
| Donut | `viewBox="0 0 112 112"`, circle r=46, stroke 12, rounded caps, rotated −90°; value = `stroke-dasharray: (289 × pct / 100) 289` |
| Pie ring | Same circle; one segment per item using `stroke-dasharray` and a negative `stroke-dashoffset`, 1.5 gap between segments |
| Gauge | Path `M15 95 A80 80 0 0 1 175 95`, stroke 14; arc length 251.3; needle dot at angle `π × (1 − ratio)` |
| Columns | Flex row of `<i>` bars, height as % of the largest, minimum 8% |
| Row bars | 8px pill track, fill width as % of the largest |

### Other graphs

- **Progress bar** `.progress` – 8px pill track, green fill; `.is-warning` amber, `.is-danger` red. The project list turns amber at 85% of estimated hours and red above 100%.
- **Allocation bar** `.alloc-bar` – 14px stacked bar with segments coloured `.c1`–`.c8` and a matching `.alloc-legend`.
- **Commercial panels** – a green "net" panel with a 34px bold value and a thin bar, beside a grey cost panel with a stacked bar and legend.
- **Review grid** – a table with one column per review date, each cell a % and a 4px mini bar; the latest column is tinted green and the first column is sticky.
- **Weekly plan (Gantt)** `.gp` – sticky label column 310px, one column per week (minimum 60px), month and week headers, the current week highlighted. Group bars are 30px tall, radius 10, draggable, with resize grips and a remove button on hover. Task bars are 24px and coloured by status. "Actual" bars are 8px with diagonal stripes; late ones are red.
- **Step timeline** `.td-timeline` – three steps on a soft green panel: 26px dots joined by a 3px line; done is green with a tick, current is blue, on hold amber, late red.

---

## 18. List page

Every list page has the same structure, top to bottom:

1. `Topbar` – title, breadcrumb, **Export** (secondary) and **New …** (primary) on the right.
2. `KpiSection` – four metric cards (optional).
3. One `.card.card-flush` containing:
   1. `.filter-bar`
   2. `.active-filters`
   3. `.bulk-bar` (only while rows are selected)
   4. Table, cards or list
   5. Empty state (when there are no rows)
   6. `.table-foot`

### Filter bar

Padding `16px 20px`, flex, gap 8, wraps. Left to right:

| Item | Detail |
|---|---|
| Search | `.input-group.search`, 280px, pill, background `--surface-2`, no border until focus, magnifier icon, debounced 300ms |
| Pill filters | `SingleFilter` / `<Dropdown pill clearable>`, 170px each |
| More filters | `.btn.btn-secondary.btn-sm` with `SlidersHorizontal`; opens a drawer |
| Spacer | `<span className="spacer" />` pushes the rest to the right |
| Columns | `ColumnPicker` (table view only) |
| View switch | `ViewSwitch` – Table / Cards / List |

### Active filters

Shown under the filter bar when filters are set: a row of chips `Label: value ×` and a **Clear all** link. More than two values shows as "3 selected".

### Data table

| Part | Style |
|---|---|
| Wrapper | `.table-wrap` – horizontal scroll, top border |
| Header | Sticky, white, 11.5px bold uppercase, `--ink-3`, padding `12px 16px` |
| Cell | Padding `13px 16px`, bottom border, 13.5px, vertically centred |
| Row hover | `--surface-2` |
| Selected row | `--green-50` |
| Sorted header | Text `--green-700`, sort icon fully opaque |
| Compact | `.is-compact` reduces vertical padding to 9px |

Column helpers: `.col-menu` (44px, first column, holds the ⋯ row menu), `.col-check` (44px checkbox), `.col-actions`, `.num` / `.right`, `.center`, `.nowrap`.

Cell helpers: `.cell-user` (avatar, name, sub-line), `.cell-title` (bold), `.cell-sub` (12px muted), `.cell-trunc`.

**Conventions:**

- The first column is the ⋯ **row menu**: Edit, other actions, a divider, then Delete in red.
- The record's name is a link to the edit or details page.
- Empty values show `—`.
- Sortable headers are real buttons (`.th-sort`) so they work from the keyboard.
- Columns are user-customisable with `useColumns(tableKey, defs)`: show, hide and drag to reorder, saved per table in `localStorage`. A `locked` column is always shown; `defaultHidden` columns start hidden.

### Bulk bar

A dark pill (`--ink`, white text) that appears while rows are selected: "3 selected" on the left and action buttons on the right. Selection is handled by `useSelection(items)` and resets whenever the page or filters change.

### Table footer

`.table-foot`: "Showing **1–10** of **26**", a rows-per-page dropdown (10, 25, 50, 100), and the pager on the right. Pager buttons are 34px pills; the active page is `--ink` with white text. Page numbers collapse as `1 … 4 5 6 … 12`.

### Cards and list views

- **Cards** – `.rec-grid` of record cards (see [Cards](#16-cards)).
- **List** – `.list > .list-item`: avatar or icon tile, title with a meta line of icon-and-text items, then a badge and a chevron on the right.

### Skeleton

```jsx
export default function UserListPage() {
  const perms = usePermissions(SCREENS.USERS);
  const [view, setView] = useViewMode('users');
  const [search, setSearch] = useSessionState('users.search', '');
  const [filters, setFilters] = useSessionState('users.filters', EMPTY_FILTERS);
  const [page, setPage] = useSessionState('users.page', 1);
  const [pageSize, setPageSize] = useSessionState('users.pageSize', 10);
  const debouncedSearch = useDebounce(search);

  const list = useQuery({
    queryKey: ['users', 'list', params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Topbar title="Users" breadcrumb={['Administration']} actions={…} />
      <KpiSection storageKey="users">…</KpiSection>

      <div className="card card-flush">
        <div className="filter-bar">
          <div className="input-group search"><Search /><input className="input" placeholder="Search…" /></div>
          <SingleFilter search placeholder="Role" options={roles} value={filters.roleId} onChange={…} />
          <button className="btn btn-secondary btn-sm"><SlidersHorizontal />More filters</button>
          <span className="spacer" />
          {view === 'table' && <ColumnPicker cols={cols} />}
          <ViewSwitch value={view} onChange={setView} />
        </div>
        <ActiveFilters chips={chips} onClearAll={…} />

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th className="col-menu" />{cols.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {list.isLoading && <TableLoading colSpan={cols.columns.length + 1} />}
              {items.map((u) => (
                <tr key={u.id}><td className="col-menu">{rowMenu(u)}</td>{cols.columns.map((c) => c.td(u))}</tr>
              ))}
            </tbody>
          </table>
        </div>

        {!list.isLoading && !items.length && <EmptyState icon={Users} title="No users yet" />}
        {total > 0 && <TableFoot page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={…} />}
      </div>

      <ConfirmDeleteModal … />
    </>
  );
}
```

---

## 19. Add / Edit page

**One component serves both.** The route decides the mode: `/users/new` is add, `/users/:id/edit` is edit (`isEdit = Boolean(id)`).

Structure:

1. `Topbar` with a back button — `New user` or `Edit user · <name>`.
2. `<form className="form-layout">` containing `.form-main`.
3. A form-level `ErrorAlert` at the top.
4. Numbered **section cards**.
5. A sticky **action bar** at the bottom.

### Section card

```jsx
<section className="card card-lg form-card">
  <div className="fc-head">
    <span className="fc-num">1</span>
    <div>
      <div className="form-section-title">Personal details</div>
      <div className="form-section-sub">Name and contact of the user.</div>
    </div>
  </div>
  <div className="form-grid"> …fields… </div>
</section>
```

- The card is white, radius 28, padding 24, with 16px between cards.
- `.fc-num` is a 36px rounded square, `--green-50` background, `--green-700` text, weight 800.
- The grid auto-fills columns at a minimum of 230px.

### Sticky action bar

`.form-bar` floats 16px above the bottom of the window: a pill, `rgba(255,255,255,.92)` with `backdrop-filter: blur(8px)` and `--shadow-md`.

| Side | Content |
|---|---|
| Left | A note with a small green icon: "Fields marked * are required" |
| Right | **Cancel** (ghost link back to the list) and **Save** (primary, `Check` icon) |

Save reads `Create user` on add and `Save user` on edit; while submitting it reads `Saving…` and is disabled.

### Form behaviour

- React Hook Form with a Zod schema. Edit mode loads the record and calls `reset()`.
- Custom controls (`Dropdown`, `DatePicker`, `Switch`) are wired with `<Controller>`.
- Validation messages are short instructions: "Enter the name", "Select a role", "At least 3 characters".
- Server errors: field errors are mapped onto their fields by `useApiFormError`; anything else shows in the alert at the top.
- On success: invalidate the queries, show a toast (`User created` / `User saved`), navigate back to the list.
- Edit mode loading shows `FullPageLoader`; a 404 shows the not-found card.
- A switch that sits alone in a grid cell is aligned to the bottom with `style={{ justifyContent: 'flex-end' }}`.

Simple forms (Change password) use a single narrow card (`max-width: 640px`) with `.form-section` and `.form-actions` in place of the sticky bar.

### Inline row editor (child records)

Child rows are edited inside the form in an `.editor`: a bordered, rounded box holding a `.data-table` with a grey header, tighter cells (`8px 10px`), 38px controls, and an `.editor-foot` with an **Add row** button on the left and a total on the right. Each row ends with a round `.icon-btn.is-danger` to remove it.

---

## 20. Details page

Structure:

1. `Topbar` with a back button, and a button to hide or show the hero.
2. **Hero card** (`.detail-hero`).
3. **Page tabs** (`.tabs`), 20px below the hero.
4. The active tab's content: tiles, tables, graphs.
5. A delete confirmation popup.

### Hero

Deep green radial gradient, radius 28, padding `26px 28px 22px`, white text, two faint decorative circles.

| Part | Style |
|---|---|
| Lead icon | 64px rounded square (radius 20), `rgba(255,255,255,.12)`, lime icon |
| Kicker | 12px bold, 70% opacity — `Project · PRJ-0012` |
| Name | 26px bold, white |
| Tags | Pills `rgba(255,255,255,.12)`, 12px weight 600 |
| Actions (right) | Status badge (lime on the hero), a white **Edit** button (`.btn-light`), a glass ⋯ button (`.btn-glass`) |
| Metrics row | Glass tiles (`rgba(255,255,255,.08)`, radius 18): 22px bold value over an 11px uppercase label. The first tile is highlighted in lime (`.hm.hi`) |

When the hero is hidden, the title, badge and actions move into the `Topbar`. The choice is remembered in `localStorage`.

### Tab content

- **Key-value blocks** – `.kv` is a two-column grid, 160px label column, muted label (`dt`) and bold value (`dd`). Group them in `.tile`s.
- **Two-column layout** – `.detail-layout` is `1fr 320px` (main and side cards); it becomes one column under 1100px.
- **Section titles** – `.section-title`.
- Tabs a role cannot see are hidden, and the page falls back to the first visible tab.

### Lighter details header

For records that do not need the dark hero, the task details page uses a white card: a 56px green lead icon, a green kicker, a 26px title, a description, and the step timeline with an owner/assignee panel beside it.

---

## 21. Popups: modal, confirm, drawer, menus

### Modal

```jsx
<Modal open={open} onClose={close} title="Change status?" size="lg"
       footer={<><button className="btn btn-ghost">Cancel</button><button className="btn btn-primary"><Check />Save</button></>}>
  …body…
</Modal>
```

| Part | Style |
|---|---|
| Backdrop | Fixed, `rgba(19,34,26,.35)`, `blur(2px)`, padding 24, scrolls if the popup is taller than the screen |
| Panel | 520px wide (`size="lg"` = 760px), white, radius 28, `--shadow-md`, centred |
| Head | Padding `24px 24px 0`; title 18px bold; ghost close (×) button on the right |
| Body | Padding `20px 24px` |
| Foot | Right-aligned buttons, padding `0 24px 24px`: Cancel (ghost) then the action |

Behaviour: closes on Escape and on backdrop click; the page behind does not scroll while a popup is open; closing is blocked while a request is running.

### Confirmation popup

Every delete goes through a confirmation. Two ways to use it:

```jsx
// 1. Promise style, anywhere
const confirm = useConfirm();
if (await confirm({ title: 'Remove member?', message: '…', confirmLabel: 'Remove' })) { … }

// 2. Controlled, when a busy state is needed
<ConfirmDeleteModal open={!!toDelete} title="Delete user?" message="…"
                    busy={remove.isPending} onClose={…} onConfirm={…} />
```

- Destructive: red button with a `Trash2` icon, label `Delete` → `Deleting…`.
- Non-destructive (`tone="primary"`): green button with a `Check` icon.
- The title is a question (`Delete user?`). The message says what will happen and what to do instead if it is blocked.

### Drawer

A right-side panel for **More filters** and **quick view**.

| Part | Style |
|---|---|
| Backdrop | `rgba(19,34,26,.25)`, no blur |
| Panel | 440px wide, floats 12px from the top, right and bottom, radius 28, `--shadow-md` |
| Layout | Same head, scrolling body and foot as the modal |

Filter drawer footer: **Reset** (ghost) and **Apply filters** (primary). Filters are edited as a draft and only applied on Apply.

**Quick view** (`.qv`) opens from the eye icon on a row: a deep green hero block (48px lime icon tile, 20px title, code, status badge), then "Key details" as a two-column grid of fact tiles (`--surface-2`, radius 14: 11px uppercase label over a 13.5px value), then the comments thread. Footer: **Edit** (secondary) and **Open details** (primary, arrow on the right).

### Tooltip

Add `data-tip="text"` to any element. It shows a dark bubble (`--ink`, white 12px text, radius 8) to the left of the element with a small arrow, on hover and keyboard focus. Simple hints use the native `title` attribute.

### Busy overlay

For long batch jobs: a full-screen dim (`rgba(15,30,20,.45)`, blur 3px) with a centred white card (max 420px, radius 20) holding a title and a 10px progress bar.

---

## 22. Alerts

Inline messages inside the page.

```jsx
<div className="alert alert-warning"><TriangleAlert /><div>…message…</div></div>
```

Base: flex, gap 12, padding `12px 16px`, radius 14, 13.5px, icon on the left.

| Class | Background | Text | Use |
|---|---|---|---|
| `.alert` | `#DBEAFE` | `#1E3A8A` | Information, hints |
| `.alert-success` | `#DCFCE7` | `#0B3B22` | Good news, "all on schedule" |
| `.alert-warning` | `#FEF3C7` | `#78350F` | Needs attention, overdue |
| `.alert-danger` | `#FEE2E2` | `#7F1D1D` | Errors |

`ErrorAlert` renders a danger alert with `role="alert"` and renders nothing when it has no message, so it can stay in the page permanently.

Where each kind of message goes:

| Situation | Use |
|---|---|
| Result of an action (saved, deleted, failed) | Toast |
| A form could not be saved | `ErrorAlert` at the top of the form, plus field errors |
| A list failed to load | `ErrorAlert` inside the card |
| A standing condition on a page | Inline alert |
| A metric needs attention | `AlertCard` |

---

## 23. Toaster

```jsx
const toast = useToast();
toast.success('User saved');
toast.error(errorMessage(err));
toast.warning('Some rows were skipped');
```

| Property | Value |
|---|---|
| Position | **Top-right**, 24px from the top and right (12px and full width under 560px) |
| Stack | Column, gap 8, max width `min(440px, 100vw − 32px)`, z-index 200 |
| Look | Dark: `--ink` background, white 13.5px text weight 500, radius 14, padding `12px 16px`, minimum width 280, `--shadow-md` |
| Icon | Success `CircleCheck` in `#86EFAC`; error `CircleAlert` in `#FCA5A5`; warning `Info` in `#FCD34D` |
| Animation | Slides down 8px and fades in over 0.2s |
| Duration | Auto-dismisses after 3.2 seconds; no close button |
| Accessibility | The stack has `role="status"` and `aria-live="polite"` |

All three types share the same dark background; only the icon colour changes.

Message style: short and in the past tense — `User created`, `Project deleted`, `Account unlocked`, `3 users deleted`. Errors show the server's message.

---

## 24. Comments thread and chat

**The app has no chat screen.** The closest component is the comments and activity thread (`CommentsLog`, classes `.cmt-*`), used on the project Update tab and in the quick-view drawer.

### Comments thread (exists)

| Part | Style |
|---|---|
| List | `.cmt-log` – column, gap 14, max height 560, scrolls; newest first |
| Item | Grid `28px | 1fr`, gap 12; a 1px vertical line joins the avatars |
| Avatar | 28px, with a 3px white ring so it sits on top of the line |
| Bubble | Padding `10px 14px`, radius `4px 14px 14px 14px` (sharp corner towards the avatar), `--surface-2` with a border |
| Newest item | Bubble is `--green-50` with a `--green-200` border |
| Header | Author (12px weight 600, muted) on the left, time (11px) on the right |
| Text | 13.5px weight 600, keeps line breaks, wraps long words |
| System entry | A flag icon in place of the avatar, a dashed-border white bubble, lighter text |

### Chat (recommendation, not in the code)

If the other application needs a chat, build it from the same parts so it matches:

| Part | Suggested style |
|---|---|
| Container | `.card.card-flush`, or a `.drawer` for a side panel |
| Header | `.card-head` with an avatar, name and a status `.dot` |
| Other person's message | The `.cmt-body` bubble: `--surface-2`, border, radius `4px 14px 14px 14px`, avatar on the left |
| Own message | Right-aligned, `--green-600` background, white text, radius `14px 4px 14px 14px`, no avatar |
| Time | 11px, `--ink-3`, under the bubble |
| Day separator | A centred `.badge.no-dot` |
| Unread count | The `.su-count` red pill |
| Composer | A `.textarea` or `.input.input-pill` with a round `.btn.btn-primary.btn-icon` send button |
| Typing / system note | Dashed-border bubble, like the system entry |

---

## 25. Other building blocks

| Block | Class | Description |
|---|---|---|
| Key-value list | `.kv` | Two-column grid, 160px muted label and bold value |
| Vertical timeline | `.timeline` | 2px line on the left; each item has a 12px white dot with a 3px green ring, a muted date, bold text and an optional note box |
| Step timeline | `.td-timeline` | Horizontal steps with dots and connecting lines |
| File drop zone | `.dropzone` | 2px dashed border, radius 20, `--surface-2`; turns green on hover or drag-over; 56px icon tile |
| File row | `.file-row` | Bordered row for an uploaded file |
| Tree rows | `.tree-cell` | Indent, a 22px toggle button, and a faint background on child rows |
| Star rating | `.stars` | 16px stars in `#F5B301`; empty ones in `--surface-3` |
| Permission matrix | `.perm-matrix` | Table with grey uppercase module rows and centred 90px action columns |
| Mini calendar | `.mini-cal` | Month pill header and a 7-column grid; today is solid green; days with events have a small dot |
| Upcoming list | `.up-item` | Rounded row with a round icon, title, sub-line and a time pill; the current one is lime |
| Greeting banner | `.hello` | Large white card: date kicker, 32px heading, stat pills, floating note cards on the right |
| Access tile | `.acc-tile` | Bordered tile with a coloured icon square; colour set by `data-level` |
| Position pill | `.pos-pill`, `.cm-pill` | Small bordered pill with an icon |
| Grade tag | `.grade-tag` | Small green code box followed by a name |
| Inline code | `.code` | Monospace 12.5px on `--surface-2` |

---

## 26. Login page

A two-column page on a soft gradient, using `.lg-*` classes from `login.css`.

| Area | Content and style |
|---|---|
| Page | `linear-gradient(135deg, #F7FAF8, #EEF4F0)`, full height, centred, padding `48px 24px` |
| Decoration | A pale green circle in the top-left corner; leaves and a hill SVG in the bottom-left |
| Wrapper | Max width 1340px, grid `1.05fr 0.95fr`, gap 72 |
| Left | Logo (84px tall), headline (`clamp(36px, 4.2vw, 60px)`, weight 800, `#183A35`, last word in green), lead paragraph (18px), a row of four features (52px round icon, title, sub-line) |
| Right | White card, max width 680px, radius 28, padding `48px 52px 36px`, shadow `0 2px 6px rgba(19,34,26,.04), 0 30px 60px rgba(19,34,26,.08)` |
| Card contents | "Welcome back" (34px) and "Sign in to your account" (18px); email with a mail icon; password with show/hide; "Remember me" checkbox and "Forgot password?" link; full-width button |
| Inputs | 56px tall, 15.5px text, 15px labels |
| Submit | Full width, 58px tall, 17px text, radius 14 (not a pill), arrow icon on the right |
| Footer line | Shield icon and "Your data is secure with us", 12.5px, muted |

Under 1100px the left column's paragraph and features are hidden and the logo and headline sit centred above the card. Under 560px the card padding and heading sizes shrink.

---

## 27. Empty, loading and error states

| State | Component | Look |
|---|---|---|
| Nothing to show | `EmptyState` | Centred: 64px green icon tile (radius 20), `h3` title, optional text, optional action button; padding `40px 24px` |
| Loading a table | `TableLoading` | One row with a centred spinner, padding 40 |
| Loading a page | `FullPageLoader` | A 32px spinner centred on the page |
| Loading a lazy route | `Suspense` fallback | A centred spinner |
| Record not found | `NotFoundPage` | A card with an empty state: "User not found" and a **Go to overview** button |
| No permission | `ForbiddenPage` | A card with an empty state: "You don't have access to this page" |

The spinner is a ring: `2.5px solid var(--green-100)` with a `--green-600` top edge, turning once every 0.7s. Default size 20px.

Empty-state wording changes with filters: "No users yet" with none set, and "No users match your filters" when filtered.

List queries use `placeholderData: keepPreviousData`, so the old rows stay visible while the next page loads.

---

## 28. Responsive and print

| Breakpoint | What changes |
|---|---|
| ≤ 1200px | `.grid-4` becomes two columns |
| ≤ 1100px | `.detail-layout` and review layouts become one column; the login page becomes one column |
| ≤ 960px | The sidebar leaves the grid and slides in from the left (`.app.is-mobile-open`); all grids and form grids become one column; filter-bar search and dropdowns go full width; page title 22px; `.kv` becomes one column |
| ≤ 760px | Smaller two-column blocks stack |
| ≤ 560px | Toasts go full width; login card padding shrinks |
| Height ≤ 820px | The sidebar promo card is hidden |

Narrow metric cards use a container query: under 270px wide the donut shrinks from 104px to 84px.

Print: the sidebar, header actions, filter bar and table footer are hidden; the page background is white; cards get a border in place of a shadow.

---

## 29. Behaviour conventions

**Permissions.** `usePermissions(screen)` returns `{ view, create, edit, delete, approve, export }`. Routes are wrapped in `RequirePermission`; buttons and menu items are hidden when the role lacks the action. The server enforces the same rules — the UI checks are for usability only.

**Remembered in the browser** (`localStorage`):

| Key | Stores |
|---|---|
| `pms.sidebar` | Sidebar collapsed or open |
| `pms.view.<screen>` | Table / Cards / List |
| `pms.cols.<table>` | Column order and hidden columns |
| `pms.kpi.<page>` | Summary cards shown or hidden |

**Remembered for the tab session** (`sessionStorage`, `useSessionState`): a list's search, filters, page and page size. They are restored only when the user returns from one of that list's own records (edit, new, details). Opening the list from the menu starts fresh. All are cleared on sign-out.

**Data fetching.** Query keys follow `['entity', 'list' | 'summary' | id, params]`. After a mutation, invalidate the entity's key. Queries are fresh for 30 seconds, do not refetch on window focus, and do not retry 4xx errors. Dropdown option lists are cached for 5 minutes.

**Formatting.**

| Data | Format |
|---|---|
| Date | `30 Nov 2026` |
| Date and time | `30 Nov 2026, 14:05`, in the user's time zone |
| Short date | `30 Nov` |
| Money | `₹2,00,000`; decimals only when present |
| Numbers | Grouped with `en-IN` |
| Missing value | `—` |

**CSV export** adds a BOM for Excel, quotes cells when needed, and prefixes cells that start with `=`, `+`, `-` or `@` with a quote to block formula injection.

**Accessibility.** Every focusable control shows the green focus ring. Popups use `role="dialog"` and `aria-modal`; menus use `listbox` and `option`; tabs use `tablist` and `tab` with `aria-selected`. Icon-only buttons have a `title` and an `aria-label`.

**Motion.** Colour and border transitions take 0.15s; layout and transform transitions 0.2s. Cards lift 3px on hover. The only looping animations are the spinner and the pulse on the alert card icon.

---

## 30. Things to clean up when porting

These are real quirks in the current code. None of them break the app, but they are worth fixing in a fresh copy.

1. **The sidebar is styled four times in `theme.css`.** A white floating card, then a deep green theme, then a flush layout, then the final light green — each overriding the last. Only the final result is described in this guide. Collapse those blocks into one when you copy the file.
2. **A second promo-card block uses `!important`** to beat the earlier ones. It can be removed once item 1 is done.
3. **Two rules are set in both stylesheets.** Toast position (bottom-right in `theme.css`, top-right in `app.css`) and disabled button opacity (0.45, then 0.6). The `app.css` values are the ones in effect.
4. **The mobile sidebar has no toggle.** The CSS for `.app.is-mobile-open` exists, but nothing in the React code sets that class, so under 960px the menu cannot be opened. Add a menu button to `Topbar` if you need mobile support.
5. **Some styles are defined but not used by any React page:** `.form-steps`, `.form-aside`, `.form-help`, `.hello`, `.tiles`, `.dropzone`, `.stars`, `.detail-head`, `[data-tip]`, `.btn-dark`, `.badge-lime`, `.card-soft`, `.card-green`, `.stat-card`. They come from the original mock-ups and work — keep the ones you want.
6. **A few colours are hard-coded outside the tokens:** the alert red `#B42318`, the Gantt palette, the pie palette, and the login heading `#183A35`. Turn them into tokens if you plan to re-theme.
7. **`color-mix()` and container queries are used** in several places. Both need a current browser (2023 or later).
8. **No dark mode.** All tokens are light-only.

### Re-theming to another brand colour

Because almost everything reads from tokens, changing the brand colour means editing:

1. The `--green-*` scale and `--lime` in `:root`.
2. `--tint-*` and `--success`.
3. The hard-coded gradient stops listed in [Gradients](#6-gradients) (`#1F7A45`, `#14532D`, `#0B3B22`, `#EAF7EC`, `#DDF0E1`, `#F4F9EF`, `#E3EFD6`, and the SVG stops in `MetricCards.jsx` and `SidebarFooter.jsx`).
4. The focus ring `--ring`, which uses the primary colour as `rgba(22,163,74,.16)`.
5. The chart palettes in `MetricCards.jsx` and the `.c1`–`.c8` classes.
6. The neutrals (`--bg`, `--surface-2`, `--border`, `--ink`), which carry a slight green tint.
