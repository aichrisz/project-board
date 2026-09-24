# Project Board v0.14.0 Weekly Digest & CLI Dry Run Design

**Date:** 2026-09-25  
**Status:** Approved for specification review

## Goal

Add two small, complementary capabilities:

1. a rule-based Weekly Digest inside the existing Weekly Review page; and
2. a conflict-safe CLI preview mode that validates and simulates mutations without writing them.

Ship both as **v0.14.0** because they add user-visible application and CLI behavior.

## Constraints

- Reuse the current workspace, project signals, Weekly Review route, API, and CLI mutation functions.
- Keep workspace schema at version `1`.
- Add no dependency, route, database column, daemon, cron job, AI summarizer, or external API.
- Preserve owner isolation and the GET → `If-Match` PUT flow for real mutations.
- Do not infer facts beyond persisted projects, notes, steps, timestamps, and activity.
- Preserve the current mobile-first layout and minimum 44px touch targets.

---

## Feature 1: Weekly Digest

### Placement and layout

Render one `WeeklyDigest` panel near the top of `/review`, after the page header and status banner but before the KPI row.

Use the selected **Guided brief** layout:

- **Mobile:** one column.
- **Desktop:** two columns.
- Left side: `Keep moving` and `Needs attention`.
- Right side: `Latest wins`.

The existing KPIs, active-project advisory, actions, suggestions, and review buckets stay below it unchanged.

### Keep moving

Show up to three `in_progress` projects using the existing deterministic focus ordering. Each item contains:

- project title linked to `/project/:id`;
- the existing derived next action;
- the existing blocker result or `No blocker recorded`;
- the existing freshness label when present.

If no project is in progress, show calm copy linking to `/board`. Do not invent a recommended project.

### Needs attention

Derive a single deduplicated list from non-terminal projects that have either:

- an active blocker from the existing `getBlocker`; or
- existing freshness `Quiet` or `Review`.

Order by severity, then deterministically:

1. active blocker plus `Review`;
2. active blocker;
3. `Review`;
4. `Quiet`;
5. newest valid `updated_at` first;
6. project id ascending for ties or invalid dates.

Show at most five items, each linked to its project. A project appears once even when it has both a blocker and freshness signal. When empty, show `Nothing needs attention.`

This is informational only. It does not archive, pause, score, grade, or shame projects.

### Latest wins

Show up to five newest factual wins derived from existing data:

1. canonical note lines matching `Milestone YYYY-MM-DD: TEXT` (case-insensitive `Milestone`, valid calendar date, non-empty text);
2. activity events that unambiguously record a completed step;
3. status-change activity whose message unambiguously ends in `done`.

Normalize each item to `{ key, at, projectId?, text }`, order newest first, then key ascending. Milestones use their stored calendar date at UTC midnight for ordering. Activity uses its existing timestamp. Do not classify generic `project_updated`, blocker changes, imports, resets, or arbitrary notes as wins.

When the same milestone text for the same project/date appears more than once, show it once. When empty, show `No wins recorded yet.`

### Data boundary

Add pure derivation helpers in a focused library module. `WeeklyDigest` receives `projects` and `activity` as props. It does not read storage or mutate context.

Malformed dates or note lines are ignored rather than displayed or repaired. Source arrays and projects must never be mutated.

### Accessibility and responsiveness

- One section heading: `Weekly digest`.
- Three semantic subsections with headings: `Keep moving`, `Needs attention`, `Latest wins`.
- Linked project names have visible keyboard focus.
- Mobile widths 320px and 390px have no horizontal overflow or card bleed.
- Desktop uses the existing Review visual language rather than a new design system.

---

## Feature 2: CLI `--dry-run`

### Interface

Extend the existing global CLI options:

```text
project-board [--url URL] [--owner EMAIL] [--dry-run] [--format text|json] COMMAND
```

Rules:

- `--dry-run` is valid only for mutation commands.
- `--format` is valid only with `--dry-run`.
- Default dry-run format is `text`.
- `--format text` is accepted explicitly.
- `--format json` returns the full simulated workspace envelope.
- Duplicate flags, unknown formats, `--format` without `--dry-run`, and dry-run on `list` or `inspect` fail before any PUT.

The existing mutation aliases remain mutation commands.

### Execution flow

A dry run uses the real current workspace and validation path:

1. parse and validate options;
2. GET the workspace and ETag through the existing API;
3. clone the workspace in memory;
4. execute the existing command mutation against the clone;
5. format a preview;
6. exit successfully without calling PUT.

Real mutations continue to use GET → mutation → conditional PUT with `If-Match`. Dry run never retries, writes SQLite, changes browser state, or creates server activity. Its simulated workspace may contain the activity event the real mutation would produce.

Invalid project ids, input bounds, note limits, missing unfinished steps, and every existing command validation fail exactly as they do for a real mutation, with no PUT.

### Text output

Human-readable output is command-aware and concise. It includes:

- `Dry run — no changes written`;
- target project when applicable;
- one factual before → after summary or added item;
- current ETag.

Examples:

```text
Dry run — no changes written
Project: Kairo Streak Guard
Next action: "Run old check" → "Run mobile QA"
ETag: "abc123"
```

```text
Dry run — no changes written
Project: Kei Observatory
Blocker: none → "Waiting for alert endpoint"
ETag: "abc123"
```

No output may include credentials, headers, cookies, or runtime secrets. User-provided text remains subject to existing limits; CLI errors remain capped.

### JSON output

`--dry-run --format json` prints exactly one JSON object:

```json
{
  "dryRun": true,
  "etag": "\"abc123\"",
  "command": "set-next",
  "result": {},
  "workspace": {}
}
```

- `result` is the existing command result after simulation.
- `workspace` is the full simulated workspace.
- The live server workspace is unchanged.
- Generated ids and timestamps are preview values only and are not promised to match a later real command.

### Conflict semantics

Dry-run cannot produce an `If-Match` conflict because it performs no PUT. Its ETag identifies the revision used for the preview, not a reservation. A later real command must GET again and may produce a different result if the workspace changed.

---

## Version and documentation

Synchronize v0.14.0 in:

- `package.json`;
- root package versions in `package-lock.json`;
- `src/version.ts`;
- version synchronization tests;
- README;
- changelog;
- portable feature spec.

Document that workspace schema remains `1`, Weekly Digest is derived and read-only, and dry-run previews are not reservations.

## Testing

### Weekly Digest

Use RED-first unit and render tests for:

- focus cap and deterministic ordering;
- next action, blocker fallback, and freshness;
- attention deduplication, severity ordering, cap, invalid dates, and no mutation;
- milestone parsing, calendar validation, activity filtering, deduplication, ordering, cap, and malformed input;
- empty states and project links;
- Review integration renders the panel once;
- 320px and 390px computed browser layout has no horizontal overflow.

### CLI

Extend the real temporary API/SQLite integration harness with RED-first tests for:

- default text preview for representative mutations;
- `--format json` envelope and full simulated workspace;
- no PUT and unchanged ETag/workspace for every mutation command family;
- validation parity for missing project, oversized notes/text, and missing next step;
- aliases recognized as mutations;
- dry-run rejection on read commands;
- format validation and duplicate flags;
- no credential/header leakage;
- a subsequent real mutation still uses fresh GET + `If-Match` and conflict handling remains exit code `2`.

## Release gates

Before deployment:

- frontend, server, and CLI tests;
- lint;
- production and Pages builds;
- deployment checks;
- dependency audit;
- diff checks;
- independent spec and quality/security reviews.

Then create a consistent SQLite backup, deploy atomically, verify Weekly Digest at 320px and 390px, production-smoke text and JSON dry runs while proving ETag/workspace unchanged, verify one real mutation still changes ETag safely, update the Project Board milestone, run encrypted offsite backup, and push `main`.

## Non-goals

- AI-generated prose or recommendations.
- Email, Telegram, PDF, scheduled, or push delivery of the digest.
- Persisting digest snapshots.
- A new Digest page or Dashboard duplication.
- Generic object-diff framework.
- Dry-run replay token, reservation, approval workflow, or automatic execution.
- Database or workspace schema migration.
