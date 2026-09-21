# Project Board Daily Use, Safe Automation, and Recovery Design

## Goal

Make Project Board useful as a daily decision surface, let Kei update it without lost writes, and add encrypted off-VPS recovery while preserving the existing small React/SQLite architecture.

## Scope and sequence

The work ships as three independently verified phases:

1. Daily usefulness: Next action, active-project advisory, and freshness signals.
2. Safe Kei automation: optimistic concurrency plus a local mutation CLI.
3. Recovery: encrypted restic snapshots copied to the existing OneDrive remote.

GitHub synchronization, schema expansion, automatic status changes, punitive warnings, and additional frontend dependencies are out of scope.

## Phase 1: Daily usefulness

### Next action

The existing ordered `steps` array remains the source of truth. A shared pure selector returns the first unfinished step sorted by `order`. Dashboard project cards display it as `Next action`; projects without an unfinished step show no additional row. The selector is reused wherever another compact surface needs the same answer rather than storing duplicate state.

### Active-project advisory

Weekly Review counts projects with `status === "in_progress"`.

- Zero to three: neutral copy showing the current count and the ideal ceiling.
- More than three: supportive suggestion to continue, pause, or finish one project.
- No blocking, confirmation dialog, red warning, score, or automatic mutation.

The number three is a presentation rule, not a database constraint.

### Freshness

Freshness derives from `updated_at` and never changes project status.

- Less than 30 days: no freshness label.
- 30–59 days: `Quiet`.
- 60 days or more: `Review`.
- Done and archived projects are excluded from freshness prompting.

Freshness uses calendar elapsed time through a pure helper with an injectable `now`, so tests are deterministic. Existing overdue/idle health remains intact.

### Mobile behavior

The existing mobile bottom navigation and card hierarchy remain unchanged. At 390px and 320px:

- Next action wraps naturally and cannot create horizontal overflow.
- The freshness label remains secondary and never crowds the primary card action.
- Weekly advisory stacks vertically and uses existing panel/button patterns.
- Interactive controls remain at least 44px; informational labels are not made focusable.
- Fixed bottom navigation does not cover the final card or review content.
- Dark/light themes, reduced motion, forced colors, and print styles remain usable.

## Phase 2: Safe Kei/Hermes integration

### Revision contract

The server derives an opaque ETag from the exact stored workspace JSON. `GET /api/workspace` returns the ETag when a workspace exists. A missing workspace returns `204` with a creation revision sentinel.

`PUT /api/workspace` requires `If-Match`:

- Matching current ETag: validate and save, return `204` with the new ETag.
- Matching creation sentinel when no row exists: create the workspace.
- Missing header: `428 Precondition Required`.
- Stale or incorrect revision: `412 Precondition Failed` without writing.

Comparison and write occur within one SQLite transaction so the check and mutation are atomic.

### Browser behavior

Remote hydration captures the received ETag. The serialized save queue sends `If-Match` and advances its local revision only from successful responses. On `412`, automatic saving stops and the UI shows a calm reload-required message; it never retries by overwriting newer data.

Existing localStorage remains an offline cache, not an authority over a conflicting remote workspace.

### Kei CLI

A dependency-free Node CLI runs only on the VPS and talks to `127.0.0.1:8780` with the authorized owner header. Initial commands are deliberately narrow:

- list or inspect projects;
- add a project;
- update project status;
- add a step;
- mark a step complete.

Each mutation performs GET → deterministic local change → conditional PUT. A conflict exits nonzero and prints a bounded message. The CLI never edits SQLite directly, stores no credentials, and does not perform GitHub synchronization. Inputs pass through the same workspace validation boundary as the browser.

## Phase 3: Encrypted OneDrive recovery

The already configured `onedrive:` rclone remote is reused. Restic is already installed.

### Backup flow

1. Trigger the existing SQLite backup API and integrity-check its output.
2. Back up the validated snapshot—not the live DB, WAL, or SHM—to an encrypted restic repository transported through rclone.
3. Run `restic check` after the first snapshot and periodically thereafter.
4. Apply bounded retention: seven daily, five weekly, and twelve monthly snapshots.
5. Keep the current short local backup retention for fast recovery.

The job uses `copy`/restic semantics, never `rclone sync`, so local deletion does not propagate as remote deletion. Secrets, raw sessions, logs, caches, and browser profiles remain excluded.

The restic password and rclone configuration stay mode `0600`. Recovery material in OneDrive must not include the decrypting owner-held private key.

### Scheduling and failure behavior

A systemd oneshot and timer run after the existing local backup window. Successful runs remain silent; failures are surfaced through the existing operations channel/log monitoring. Concurrent runs are prevented by systemd and a lock. A failed upload leaves the local validated backup intact.

### Restore drill

A monthly job restores one real database snapshot into a temporary directory, runs `PRAGMA integrity_check`, verifies the authorized workspace and project count, then removes the temporary restore. The first restore drill is executed before completion is claimed.

## Testing and verification

### Automated

- RED→GREEN unit tests for next-action ordering, freshness thresholds, terminal-status exclusion, and active advisory copy/state.
- Component tests for compact card and Review rendering.
- Server tests for ETag creation, matching update, missing precondition, stale conflict, owner isolation, and no-write-on-conflict.
- CLI tests using a temporary real server and SQLite database.
- Existing frontend and server suites, TypeScript, lint, and production build.

### Visual and responsive

Use the production build with deterministic workspace data. Verify Dashboard and Weekly Review at 320×700, 390×844, 768px, and desktop width in dark and light themes. Record:

- viewport width equals document scroll width;
- no card bleed or clipped copy;
- bottom-nav clearance;
- 44px interactive targets;
- readable Next action, freshness, and advisory hierarchy;
- no console errors or failed same-origin requests.

### Deployment and recovery

- Back up production before installation.
- Deploy through the existing systemd installer.
- Verify service, tunnel, Access redirect, workspace persistence, and conflict behavior.
- Initialize the restic repository only after transport and test round-trip succeed.
- Run a real snapshot, check, restore, SQLite integrity check, and workspace readback.
- Push verified commits to `main` and record the deployed commit.

## Acceptance criteria

- Dashboard shows one accurate Next action without schema changes.
- Weekly Review gives a no-shame advisory around the three-active ideal and never blocks.
- Freshness is derived, non-punitive, and does not mutate status.
- Dashboard and Review pass exact mobile viewport checks without overflow or bottom-nav overlap.
- Concurrent browser/Kei writes cannot silently overwrite each other.
- Kei can perform the five scoped local mutations through the validated API.
- A production SQLite snapshot exists in encrypted OneDrive storage and passes a real restore drill.
- All existing and new tests pass; production runtime and persistent data are verified after restart.
