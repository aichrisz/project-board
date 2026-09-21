# Daily Use, Safe Automation, and Recovery Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship mobile-responsive decision aids, conflict-safe workspace writes, a minimal Kei CLI, and verified encrypted OneDrive recovery.

**Architecture:** Reuse existing project steps, timestamps, cards, review page, HTTP API, SQLite document row, backup script, systemd deployment, rclone remote, and restic binary. Add only pure derived UI helpers, an opaque ETag boundary, one local Node CLI, and backup/restore units.

**Tech Stack:** React/TypeScript, Node HTTP, SQLite, CSS, node:test, systemd, restic over rclone.

---

### Task 1: Derived daily-use logic and mobile UI

**Files:**
- Create: `src/lib/projectSignals.ts`
- Create: `src/lib/projectSignals.test.ts`
- Modify: `src/components/ProjectCard.tsx`
- Modify: `src/pages/Review.tsx`
- Modify: relevant existing stylesheet(s)

**Steps:**
1. Write failing tests for ordered first unfinished step; 30/60-day freshness; terminal exclusion; and advisory at 0, 3, and 4 active projects.
2. Run the focused test and verify expected failures.
3. Implement the smallest pure helpers.
4. Render Next action and freshness on dashboard cards, and the advisory on Weekly Review using existing card/panel patterns.
5. Add only CSS needed for wrapping, stacking, 44px actions, and bottom-nav clearance at 320/390px.
6. Run focused and full tests, lint, build; commit `feat: surface project next actions and freshness`.

### Task 2: Optimistic concurrency at the workspace boundary

**Files:**
- Modify: `server/app.mjs`
- Modify: `server/app.test.mjs`
- Modify: `src/lib/remoteWorkspace.ts`
- Modify: `src/store/ProjectContext.tsx`
- Modify: existing remote-workspace/context tests

**Steps:**
1. Write failing real-server tests for GET ETag, creation sentinel, required `If-Match`, matching PUT, stale `412`, owner isolation, and unchanged data after conflict.
2. Run and verify RED.
3. Add SHA-256 ETags and atomic compare/write with the current SQLite transaction pattern; require `If-Match`.
4. Write failing client tests for revision capture and conflict behavior.
5. Update the existing save queue to send and advance ETags; on conflict stop writes and surface reload-required state without overwrite retry.
6. Run server/focused/full tests, lint, build; commit `feat: prevent conflicting workspace writes`.

### Task 3: Minimal local Kei CLI

**Files:**
- Create: `scripts/project-board.mjs`
- Create: `scripts/project-board.test.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Steps:**
1. Write failing integration tests against a temporary real server/database for list, add project, set status, add step, complete step, and stale conflict.
2. Run and verify RED.
3. Implement stdlib argument parsing and GET → mutate → conditional PUT. Default URL is loopback and owner must be explicit/environment-provided; never store credentials.
4. Validate bounded required arguments and exit nonzero on `412`.
5. Run CLI/server/full tests; commit `feat: add conflict-safe project board cli`.

### Task 4: Encrypted OneDrive backup and restore drill

**Files:**
- Create: `deploy/backup-offsite.sh`
- Create: `deploy/restore-drill.sh`
- Create: `deploy/project-board-offsite-backup.service`
- Create: `deploy/project-board-offsite-backup.timer`
- Create: `deploy/project-board-restore-drill.service`
- Create: `deploy/project-board-restore-drill.timer`
- Modify: `deploy/install.sh`
- Modify: `deploy/check.sh`
- Modify: `README.md`

**Steps:**
1. Verify `onedrive:` access and complete tiny upload/readback/hash/delete transport proof.
2. Add shell self-check/dry-run tests first for missing secret, unsafe remote, validated SQLite snapshot selection, and cleanup behavior; verify RED.
3. Implement flocked local SQLite backup → integrity check → restic snapshot via rclone → retention (`7 daily, 5 weekly, 12 monthly`) → repository check.
4. Implement monthly temporary restore, SQLite integrity/owner/project-count assertions, and cleanup.
5. Install mode-0600 environment material without printing values; recovery key remains off remote.
6. Install/enable units, run first real snapshot, repository check, and real restore drill.
7. Commit `ops: add encrypted offsite project board backups`.

### Task 5: Responsive, integration, deployment, and production verification

**Files:**
- Modify only files required by verified defects.

**Steps:**
1. Build and serve the production app with deterministic data.
2. Verify Dashboard and Review at 320×700, 390×844, 768px, and desktop: no overflow, clipping, or bottom-nav overlap; controls ≥44px; light/dark smoke; no console/request errors.
3. Run full frontend tests, server tests, CLI tests, lint, build, `git diff --check`, and `bash deploy/check.sh`.
4. Perform two-client stale-write test against disposable SQLite.
5. Create pre-deploy production backup; run `deploy/install.sh`; verify service/tunnel/timer state, loopback health, public Access redirect, 31-project readback, restart persistence, and live SQLite integrity.
6. Run offsite snapshot/check/restore drill and verify no test artifacts remain.
7. Conduct independent spec and quality reviews; fix all critical/important findings and rerun gates.
8. Push verified `main`; verify remote HEAD equals deployed HEAD; commit any final fixes.
