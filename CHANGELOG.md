# Changelog

All notable changes to Project Board. Local-first single-user app; dates are UTC.

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
