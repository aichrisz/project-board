# Project Board — Product Feature Spec (for external AI)

**Document type:** Portable product specification  
**Audience:** Any AI or engineer implementing, reviewing, or extending the app  
**Product name:** Project Board  
**Current documented version:** 0.13.0 (Conflict-safe project signals)\
**Current shipped capability:** all features through **v0.13.0**; visible runtime version chrome and package metadata are synchronized at **v0.13.0**\
**Last updated:** 2026-09-22

This document is **self-contained**. It describes *what the product is* and *what features exist*. It does **not** depend on a specific host, owner name, or agent toolchain.

---

## 1. One-line summary

**Project Board** is a **local-first, single-user** web app for tracking personal side projects: status, progress steps, notes, deadlines, tags, links, and light analytics — inspired by Focalboard/Taskcafe, scoped down (not multiplayer Jira).

---

## 2. Product principles (non-negotiable unless PRD reopened)

| Principle | Meaning |
|-----------|---------|
| Local-first | Browser `localStorage` remains the offline cache; authenticated deployment persists the workspace in SQLite (document version `1`) |
| Single-owner | Cloudflare Access authenticates the owner and isolates one workspace per owner; no multiplayer or real-time collaboration |
| Generic branding | UI product name is **Project Board** only (no personal name in chrome) |
| UI language | **English only** (v1) |
| Completed items | `done` / `archived` are **hidden by default**; reveal via “Show completed” |
| Responsive | Mobile + desktop first-class |
| Lightweight | Prefer zero heavy chart/DnD libraries; CSS + small React surface |
| Privacy | No telemetry; no secrets in repo |
| Export safety net | JSON export/import so clearing storage is recoverable |

**Explicitly out of scope (unless product decisions change):**  
multi-user real-time collaboration, multi-board workspaces, GitHub Issues sync, i18n, and role-based permissions.

---

## 3. Tech stack

| Layer | Choice |
|-------|--------|
| Build | Vite |
| UI | React 19 + TypeScript |
| Routing | react-router (the `react-router-dom` compatibility package was removed upstream in v8) |
| Lint | oxlint (optional in CI) |
| Persist | Authenticated-owner SQLite workspace with browser `localStorage` offline cache; document version `1` |
| PWA | Lite: web manifest + minimal service worker (production) |
| Deploy | Authenticated Node server serves the built app from loopback; Cloudflare Access provides the owner identity. GitHub Pages remains a static manual publish path via `npm run build:pages` and the `gh-pages` root. |

**Typical local commands:**

```bash
npm install
npm run dev          # development
npm run build        # tsc -b && vite build
npm run preview      # serve dist (e.g. port 8780)
```

---

## 4. Domain model

### 4.1 Project

| Field | Type / notes |
|-------|----------------|
| `id` | Stable string id |
| `title`, `slug` | Display + URL-friendly slug |
| `type` | `game` \| `web` \| `tool` \| `learning` \| `infra` \| `other` |
| `status` | `idea` \| `planned` \| `in_progress` \| `paused` \| `done` \| `archived` |
| `summary` | Short text |
| `progress_pct` | 0–100; usually derived from steps |
| `steps[]` | Checklist milestones |
| `notes_md` | Markdown (safe subset on render) |
| `links[]` | `{ id, label, url }` |
| `tags[]`, `stack[]` | String arrays |
| `deadline` | `YYYY-MM-DD` or null |
| `created_at`, `updated_at` | ISO timestamps |
| `started_at` | Optional; set when status becomes `in_progress` |
| `starred` | Boolean pin (default false) |

### 4.2 Step

| Field | Notes |
|-------|--------|
| `id`, `title` | |
| `done` | boolean |
| `order` | Integer 1…n (reorderable) |

### 4.3 Settings (`AppSettings`)

| Field | Notes |
|-------|--------|
| `showCompleted` | Reveal done/archived |
| `idleDays` | Threshold for “Idle” health badge (default 14) |
| `theme` | `dark` \| `light` \| `system` |
| `lastExportAt` | ISO string or null — set on successful export |

### 4.4 Activity event

Capped log (~100): project created/deleted, status change, step toggle, import, seed, reset, etc.

### 4.5 Storage blob

```json
{
  "version": 1,
  "projects": [ /* Project[] */ ],
  "settings": { /* AppSettings */ },
  "focus": { /* optional FocusState; additive within version 1 */ }
}
```

Activity may be stored separately or alongside depending on implementation; projects + settings are the canonical export payload.

In the authenticated deployment, this version `1` document is persisted in the
owner's SQLite workspace row. Browser `localStorage` is the offline cache, and
workspace API writes use ETag / `If-Match` optimistic concurrency.

### 4.6 Focus Session

Focus state is stored in the existing `project-board-v1` blob as an optional
field. When present, `focus` contains required `active` (null or an active
session) and `history` array. `version` remains `1`; older blobs without `focus`
load as `{ active: null, history: [] }`.

| Field | Type / notes |
|-------|--------------|
| `active` | `ActiveFocusSession` or null; one global session, with `projectId`, optional `stepId`, canonical UTC `startedAt` / `endsAt`, optional `stoppedAt`, and `plannedMinutes` of 15, 25, 45, or 60 |
| `history` | Newest-first `FocusSessionRecord[]`, capped at 250; each record has `projectId`, optional `stepId` / `note`, canonical UTC `startedAt` / `endedAt`, `plannedMinutes`, derived integer `elapsedSeconds`, and outcome `completed` \| `stopped` \| `expired` |

The Dashboard and Project Detail start the session. `endsAt` is the authoritative
absolute timer boundary, so reload, navigation, tab close, browser restart, sleep,
and expiry recover from timestamps; the visible countdown is not persisted per
second. Stop stores `stoppedAt` immediately, clamped canonically as
`min(max(now, startedAt), endsAt)`, and keeps `active` present for explicit
resolution. Finalization uses `stoppedAt` as the `endedAt` and elapsed boundary,
not the later time at which the resolver is opened or submitted.

The step link is optional and must point to an unfinished step while active. The
resolver can explicitly mark that linked step done, keep working, or save/finish
with an optional note. Expiry and restoration never complete a step automatically.
If the linked step is completed or removed elsewhere, only the active `stepId` is
cleared and the session continues; the resolver then cannot offer Mark step done.

Focus imports use the existing pre-apply validation boundary. They require the
allowed presets and outcomes, existing project/step references, valid calendar
dates in canonical ISO UTC `Z` form (optional millisecond precision), derived
`elapsedSeconds`, and the exact planned end/full duration for `expired` records.
Duplicate history ids are deduped deterministically before final ordering and the
cap: sort by `endedAt` descending, then `id` ascending, and keep the first id.
Local finalization trims history to 250; an import that remains over 250 after
dedupe is rejected. If a hand-edited import points `focus.active` at a completed
step, remove that block or re-export. If `elapsedSeconds` no longer matches its
timestamps, correct the value or restore an untruncated backup.

Export includes the top-level `focus` object; legacy backups may omit that field.
When present, `focus` contains required `active` (null or an active session) and
`history` array, including `active.stoppedAt`. Replace restores validated
imported focus, or empty focus when the field is absent. Merge preserves the
local active session and ignores imported active state; it unions history by
record id, keeps the local record on an id collision, sorts newest-first, caps at
250, and prunes references against the post-merge projects.
Project deletion clears its active session and removes its history; full reset
clears focus; seed loading never creates focus records, and seed replacement
prunes focus against the resulting seed projects.

The Focus Session drawer uses the shared accessible dialog lifecycle: focus enters
on open, `Tab` / `Shift+Tab` wrap within the drawer, `Escape` closes without
stopping the session, and focus returns to the opener. Dashboard Current focus,
Project Detail's neutral weekly summary, Activity focus events, and Review's
focus-minutes aggregate are informational and do not create scores, streaks,
grades, or recommendations.

---

## 5. Routes / views

| Route | Purpose |
|-------|---------|
| `/` | **Dashboard** — KPI, filters, cards, due-soon, recent activity, focus mode |
| `/board` | **Kanban** — columns by status; drag card to change status |
| `/activity` | Full activity log |
| `/project/:id` | Project detail (steps, notes, links, edit, archive, duplicate) |
| `/new` | Create project |
| `/settings` | Theme, display, backup, seed, snapshot |

**Mobile (< ~768px):** bottom tab bar (e.g. Home / Board / Activity / More).

---

## 6. Feature inventory by version

Use this as a capability checklist. Versions are incremental; **current documented
ship = all rows through 0.13.0**. Version 0.8.2 added no product features
(documentation and release metadata only).

### 6.1 v0.1 — MVP

- Create / edit / delete projects  
- Types & statuses as above  
- Steps checklist with progress  
- Notes field  
- Tags, stack, deadline  
- Dashboard card grid  
- Stats by type/status  
- Hide completed by default  
- Persist to `localStorage`  
- Responsive English UI  

### 6.2 v0.2 — Board

- `/board` kanban columns by status  
- Drag-and-drop card → update status  
- Sort: updated, deadline, progress, title (+ direction)  
- Health badges: overdue, at-risk, idle  
- Export / import JSON  
- Seed data loader (merge/replace patterns)  

### 6.3 v0.3 — Daily driver

- Activity log + recent strip on dashboard  
- First-visit onboarding / empty states (no forced auto-seed)  
- Theme: dark / light / system  
- Filter polish: status, type, search, tag chips, clear all  
- Filters reflected in **URL query** (shareable/bookmarkable)  
- PWA lite (manifest, icons, minimal SW in production)  

### 6.4 v0.4 — Polish

- Safe markdown preview for notes (`**bold**`, `*italic*`, `` `code` ``, lists, links)  
- Keyboard shortcuts (examples): `n` new, `/` search, `b` board, `d` dashboard, `a` activity, `?` help (ignored while typing)  
- Weekly snapshot: printable share card (KPIs + active titles)  

### 6.4.1 — Mobile

- Bottom navigation tabs  
- Touch targets ≥ 44px  
- Filters stack full-width on narrow screens  

### 6.5 v0.5 — Focus UX

- Collapsible filter panel (mobile collapsed by default; active-count badge)  
- **Star / pin**; starred sort to top  
- **Due soon** strip: deadline within 7 days or overdue (respects show-completed)  
- Soft archive + ~5s undo toast  
- Quick-add step on cards without opening detail  

### 6.6 v0.6 — Real inventory

- High-quality **seed inventory** of realistic example projects (template for first load)  
- Onboarding/Settings CTA: **Load realistic inventory** (merge or replace)  
- Export filename pattern: `project-board-YYYY-MM-DD.json` (UTC date)  
- App version shown in UI chrome/footer (semver constant)  

### 6.7 v0.7 — Discipline

1. **Reorder steps** — HTML5 drag handle + Up/Down buttons; persist contiguous `order` 1…n  
2. **Focus this week** — chip filters projects that are **starred OR due ≤7d/overdue OR `in_progress`**; URL e.g. `?focus=1`; empty-state copy when none  
3. **Backup nudge** — `lastExportAt` on export; Settings shows last export; dashboard soft banner if never or older than 7 days (session-only dismiss)  
4. **Duplicate project** — clone as new id; title suffix ` (copy)`; status `idea`; steps cloned with `done: false`; `starred: false`  
5. **Link chips** — http(s) open with `rel="noopener noreferrer"`; non-http path-like → copy only; block dangerous schemes; up to 2 chips on dashboard cards  

### 6.8 v0.8 — Steady

1. **Weekly review** — route `/review`; KPI strip; sections overdue / due soon / stale in_progress / no steps; rule-based suggested actions; soft-archive idle bulk; snapshot + export; shortcut `r`  
2. **Board keyboard a11y** — focusable cards; ←→ (or h/l) change status; ↑↓ (or k/j) move focus; Enter/Space open detail; aria-live; ignore keys while typing  
3. **Hygiene tools** (Settings) — counts (no steps, idle, overdue, empty tags); soft-archive idle; no-steps links; copy hygiene report  
4. **Step bulk** — mark all done / clear all done / remove completed steps (confirm); one activity event per bulk action  
5. **Import preview** — parse first; show counts, overlapping ids, sample titles; Cancel / Replace all / Merge by id  

### 6.9 v0.8.1 — Reliability

1. **Strict import validation** — untrusted import files are validated at the file/import boundary before any preview or apply. Rejects non-object roots, unsupported versions, malformed project/step/link shapes, blank or duplicate ids, out-of-allow-list `status` / `type` / `theme`, invalid dates, out-of-range `progress_pct` and `idleDays`
2. **Bounded inputs** — documented caps: 5 MB per file, 5000 projects, 500 steps and 500 links per project, 50 tags/stack entries, per-field length limits
3. **User-safe errors** — rejection messages name the offending field and are free of stack traces or source internals
4. **Additive migration preserved** — valid v1 exports still parse; missing `starred` / `started_at` still default safely
5. **Regression tests** — dependency-free `node:test` suite covering the import boundary and a guard against known router advisory ranges

### 6.10 v0.9 — Accessibility & mobile field use

1. **Shared modal focus lifecycle** — one primitive (`useDialogFocus`) drives both
   the mobile menu sheet and the `?` shortcuts dialog: focus moves into the
   surface on open (preferred target, else first focusable child, else the
   container via `tabindex="-1"`), `Tab` / `Shift+Tab` wrap at the surface edges,
   `Escape` closes, and focus returns to the element that opened it. No component
   keeps a second focus-trap implementation
2. **Board key ownership** — the keys the Board owns (`←→` / `h` `l` status,
   `↑↓` / `k` `j` focus, `Enter` / `Space` open detail) are claimed before the
   action is resolved, so an owned key at a column or card boundary neither
   scrolls the page nor activates the card. Keys are still ignored while typing;
   `aria-live` status announcements and post-move refocus are preserved
3. **Mobile Board scroll affordance** — at `max-width: 767px`, and only when the
   scroll container really overflows, the Board renders static hint text that
   swiping sideways reveals more statuses and that status can be changed by
   keyboard or from a project's detail page. Constraints: static text only, never
   focusable, no button role, never an `aria-live` region, `pointer-events: none`,
   never rendered on desktop. It retires after ~24px of horizontal scroll; the
   dismissal is in-memory for the session and never persisted
4. **Compact narrow empty Board** — reserved board height is reduced under the
   narrow breakpoint, and reduced further when the board is empty, so the
   empty-state `Create one` action stays above the fold on a phone. Desktop
   sizing and the Board's intentional internal horizontal scroll are untouched
5. **Status-change discoverability copy** — Board subtitle presents keyboard
   control and the project detail page as primary paths for changing status, with
   card dragging described as an optional desktop shortcut
6. **Pure decision helpers + coverage** — `src/lib/boardKeyboard.ts`,
   `src/lib/dialogFocus.ts`, and `src/lib/boardScrollHint.ts` hold the decisions
   as DOM- and React-free functions; `npm test` runs 99 `node:test` cases

**Explicitly not changed by v0.9:** no dependency added, removed, or upgraded; no
storage key or schema change (`project-board-v1`, `project-board-activity-v1`); no
migration, backend, telemetry, cloud sync, or GitHub Pages strategy change;
desktop Board layout, drag-to-change-status, and the Board's intentional internal
horizontal scroll behavior are preserved.

### 6.11 v0.11 — Focus Session

1. **Global sessions and presets** — Dashboard and Project Detail start one
   global session using 15, 25, 45, or 60 minutes (25 by default), optionally
   linked to one unfinished step. Confirming a new session while another is
   active finalizes the old one as stopped before starting the new one.
2. **Absolute-time recovery** — `startedAt` and `endsAt` are canonical absolute
   timestamps; reload and browser lifecycle changes recalculate the remaining
   time, with no per-second persistence. An expired session remains available to
   resolve instead of being silently discarded.
3. **Stop and explicit resolver** — Stop persists `stoppedAt`, clamped
   canonically as `min(max(now, startedAt), endsAt)`, while leaving the session
   active and resolvable. Finalization uses `stoppedAt` for `endedAt` and
   `elapsedSeconds`, so resolving later does not add waiting time. The resolver
   offers Mark step done only for an unfinished linked step, Keep working, and
   an optional note or finish without a note. Expiry and restoration never
   auto-complete a step.
4. **External step cleanup** — Completing or removing the linked step through
   ordinary project/step actions clears only the active session's `stepId`; the
   timer and session remain. A completed focus outcome can only come from the
   explicit resolver action.
5. **History and strict import validation** — Finalized history is newest-first
   and capped at 250. Imports validate the allowed presets/outcomes, existing
   references, valid calendar dates in canonical ISO UTC `Z` form (optional
   milliseconds), derived integer `elapsedSeconds`, and exact planned boundaries
   for expired records. Duplicate imported history ids are deterministically
   deduped before ordering/cap by `endedAt` descending, then `id` ascending;
   histories still over 250 after dedupe are rejected. Recovery for a completed
   linked-step import error is to remove `focus.active` or re-export; recovery for
   a derived-elapsed mismatch is to correct the value or restore an untruncated
   backup.
6. **Export/import and cleanup** — Existing v1 JSON export carries the top-level
   `focus` object; legacy backups may omit that field. When present, it contains
   required `active` (null or an active session) and `history` array, including
   `active.stoppedAt`. Replace restores imported focus (or empty focus when
   absent); merge preserves the local active session, ignores incoming active
   state, and merges history by id with local collisions winning, newest-first
   ordering, and the 250 cap. Deleting a project clears its active session and
   history. Reset clears focus. Seed loading never fabricates focus records; seed
   replacement prunes focus against the resulting projects.
7. **Accessible surfaces** — The shared dialog focus lifecycle moves focus into
   the drawer, wraps `Tab` / `Shift+Tab`, closes on `Escape` without stopping the
   session, and restores focus to the opener. Dashboard Current focus, the
   Project Detail weekly summary, Activity events, and the Review focus-minutes
   aggregate are informational rather than scores, streaks, grades, or
   recommendations.

**Version boundary:** v0.11.0 describes the Focus Session feature set. The
current v0.13.0 release metadata is documented below; application semver and
the existing workspace document schema version `1` remain independent. No new
dependency, storage key, route, keyboard shortcut, telemetry, analytics,
notification, or network behavior was added. The existing v0.9 accessibility and
v0.10 visual contracts remain in force.

### 6.12 v0.12 — Focus Dashboard & durable workspace

1. **Focus Dashboard** — the Dashboard shows up to three `in_progress` projects
   in deterministic updated-date order. Each card shows the first unfinished
   step, the latest non-empty `Blocker:` note, and the existing freshness signal;
   an overflow link leads to Review, and an empty state links to the Board.
2. **Persistent authenticated workspace** — the production Node server stores a
   version `1` workspace document in SQLite per authenticated owner. Browser
   `localStorage` remains the offline cache and JSON import/export remains
   available.
3. **Cloudflare Access isolation** — Cloudflare Access supplies the authenticated
   owner identity; the server normalizes that identity and reads or writes only
   the matching owner row.
4. **Optimistic concurrency** — workspace `GET` returns an ETag and `PUT`
   requires a matching `If-Match`; missing or stale preconditions are rejected
   without overwriting newer workspace data.
5. **Conflict-safe CLI** — the dependency-free Kei CLI reads the current
   workspace and ETag for each mutation and exits nonzero on a conflict.
6. **Encrypted recovery** — Restic snapshots use the encrypted OneDrive remote;
   the restore drill verifies SQLite integrity, owner identity, and expected
   project inventory before removing the temporary restore.
7. **Release metadata** — `package.json`, both root package versions in
   `package-lock.json`, `src/version.ts`, README, changelog, and this portable
   spec identify the shipped release as v0.12.0. The workspace schema remains
   version `1`.

### 6.13 v0.13 — Conflict-safe project signals

1. **Four project-signal commands** — the dependency-free Kei CLI provides
   `set-blocker`, `clear-blocker`, `add-milestone`, and `set-next`. Blocker
   commands append `Blocker: …` notes, `add-milestone` appends a note prefixed
   with the current UTC date, and `set-next` renames the first unfinished step
   in deterministic order. If no unfinished step exists, `set-next` refuses the
   mutation and directs the user to `add-step` first.
2. **Validated mutations** — project ids and bounded command text are validated
   before any workspace write; malformed command usage and missing projects are
   rejected without a partial update.
3. **Activity trail** — each of the four signal commands emits a
   `project_updated` activity event, while preserving the existing activity cap
   and workspace validation rules.
4. **Optimistic concurrency** — every CLI mutation reads the current workspace
   ETag and sends it in `If-Match`; a missing or stale precondition is rejected
   instead of overwriting a newer workspace.
5. **Release boundary** — `package.json`, both root versions in
   `package-lock.json`, `src/version.ts`, README, changelog, and this portable
   spec identify **v0.13.0**. The workspace and export document schema remains
   `version: 1`; no dependency, storage key, route, or credential behavior
   changes.

---

## 7. Cross-cutting behaviors

### 7.1 Filtering & sorting (Dashboard)

Typical dimensions:

- Status: all active / single status / show completed  
- Type  
- Free-text search  
- Tag  
- Sort key + direction  
- Focus this week (v0.7)  

URL query should stay in sync where implemented (`filtersUrl` helpers).

### 7.2 Health signals

Examples:

- **Overdue** — deadline in the past, project not terminal  
- **Idle** — `in_progress` (or similar) without update beyond `idleDays`  
- **At risk** — approaching deadline with low progress (implementation-defined)  

### 7.3 Links safety

- Prefer `http:` / `https:` for open-in-new-tab  
- Reject or refuse to navigate `javascript:`, `data:`, etc.  
- Local path-like strings: show as copyable, not navigable  

### 7.4 Seed vs empty board

- First visit may show **onboarding** with empty board  
- User explicitly loads seed (merge or replace) or creates projects  
- Replace overwrites project list; merge skips existing ids  

---

## 8. UX references (scoped)

| Borrow from Focalboard / Taskcafe | Do not copy into v1 |
|-----------------------------------|---------------------|
| Card + board mental model | Multi-board workspaces |
| Status columns / properties | Multi-user realtime |
| Visual “where is work?” | Complex permissions / server |

---

## 9. Suggested architecture map

```text
src/
  pages/          Dashboard, Board, Activity, ProjectDetail, Settings, NewProject
  components/     Layout, ProjectCard, Board*, Filters, StepList, LinkChips, …
  store/          ProjectContext (CRUD, steps, seed, export, theme, activity)
  lib/            stats, health, sort, export, filtersUrl, focus, links, storage, …
  data/           seed.ts
  types.ts
  version.ts      APP_VERSION semver for chrome
```

**Implementers:** extend this structure; avoid greenfield rewrite unless requested.

---

## 10. Acceptance / verify checklist (current product)

An implementation is “feature-complete for 0.13” if:

- [ ] `npm run build` succeeds  
- [ ] Create/edit/delete project works and survives reload  
- [ ] Steps toggle updates progress; reorder persists  
- [ ] Board DnD changes status  
- [ ] Hide completed works; show completed reveals done/archived  
- [ ] Theme persists  
- [ ] Export writes dated JSON and sets `lastExportAt`  
- [ ] Import restores projects + settings  
- [ ] Focus chip + URL work  
- [ ] Duplicate creates idea copy with unchecked steps  
- [ ] Link chips safe for http(s) / path-like  
- [x] Footer/chrome and package metadata are synchronized at **v0.13.0**
- [ ] Kei CLI uses the default loopback API and accepts an explicit owner
- [ ] `set-blocker`, `clear-blocker`, `add-milestone`, and `set-next` validate
      input and emit `project_updated`; `set-next` directs to `add-step` when
      no unfinished step exists
- [ ] CLI mutations use `If-Match` and reject stale writes without overwriting
      newer workspace data
- [ ] Workspace and export schema remains `version: 1`
- [ ] Import rejects malformed, unsafe, or oversized files with a plain-language message
- [ ] `/review` weekly review works  
- [ ] Board keyboard status/focus works, and an owned key at a boundary neither scrolls the page nor opens the card
- [ ] Import preview before apply  
- [ ] Mobile menu and `?` shortcuts dialog: focus enters on open, `Tab` / `Shift+Tab` stay inside, `Escape` closes, focus returns to the opener
- [ ] Narrow (`≤767px`) Board shows the swipe hint only while the columns overflow, as static non-focusable text, and drops it after a short horizontal scroll
- [ ] Narrow empty Board keeps `Create one` above the fold; desktop Board layout and internal horizontal scroll unchanged
- [ ] Focus starts globally with the 15 / 25 / 45 / 60 minute presets and restores from absolute timestamps without per-second persistence
- [ ] Stop persists `stoppedAt`; resolver elapsed uses that boundary; expiry and external step changes never auto-complete a step
- [ ] Focus history is newest-first and capped at 250; UTC timestamps and derived elapsed values are strictly validated, with deterministic duplicate-id dedupe and documented recovery paths
- [ ] Export/import preserves focus active/history (including `stoppedAt`), with replace and merge semantics; project deletion, reset, and seed cleanup leave no orphaned focus state
- [ ] Focus drawer moves focus in, wraps Tab navigation, closes on Escape without stopping, and restores focus to its opener
- [ ] `npm test`, `npm run test:server`, `npm run test:cli`, `npm run lint`,
      `npm run build`, and `npm run build:pages` pass with no dependency change
- [ ] No personal name required in product UI chrome  
- [ ] Storage key remains `project-board-v1` (settings fields migrate additively)  

---

## 11. Roadmap hints (not committed)

Possible later themes (only if product owner approves a plan):

- Stronger a11y on kanban (keyboard move columns)  
- Portfolio / screenshot mode  
- Automated deploy workflow (today Pages publishing is a manual `gh-pages` root update)
- Still **not** default: multi-user real-time collaboration, multi-board, i18n

---

## 12. How another AI should use this file

1. Treat **§2 principles** as hard constraints.  
2. Treat **§6** as the feature backlog already shipped (do not re-propose v0.1–v0.5 as “new” unless fixing bugs).  
3. For new work: propose a **post-v0.13 plan** against gaps only; keep the offline cache, authenticated owner workspace, and CLI concurrency contract aligned.
4. Prefer small, versioned increments with verify via `npm run build` + manual smoke of routes above.  
5. Keep UI English and product name **Project Board**.  

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| Terminal status | `done` or `archived` |
| Active statuses | idea, planned, in_progress, paused |
| Soft archive | Set status archived with short undo window |
| Realistic inventory seed | Built-in template projects for demo/bootstrap |
| Focus this week | Filter: starred ∪ due-soon/overdue ∪ in_progress |
| Focus Session | One persisted timer with explicit resolution and optional unfinished-step link |

---

*End of portable spec. Safe to paste into another AI chat as the single source of product truth for Project Board v0.13.0.*
