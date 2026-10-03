# Quick Updates v0.16 Implementation Plan

> **For Hermes:** Use the project-specific bounded coding lane and one combined review; do not spawn overlapping per-task reviewers.

**Goal:** Add trustworthy save feedback, card next-step editing and quick milestone capture.
**Architecture:** Reuse shared ProjectContext snapshots and remote queue; add transient acknowledgment UI only, no server protocol changes. Guard card edits by captured identity/title against current project. Append UTC milestones using the existing notes format.
**Tech Stack:** Existing React/TypeScript, node:test, Playwright harness; Codex via 9Router code-lane with verified reasoning none.

## Task 1: Save acknowledgment
Files: src/store/ProjectContext.tsx, src/components/Layout.tsx, src/lib/remoteWorkspace.test.ts or a focused new save-status test, src/index.css.
1. Trace hydration, cache effects, all save callers and queue callbacks completely.
2. Add smallest failing behavioral check: queue snapshots A and B; acknowledging A must not expose Saved while B remains pending. Failure/conflict dominates success; loading must not claim Saved.
3. Add transient shared status derived from latest local snapshot and acknowledged baseline, guarding older callbacks. Reuse queue mechanics unchanged. Account for initialization, failed hydration, recovery saves and duplicate snapshots.
4. Expose compact role=status copy in Layout; respect existing banners and mobile width. Run focused check.

## Task 2: Safe Next step edit
Files: src/lib/projectSignals.ts plus focused test/helper if needed, src/store/ProjectContext.tsx, src/components/ProjectCard.tsx, src/pages/Dashboard.tsx, existing render tests, src/index.css.
1. Trace getNextAction and every ProjectCard caller; preserve deterministic ordering.
2. Add failing checks for captured step becoming done/deleted/not-next/renamed, valid unchanged no-op and valid edit preserving step properties/progress.
3. Add guarded mutation over projectsRef.current with bounded single-line title; commit once and add one activity. Input signature carries captured step ID and original title.
4. Add mutually exclusive editor using existing blocker focus and CSS pattern. Draft survives rejected save; Escape/Cancel restore live opener; raw multiline paste rejected.
5. Run affected tests only.

## Task 3: Quick milestone
Files: src/store/ProjectContext.tsx, src/pages/ProjectDetail.tsx, minimal existing/new notes helper and tests, src/index.css.
1. Read scripts/project-board.mjs addMilestone and weeklyDigest parser; retain exact UTC prefix.
2. Add failing checks for append preservation, notes cap, blank/long/multiline including Unicode rejection and UTC date.
3. Append to freshest project notes, not captured notes. Shared store commit, exactly one event, no status/progress change.
4. Add native labeled form, Save/Cancel/Escape, focus restoration, inline rejection, clear successful draft. Keep global save acknowledgment authoritative.
5. Run focused checks.

## Task 4: Integrated release candidate
Files: scripts/project-board-persistence.browser.test.mjs or new bounded quick-updates browser harness; package.json, package-lock.json, src/version.ts/test, README.md, CHANGELOG.md, docs/PROJECT_BOARD_FEATURE_SPEC.md.
1. Extend isolated browser harness with held PUT acknowledgment A/B, failures/conflict, next editor success/noop/stale rejection, milestone preserving notes, reload and populated width/focus checks. Preview port 4178 strictPort, no production writes.
2. Bump all metadata to 0.16.0, document features and correct stale digest wording to operationId plus canonical JSON comparison.
3. Parent runs once: npm test, npm run test:server, npm run test:cli, npm run lint, npm run build, npm run build:pages, bash deploy/check.sh, npm audit, git diff --check and bounded browser gate. Record exact counters/output.
4. One read-only combined review of frozen diff, reusing parent evidence. Targeted fix/check only if blocker.
5. Parent commits, service-owned integrity backup, deploy/install.sh, bounded health retry, installed version/listener/Access and read-only inventory smoke. Encrypted offsite backup and restore drill; push main, compare remote SHA. No coding subprocess may deploy/push or read production DB.
