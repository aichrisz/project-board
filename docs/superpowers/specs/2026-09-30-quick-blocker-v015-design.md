# Project Board v0.15 — Quick blocker updates

## Approved direction

Add a small blocker editor to existing Dashboard project cards and fix CLI preview ownership for cross-project duplicate step ids. Reuse existing notes, signal parsing, workspace synchronization, styling, and tests. No dependencies, schema migration, new route, reminder, or AI feature.

## Card interaction

- Show the current blocker as text in the card signals, using `getBlocker`.
- A Blocker button opens one labeled single-line input prefilled with the current blocker and Save / Cancel / Clear actions. Do not show the step-add editor simultaneously.
- Save trims input, rejects blank input, embedded line breaks and reserved clear sentinel `none`/`none.` (case-insensitive), and applies the existing CLI blocker text bound. Invalid text leaves the editor open with an accessible error.
- Save appends `Blocker: <text>` to the latest project notes, preserving all older notes. Saving the unchanged current blocker does nothing.
- Clear is available only for a current blocker and appends `Blocker: none`; it never deletes historical notes or changes project status.
- Cancel and Escape discard the draft without writes. Focus enters the input on open and returns to the opener on close. Enter submits. Buttons remain at least 44px and wrap without overflow at 320px and 390px.
- Save/Clear produce one factual project-updated activity event. Resolve the project against current store state when mutating, rather than writing notes captured when the editor opened.
- Reuse the current workspace API/cache and ETag conflict behavior. Never overwrite/retry a conflict automatically. Existing sync errors remain visible; do not imply server persistence before acknowledgment.

## CLI preview fix

For `complete-step`, resolve preview project ownership from the explicit project target, not the first project containing the returned step id. Preserve mutation behavior, terminal-safe text, raw JSON, and existing command aliases. Regression fixture includes two projects sharing a step id and targets the second: text identifies that project, JSON represents the correct simulated update, and dry-run sends zero PUTs with unchanged workspace and ETag.

## Verification and release

Use existing test tooling: focused regression checks for append-only blocker semantics, invalid/unchanged input, clear sentinel, editor lifecycle, and duplicate-step preview ownership. Run existing frontend/server/CLI suites, lint, builds, deploy checks, audit, and diff checks. Verify populated cards and input interactions in local Chromium at 320px, 390px, and desktop. Review spec then quality/security before release. Synchronize v0.15.0 metadata/docs only for the completed application release; retain workspace schema version 1. Follow existing consistent backup, atomic deployment, production readback, encrypted offsite backup, and verified push procedure.

## Scope exclusions

No next-action completion shortcut in this release, no Board card redesign, no automatic status changes, no bulk blocker edits, no new persistence fields. Implementation lane: Codex via 9Router code-lane at https://9r.aichrisz.com/v1, with no credentials copied into files or outputs.
