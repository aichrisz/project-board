# Project Board v0.13.0 Automation CLI Design

**Date:** 2026-09-22  
**Status:** Approved for planning

## Goal

Let Kei/Hermes maintain factual Project Board milestones, blockers, and next actions through the existing conflict-safe API instead of direct SQLite access or ad hoc whole-workspace scripts.

## CLI Surface

Extend `scripts/project-board.mjs` with four commands:

- `set-blocker PROJECT_ID TEXT`
- `clear-blocker PROJECT_ID`
- `add-milestone PROJECT_ID TEXT`
- `set-next PROJECT_ID TEXT`

All commands use the existing explicit owner configuration, loopback default URL, GET → deterministic local mutation → conditional PUT flow, and bounded error handling.

### `set-blocker`

Append `Blocker: TEXT` to `notes_md`. The newest blocker line remains authoritative for the Focus Dashboard. Preserve earlier blocker lines as history. Reject blank text and values above the existing short-text boundary.

### `clear-blocker`

Append `Blocker: none.` to `notes_md`. Update `getBlocker` so normalized sentinel values `none` and `none.` mean no current blocker while older blocker lines remain historical. The Focus Dashboard then renders its existing `No blocker recorded` fallback.

### `add-milestone`

Append `Milestone YYYY-MM-DD: TEXT` to `notes_md`, using the current UTC calendar date. Reject blank or oversized text. Existing notes remain intact.

### `set-next`

Find the first unfinished step using deterministic `order`, then rename only that step. Fail without writing when the project has no unfinished step; the error directs the caller to `add-step`. Recompute project progress and update `updated_at` through the existing mutation path.

## Activity

Add one activity type: `project_updated`.

Each successful command prepends one bounded activity record with project id and plain-language message. Extend all activity allowlists and display-label/icon mappings that validate or render activity. Workspace schema remains version `1`; this is an additive enum extension and older valid records remain unchanged.

Do not reuse misleading activity types such as `import` or `status_changed`.

## Safety and Validation

- Require `--owner` or `PROJECT_BOARD_OWNER` exactly as today.
- Use API only; never read SQLite from the CLI.
- Require the project to exist.
- Keep ids and text within existing server-compatible limits.
- Send `If-Match` from the preceding GET.
- On `412`, print the existing bounded conflict message and exit `2` without retry.
- Do not write when input, project lookup, or unfinished-step checks fail.
- Do not infer progress, blockers, milestones, or next actions from Git history.

## Version and Documentation

Ship as **v0.13.0**. Synchronize package metadata, lockfile, visible `APP_VERSION`, README, changelog, and portable feature spec. Workspace schema remains `1`.

Document command examples using the production owner and default loopback API without credentials or secrets.

## Verification

Use the existing real temporary server/SQLite CLI integration harness. Add RED-first coverage for:

- setting and clearing blockers while preserving history;
- Focus helper treating the clear sentinel as no blocker;
- dated milestone append;
- deterministic next-step rename and no-step rejection;
- exactly one `project_updated` activity per successful mutation;
- invalid/oversized input rejected before PUT;
- stale ETag conflict remains exit code `2` with winner data preserved;
- synchronized v0.13.0 metadata.

Run frontend, server, CLI, lint, build, Pages build, deployment checks, and diff checks. After reviews approve, make a consistent SQLite backup, deploy, smoke all four commands against production with reversible/disposable text on the Project Board project, verify activity/ETag/data count, record the real v0.13.0 milestone, back up offsite, and push `main`.

## Non-Goals

- GitHub-wide automatic synchronization.
- Background daemon, cron scanner, webhook, or repository polling.
- New database columns or workspace schema migration.
- Editing arbitrary historical notes or completed steps.
- Automatic conflict merge or overwrite retry.
- New dependency.
