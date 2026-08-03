# Project Board

A **local-first** personal project inventory dashboard. Track status, progress, steps, notes, deadlines, and simple stats for your side projects — inspired by Focalboard / Taskcafe, scoped down for one person.

- **Product name:** Project Board  
- **Stack:** Vite + React + TypeScript  
- **Version:** 0.10.0
- **Focus Session documentation:** v0.11; runtime version chrome remains v0.10.0
  while version chrome work is deferred because of existing lockfile metadata drift
- **Storage:** browser `localStorage` key `project-board-v1`  
- **UI language:** English  

## Design (v0.10 “Quiet Command Center”)

- **Surface ladder** — near-black blue-slate surfaces (`sunken`, `base`, `raised`, and `overlay`) use hairline borders for depth; no blur, gradients, glow, or glass effects
- **Single accent** — restrained focus blue is reserved for interactive affordance, focus, active rules, and the primary action; each view keeps at most one accent-filled element
- **Semantic signals** — status, health, and deadline hues are used as small graphical reinforcement and always appear beside visible text labels, so meaning survives greyscale, color blindness, and forced-colors mode
- **Editorial hierarchy** — page title → uppercase tracked section label → item title → metadata, with system fonts and tabular numerals for counts, progress, dates, and timestamps
- **Grouping by purpose** — Dashboard uses a ledger strip and status-spined project cards, Board uses sunken troughs, Review uses report lists, and Activity uses a timeline; these are not uniform SaaS cards
- **Measured contrast floors** — final tokens target at least 4.5:1 for body text and 3:1 for UI borders. The tightest checked pairings are dark danger-on-hover at 4.72:1, light warning-on-sunken at 4.53:1, and light muted-on-sunken at 4.56:1
- **Responsive and accessible** — touch targets remain at least 44px, focus rings, reduced motion, forced colors, print styles, both themes, and the existing mobile Board overflow affordance are preserved
- **No new dependencies** — the redesign is presentation-only; storage keys and schemas, routes, import/export, shortcuts, Board keyboard behavior, dialogs, PWA behavior, and deployment flow remain unchanged
- **Version chrome** — footer shows **v0.10.0**

The v0.9 accessibility contracts remain in force: the mobile menu and `?` dialog
retain their shared focus lifecycle, Board-owned keys are claimed before action
resolution, and the narrow Board hint is static, real-overflow-gated,
non-focusable, session-only, and never persisted.

## Deployment (v0.8.2)

- **Canonical publish flow** — `npm run build:pages`, then publish the **contents of `dist/`** to the **root of the `gh-pages` branch**
- **`.nojekyll` is reproducible** — Vite copies tracked `public/.nojekyll` to `dist/.nojekyll`; publishing the contents of `dist/` places it at the `gh-pages` root
- **`dist/404.html`** is the SPA fallback (a copy of `index.html`)
- **Known behavior** — under legacy GitHub Pages, a direct link to a client-side route returns **HTTP 404** while the fallback app body is served, so the app still renders and routes correctly
- No GitHub Actions deploy workflow; publishing is a manual branch update

## Reliability (v0.8.1)

- **Strict import validation** — `Settings → Import JSON` rejects malformed, unsafe, or oversized files before anything is applied, with plain-language errors. Bounds: 5 MB per file, 5000 projects, 500 steps/links per project, allow-listed `status` / `type` / `theme` values, validated dates and ids
- **Regression tests** — `npm test` runs a dependency-free `node:test` suite over the import boundary and the router advisory guard
- **Router advisory** — `react-router` 8.3.0; `npm audit` reports 0 vulnerabilities. See `docs/DEPENDENCY_NOTES.md` for the evidence trail
- **Version chrome** — footer shows **v0.8.1**

## Focus Session (v0.11 documentation)

Focus Session is a single global, local-first timer available from Dashboard and
Project Detail. Choose 15, 25, 45, or 60 minutes (25 by default), with an
optional link to one unfinished step. Only one active session exists across the
app.

- **Recovery from absolute time** — `startedAt` and `endsAt` are persisted UTC
  instants. Reload, navigation, tab close, browser restart, sleep, and expiry
  recover from those boundaries; the displayed countdown is recalculated and no
  per-second timer tick is written to storage.
- **Stop and resolve** — Stop persists `active.stoppedAt` immediately and leaves
  the session ready to resolve. It is clamped canonically as
  `min(max(now, startedAt), endsAt)`, and later finalization uses it for `endedAt`
  and `elapsedSeconds`. Expired or stopped sessions are resolved explicitly:
  mark an unfinished linked step done, keep working, save an optional note, or
  finish without a note. Nothing is auto-completed on expiry or recovery.
- **Linked-step cleanup** — Completing or removing the linked step through the
  rest of the app removes only `active.stepId`; the active session keeps running.
  The resolver offers Mark step done only when the link still points to an
  unfinished step.
- **History and validation** — History is newest-first and capped at 250. Imports
  strictly validate project/step references, allowed presets/outcomes, canonical
  ISO UTC `Z` timestamps with valid calendar dates, derived `elapsedSeconds`, and
  exact full-duration expired records. Duplicate history ids are deduped
  deterministically before the cap by `endedAt` descending, then `id` ascending.
  A completed-step active reference can be recovered by removing `focus.active`
  and re-importing; a mismatched derived elapsed value can be corrected or
  recovered from an untruncated backup.
- **Backup and cleanup** — Export includes the top-level `focus` object; legacy
  backups may omit that field. When present, `focus` contains required `active`
  (null or an active session) and `history` array, including `active.stoppedAt`.
  Replace import restores it; merge preserves the local active session, ignores
  incoming active state, and unions history by id with local records winning
  collisions. Project deletion clears its active session and history, reset
  clears focus, and seed loading never creates focus records (seed replacement
  prunes against the resulting projects).
- **Accessible surfaces** — The drawer uses the shared modal focus lifecycle:
  focus enters on open, Tab and Shift+Tab stay inside, Escape closes without
  stopping the session, and focus returns to the opener. Dashboard has a Current
  focus band, Project Detail has a neutral weekly summary, Activity shows focus
  events, and Review shows focus minutes without scores or streaks.
- **Scope** — No new route, dependency, storage key, keyboard shortcut, telemetry,
  analytics, notification, or network behavior. Focus is optional in the existing
  `version: 1` `project-board-v1` storage/export shape.

The visible footer remains **v0.10.0**. This documentation uses v0.11 while
version chrome is deferred because the existing lockfile root metadata already
drifts from the package version; package and version source files remain at their
current values.

## Features (v0.8 “Steady”)

- **Weekly review** — `/review` (shortcut `r`): KPI strip, overdue / due soon / stale in progress / no steps, rule-based suggested actions, soft-archive idle bulk, snapshot + export  
- **Board keyboard** — focusable cards; ←→ / h l change status; ↑↓ / k j move focus; Enter/Space open; aria-live status; hint in subtitle  
- **Hygiene tools** — Settings panel: counts (no steps, idle, overdue, empty tags), soft-archive idle, no-steps links, copy plain-text report  
- **Step bulk** — mark all done / clear done / remove completed; one activity event each  
- **Import preview** — parse → modal (counts, sample titles, settings keys); Cancel / Replace all / Merge by id (+ optional apply settings)  
- **Version chrome** — footer shows **v0.8.0**  

## Features (v0.7 “Discipline”)

- **Drag-reorder steps** — HTML5 drag handle on project detail; Up/Down buttons for keyboard a11y; order persists as 1…n  
- **Focus this week** — Dashboard chip filters starred, due within 7 days / overdue, or `in_progress`; URL `?focus=1`  
- **Backup nudge** — `settings.lastExportAt` set on export; Settings shows last export; soft Dashboard banner when never or &gt;7 days (session dismiss)  
- **Duplicate project** — copy as `idea` with steps unchecked; Detail + card actions  
- **Link chips** — safe http(s) open; path-like links copy-only; up to 2 chips on cards  
- **Version chrome** — footer shows **v0.7.0**  

## Features (v0.6 “Real inventory”)

- **Realistic seed** — host inventory template (Project Board, Orbit Tap, Lobby Chaos, xVELOCITY Race, Roxy Landing, Portfolio SPA, Second Brain + Hermes ops, Hotelfach study aids)  
- **Load realistic inventory** — onboarding CTA + Settings merge/replace (seed mirrors projects on this host)  
- **Dated export** — downloads `project-board-YYYY-MM-DD.json`  
- **Version chrome** — footer shows **v0.6.0**  

## Features (v0.5 “Focus”)

- **Collapsible filters** — Dashboard filters panel; collapsed by default on mobile with active-count badge; open/closed preference remembered  
- **Star / pin** — Star on card and detail; starred projects sort to the top  
- **Due soon strip** — Deadlines in the next 7 days or overdue (excludes done/archived unless Show completed)  
- **Soft archive + undo** — Archive from card or detail; toast with Undo for ~5s; hard delete still on detail with confirm  
- **Quick-add step** — Compact “+ step” on project cards without opening detail  

## Features (v0.4.1)

- **Mobile layout** — bottom tab bar (Home / Board / Activity / More) under 768px; top bar is brand + New + actions menu (theme, snapshot, export); no crammed horizontal nav  
- **Filters on narrow screens** — stack full-width; chips wrap; KPI cards use tighter padding; touch targets ≥44px  

## Features (v0.4)

- **Markdown notes preview** — safe subset on project detail (**bold**, *italic*, `code`, lists, links); Edit / Preview toggle  
- **Keyboard shortcuts** — `n` new · `/` search · `b` board · `d` dashboard · `r` review · `a` activity · `?` help (ignored while typing)  
- **Weekly snapshot** — header **Snapshot** or Settings → printable share card (KPIs + active titles)  
- **Dashboard** — KPI row, filters, search, dense project cards  
- **Board** — kanban columns by status (Idea → Archived); drag a card to change status  
- **Activity log** — persisted events; Activity page + Recent strip on Dashboard  
- **Onboarding** — first visit with an empty board offers seed data, create project, or skip  
- **Theme** — dark / light / system; toggle in header and Settings  
- **Filter polish** — status/type/tag chips, Clear filters, URL query sync  
- **PWA lite** — web manifest, install icons, minimal service worker (production)  
- Progress from steps, health badges, export/import JSON, seed data  

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Production build

```bash
npm run build
```

Preview the build:

```bash
npm run preview -- --host 127.0.0.1 --port 8780
```

## Tests

```bash
npm test
```

Runs Node's built-in test runner over `src/**/*.test.ts`. No test framework
dependency; `scripts/test-resolve-hook.mjs` only teaches Node to resolve the
app's extensionless relative TypeScript imports. Test files are typechecked by
`tsconfig.test.json` and excluded from the app build.

### GitHub Pages (project site)

Live: **https://aichrisz.github.io/project-board/**

```bash
npm run build:pages   # sets base /project-board/ + SPA 404.html
```

Publish steps:

1. Run `npm run build:pages` (sets `VITE_BASE=/project-board/` and copies `dist/index.html` to `dist/404.html`).
2. Publish the **contents of `dist/`** to the **root** of the `gh-pages` branch (not into a subdirectory).
3. Keep `.nojekyll` present at the `gh-pages` root so Jekyll does not strip `_`-prefixed asset paths.

`dist/404.html` is the SPA fallback. Under legacy GitHub Pages, opening a deep
link such as `/project-board/board` directly returns an **HTTP 404 status** while
the fallback app body is served; the router then renders the requested view. The
status code cannot be changed on static Pages hosting.

Repo: https://github.com/aichrisz/project-board

Service worker registration runs only in production builds (`import.meta.env.PROD`).

## Views

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — cards, filters, sort, stats, recent activity, due soon |
| `/board` | Board — columns by status; drag or keyboard to change status |
| `/review` | Weekly review — KPIs, buckets, suggested actions, hygiene bulk |
| `/activity` | Activity log (last 100 events) |
| `/project/:id` | Project detail |
| `/new` | Create project |
| `/settings` | Theme, hygiene, idle days, export/import preview, seed |

## URL filters (Dashboard)

Bookmark or share a filtered view. Examples:

| Query | Effect |
|-------|--------|
| `/?status=in_progress` | Only in-progress |
| `/?type=game&q=orbit` | Games matching “orbit” |
| `/?showCompleted=1&status=done` | Show completed, Done only |
| `/?tag=portfolio&sort=title&dir=asc` | Tag + sort |
| `/?focus=1` | Focus this week (starred / due soon / in progress) |

## Export backup tip

Browser storage can be cleared. From the app header or **Settings → Export JSON**, download a backup file regularly (`project-board-YYYY-MM-DD.json`). Restore via **Settings → Import JSON**. Settings records **Last export** time; a soft reminder appears on the Dashboard when you have never exported or the last export is older than 7 days (dismissible for the session only).

Data shape:

```json
{
  "version": 1,
  "projects": [ /* ... starred?: boolean ... */ ],
  "settings": {
    "showCompleted": false,
    "idleDays": 14,
    "theme": "system",
    "lastExportAt": null
  },
  "focus": {
    "active": {
      "id": "focus-example",
      "projectId": "project-example",
      "stepId": "step-example",
      "startedAt": "2026-08-03T09:00:00.000Z",
      "endsAt": "2026-08-03T09:25:00.000Z",
      "stoppedAt": "2026-08-03T09:05:00.000Z",
      "plannedMinutes": 25
    },
    "history": [
      {
        "id": "focus-history-example",
        "projectId": "project-example",
        "stepId": "step-example",
        "startedAt": "2026-08-03T08:00:00.000Z",
        "endedAt": "2026-08-03T08:05:00.000Z",
        "plannedMinutes": 25,
        "elapsedSeconds": 300,
        "outcome": "stopped",
        "note": "Example reflection"
      }
    ]
  }
}
```

Activity events use a separate key: `project-board-activity-v1` (capped at 100).  
Missing `starred` on load migrates to `false`. Missing `lastExportAt` migrates to `null`.
The top-level `focus` field may be omitted in legacy v1 backups; when present, it
contains required `active` (null or an active session) and `history` array. An
absent field loads as `{ "active": null, "history": [] }`. `active.stoppedAt`,
`stepId`, and history `stepId` / `note` are optional. Focus timestamps are
canonical UTC `Z` instants; millisecond precision may be omitted in a valid
backup.

## Seed projects (realistic inventory)

On first load (empty storage), the board starts **empty** with an onboarding card. Load inventory from onboarding or **Settings**:

| Project | Type | Status |
|---------|------|--------|
| Project Board | web | in_progress |
| Orbit Tap | game | done |
| Lobby Chaos | game | done |
| xVELOCITY Race | game | done |
| Roxy Landing | web | paused |
| Portfolio SPA | web | planned |
| Second Brain + Hermes ops | infra | in_progress |
| Hotelfach study aids | learning | in_progress |

Seed notes include local paths under `/root/projects/*` and vault path for ops. Public URLs are linked where they exist (portfolio).

## Privacy

Everything stays in your browser. No accounts, no telemetry, no secrets required.
