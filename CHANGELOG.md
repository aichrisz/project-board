# Changelog

All notable changes to Project Board. Local-first single-user app; dates are UTC.

## 0.11.0 — Focus Session (2026-08-03)

This entry documents the shipped Focus Session as **v0.11**. Runtime/package
version chrome remains **v0.10.0**: updating it is deferred because the existing
`package-lock.json` root metadata already drifts from `package.json`. `package.json`,
`package-lock.json`, and `src/version.ts` are intentionally unchanged.

### Added

- **Global Focus Session.** Dashboard and Project Detail can start one global
  session at a time using 15, 25, 45, or 60 minutes (25 minutes is the default),
  optionally linked to one unfinished project step.
- **Timestamp-based recovery.** Sessions persist canonical absolute `startedAt`
  and `endsAt` instants, so reload, tab close, SPA navigation, browser restart,
  sleep, and expiry recover from wall-clock time. The visible clock redraws locally;
  timer ticks are not persisted per second.
- **Stop and explicit resolution.** Stop persists `active.stoppedAt` immediately,
  clamped canonically as `min(max(now, startedAt), endsAt)`, and keeps the active
  session in a ready-to-resolve state across refresh. Finalization uses `stoppedAt`
  as both `endedAt` and the elapsed boundary, so resolving later cannot inflate
  `elapsedSeconds`. Expiry
  also requires an explicit resolver action: mark the linked step done, keep
  working, save an optional note, or finish without a note. Mark step done is
  offered only for an unfinished linked step; expiry and restore never complete a
  step automatically.
- **Step-link safety.** Completing or removing the linked step elsewhere clears
  only the active session's `stepId`; the session and timer continue. A completed
  outcome is produced only by the resolver's explicit step action.
- **Bounded history.** Finalized sessions are newest-first and capped at 250
  records. Outcomes are `completed`, `stopped`, or `expired`, with derived integer
  `elapsedSeconds` and optional notes. Focus finalization adds one focus activity
  event (plus the existing step event when the resolver completes a step).
- **Strict, recoverable import validation.** Focus imports accept only the four
  presets, supported outcomes, existing project/step references, valid calendar
  dates in canonical ISO UTC `Z` form, and elapsed values derived from the stored
  boundaries. Expired records must end exactly at their planned `endsAt` and carry
  the full planned duration. Duplicate history ids are deterministically deduped
  before ordering and the cap: newest `endedAt` wins, with ascending `id` as the
  tie-breaker. If a hand-edited file points `focus.active` at a completed step,
  remove that `focus.active` block or re-export; if a re-serialized file has a
  mismatched derived `elapsedSeconds`, correct it or restore an untruncated backup.
- **Focus-aware backup.** Existing v1 JSON export includes the top-level `focus`
  object; legacy backups may omit that field. When present, `focus` contains
  required `active` (null or an active session) and `history` array, including
  `active.stoppedAt`. Replace import restores validated active/history state (or
  empty focus when absent). Merge preserves the local active session, ignores an
  incoming active session, and unions history by id with local records winning id
  collisions, newest-first ordering, and the 250 cap.
- **Cleanup and accessible drawer.** Deleting a project clears its active session
  and history; full reset clears focus; seed loading never fabricates focus records
  and seed replacement prunes focus against the resulting projects. The drawer is
  a modal with the shared focus lifecycle: focus enters on open, Tab and
  Shift+Tab wrap, Escape closes without stopping the session, and focus returns to
  the opener. Phase changes are announced without announcing every clock tick.

### Changed

- Dashboard exposes a Current focus band, Project Detail shows a neutral weekly
  focus summary, Activity renders finalized focus events, and Weekly Review adds a
  focus-minutes aggregate. These surfaces are informational; no score, streak,
  grade, or focus-derived recommendation is created.
- Focus timestamps written by the app use canonical UTC `Z` instants; optional
  millisecond precision is accepted for portable backups.

### Unchanged

- No new dependency, storage key, route, keyboard shortcut, notification,
  network call, telemetry, or analytics. Focus is an optional field in the
  existing `version: 1` `project-board-v1` blob; the activity key and its cap are
  unchanged.
- Existing v0.9 accessibility, v0.10 visual, import, Board, PWA, deployment, and
  local-first contracts remain in force.

## 0.9.0 — Accessibility & mobile field use (2026-07-31)

### Fixed

- **Modal focus lifecycle.** The mobile menu sheet and the keyboard shortcuts
  dialog now share one focus lifecycle (`useDialogFocus`): opening moves focus
  into the surface, `Tab` / `Shift+Tab` wrap inside it instead of escaping to the
  page behind, `Escape` closes, and closing returns focus to whatever opened the
  surface. Previously the menu only focused its close button and trapped nothing,
  and the shortcuts dialog did not manage focus at all, so keyboard and screen
  reader users could tab into content hidden behind an open modal and lost their
  place on close.
- **Duplicate Escape handling.** The menu's component-local Escape listener and
  the shortcut dialog's Escape branch were removed in favor of the shared hook,
  so a single keypress no longer closes through two independent handlers and race
  the focus restore. `?` still closes the help dialog.
- **Board keyboard boundaries.** Keys the Board owns (`←→` / `h` `l`,
  `↑↓` / `k` `j`, `Enter`, `Space`) are now claimed before the action is
  resolved, so pressing one at the first or last column/card no longer falls
  through to page scrolling or default card activation. Typing targets are still
  ignored.

### Added

- **Mobile Board scroll affordance.** On narrow viewports (`max-width: 767px`),
  when the status columns actually overflow their container, the Board renders a
  static hint that sideways swiping reveals more statuses and that status can be
  changed with the Board keyboard controls or from a project's detail page. It is
  plain text: no button role, no tab stop, no `aria-live`, and no pointer-event
  overlay. It retires itself after ~24px of horizontal scroll and never appears
  on desktop. The dismissal is in-memory for the session and is never persisted.
- **Compact narrow empty Board.** Under the narrow breakpoint the reserved board
  height shrinks, and shrinks further when the board is empty, so the empty-state
  `Create one` action stays above the fold on a phone. Desktop board sizing and
  the intentional internal horizontal scroll are unchanged.
- **Pure decision helpers with regression coverage.** `src/lib/boardKeyboard.ts`,
  `src/lib/dialogFocus.ts`, and `src/lib/boardScrollHint.ts` hold the keyboard,
  focus, and hint-gating decisions as DOM-free functions. `npm test` now runs 99
  `node:test` cases (up from 45), including the new keyboard action, focus wrap,
  and hint boundary suites.

### Changed

- **Board subtitle copy.** The subtitle now presents keyboard control and the
  project detail page as the primary ways to change status, with card dragging
  described as an optional desktop shortcut, instead of naming drag first on a
  touch device where it is hardest to use.
- Version chrome shows **v0.9.0**; `package.json`, `package-lock.json` root
  metadata, and `src/version.ts` are synchronized (the lockfile root had drifted
  at `0.8.1`).

### Unchanged

- **No dependency changes.** No runtime or development dependency was added,
  removed, or upgraded; the lockfile diff is root version metadata only.
- **No data model or backend change.** Storage keys `project-board-v1` and
  `project-board-activity-v1` keep their existing schemas. No migration, no
  cloud, auth, telemetry, or backend functionality, and no GitHub Pages strategy
  change.
- Desktop Board layout, drag-to-change-status, and the Board's intentional
  internal horizontal scroll behavior.

## 0.8.2 — Deployment (2026-07-30)

### Changed

- **Canonical GitHub Pages strategy.** Publishing is now a manual branch update:
  run `npm run build:pages`, then publish the **contents of `dist/`** to the
  **root of the `gh-pages` branch**. Vite copies tracked `public/.nojekyll` to
  `dist/.nojekyll`, so publishing the full contents of `dist/` places it at that
  root and prevents Jekyll from stripping asset paths.
- **Documented SPA fallback behavior.** `dist/404.html` is a copy of
  `index.html` and serves as the SPA fallback. Under legacy GitHub Pages, a
  direct link to a client-side route returns an **HTTP 404 status** while the
  fallback app body is served, so the app still renders the requested view. The
  status code cannot be changed on static Pages hosting.
- Documentation now names `react-router` rather than the removed
  `react-router-dom` compatibility package.

### Removed

- **GitHub Actions Pages workflow.** `.github/workflows/pages.yml` and the
  README/spec claims of an automatic build-and-deploy on every push to `main`
  were removed. There is no CI deploy; the live site updates only when `gh-pages`
  is published manually.

### Unchanged

- No dependency, script, or lockfile changes. This release is documentation and
  release metadata only.
- Storage keys `project-board-v1` and `project-board-activity-v1`.
- No cloud, auth, telemetry, or backend functionality.
- Version chrome shows **v0.8.2**.

## 0.8.1 — Reliability (2026-07-29)

### Fixed

- **Import safety.** `Settings → Import JSON` now validates untrusted files at the
  file/import boundary before anything is previewed or applied. Previously the
  parser trusted the export shape and coerced bad values silently, so a malformed
  or hand-edited backup could land unusable projects on the board.
  Rejected now: non-object roots, unsupported versions, malformed project, step,
  and link shapes, blank or duplicate ids, unknown `status` / `type` / `theme`
  values, invalid dates, and out-of-range `progress_pct` or `idleDays`.
  Date checks validate the calendar, so impossible dates like `2026-02-30` are
  rejected instead of being silently normalized to `2026-03-02`.
- **Bounded inputs.** Documented caps stop oversized files from locking up the
  tab: 5 MB per file, 5000 projects, 500 steps and 500 links per project,
  50 tags or stack entries, plus per-field length limits. The file cap is
  measured in UTF-8 bytes, and a `File` over the cap is rejected by its reported
  size before its contents are read into memory.
- **Clearer errors.** Import failures name the offending field in plain language
  and no longer surface raw `JSON.parse` text or source internals.
- **Router security advisory.** Upgraded `react-router` to 8.3.0, the first
  release outside both known CSRF advisory ranges. `npm audit` now reports
  0 vulnerabilities. See `docs/DEPENDENCY_NOTES.md` for the evidence trail.

### Changed

- Replaced `react-router-dom` with `react-router`; the compatibility package was
  removed upstream in v8. No routing behavior changes in this app.
- Updated dev-only `postcss` to 8.5.25 via non-forced `npm audit fix`.

### Added

- `npm test` runs a dependency-free `node:test` suite (45 cases) over the import
  boundary and the router advisory guard.
- Tracked `.github/workflows/pages.yml` as an intentional source file. (That
  workflow was later removed in 0.8.2 in favor of manual `gh-pages` publishing.)

### Unchanged

- Valid v1 exports still import, including additive migration of missing
  `starred` and `started_at`.
- Storage keys `project-board-v1` and `project-board-activity-v1`.
- No cloud, auth, telemetry, or backend functionality.

## 0.8.0 — Steady

- Weekly review at `/review`, board keyboard navigation, Settings hygiene tools,
  step bulk actions, and import preview before apply.

## 0.7.0 — Discipline

- Drag-reorder steps, focus this week, backup nudge, duplicate project, and
  safe link chips.

## 0.6.0 — Real inventory

- Realistic seed inventory, dated export filenames, and version chrome.

## 0.5.0 — Focus

- Collapsible filters, star/pin, due soon strip, soft archive with undo, and
  quick-add step.

## 0.4.1 — Mobile

- Bottom tab bar under 768px and narrow-screen filter layout.

## 0.4.0 — Polish

- Markdown notes preview, keyboard shortcuts, weekly snapshot, activity log,
  onboarding, theming, and PWA lite.

## 0.1.0 — 0.3.0

- Initial MVP through daily driver: project inventory, steps, notes, deadlines,
  stats, board columns, local persistence, and export/import.
