# Project Board v0.12.0 Focus Dashboard Design

**Date:** 2026-09-22  
**Status:** Approved for planning

## Goal

Make the Dashboard immediately answer four questions without opening individual projects:

1. Which projects are active?
2. What is the next concrete action for each one?
3. What currently blocks each one?
4. How fresh is each project's activity?

The current advisory target remains three active projects. This release surfaces the existing workspace state; it does not add automatic status changes or a hard active-project limit.

## Scope

Add a compact Focus section at the top of the existing Dashboard. It shows projects whose status is `in_progress`, ordered by the same deterministic updated-date ordering already used by the Dashboard, capped visually at three cards. If more than three exist, show the first three plus a link to Review where the existing advisory explains the excess.

Each focus card contains:

- project title;
- first unfinished step, using the existing `getNextAction` helper;
- blocker text extracted from the latest `Blocker:` line in `notes_md`;
- freshness from the existing `getFreshness` helper;
- a link to the existing project detail route.

If no blocker line exists, show `No blocker recorded`. If no unfinished step exists, show `No next action recorded`. If there are no active projects, show a small empty state linking to the Board rather than hiding the section.

## Data and Architecture

No database, API, import/export, or workspace-schema change is required.

Add one small pure helper alongside the existing project-signal helpers to read the latest non-empty `Blocker:` line from `notes_md`. It must:

- match the label case-insensitively at the start of a line;
- trim whitespace;
- ignore an empty blocker value;
- return no blocker rather than inventing one.

The Dashboard derives the focus list with `useMemo`. A small presentational component renders the section and cards. Existing project links, signal helpers, colors, spacing tokens, and accessibility patterns are reused.

## Responsive and Accessibility Requirements

- 320 px and 390 px: one card per row, no horizontal overflow.
- Tablet and desktop: up to three equal-width cards in one grid row.
- Each project card has one clear accessible link target with a minimum 44 px target size.
- Signal labels are text, not color-only.
- Heading structure starts with a named `Focus` section under the Dashboard page title.
- Empty and overflow states remain keyboard accessible.

## Version and Release Metadata

Ship this feature as **v0.12.0**. Synchronize:

- `package.json`;
- root package metadata in `package-lock.json`;
- `src/version.ts` for visible footer chrome;
- README current-version references;
- `CHANGELOG.md` with the Focus Dashboard, persistent authenticated workspace, optimistic concurrency, CLI, and encrypted recovery work shipped since v0.11.0;
- portable feature spec current-version references where they describe the shipped release.

Workspace schema version remains `1`; application semver and stored-data schema version are intentionally independent.

## Error and Edge Cases

- More than three active projects: render three and link to Review; do not silently imply there are only three.
- Invalid `updated_at`: reuse current freshness behavior and show no false freshness warning.
- Notes containing multiple blocker lines: use the latest non-empty line.
- Missing steps or notes: render bounded fallback copy.
- Remote hydration or save conflict: existing global loading/error/conflict behavior remains authoritative.

## Verification

Add focused regression coverage for:

- active-project selection and deterministic order;
- three-card cap and overflow state;
- next-action fallback;
- blocker extraction, including multiple, empty, and case-insensitive lines;
- freshness rendering;
- empty-focus rendering;
- synchronized v0.12.0 metadata;
- 320 px and 390 px no-overflow and minimum touch-target checks.

Before release, run frontend, server, CLI, lint, build, deployment checks, and `git diff --check`. Deploy only after review approval, then verify the visible v0.12.0 footer and Focus section against the production workspace.

## Explicit Non-Goals

- Dedicated blocker field or schema migration.
- New `/focus` route or navigation item.
- GitHub-wide automatic synchronization.
- New dependency.
- Automatic pausing, archiving, or reprioritization.
