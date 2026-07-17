# Project Board v0.7 “Discipline”

**Base:** v0.6.0 · **Approved:** Abel 2026-07-14 (ikut saran sensei)  
**Implementer:** Grok Build CLI · **Verify:** Hermes light  
**Skills:** design / implement / check-work · quality bar high

## Goal

Reduce friction and protect data for daily use — **not** scope creep. Local-first, English UI, brand **Project Board**.

## Ship (all five)

### 1. Drag-reorder steps (PRD F15)
- On project detail `StepList`: drag handle (or whole row) to reorder.
- Persist new `order` values (1…n contiguous) via store API `reorderSteps(projectId, orderedIds: string[])`.
- Keyboard-accessible alternative: Up/Down buttons on each step (required for a11y, not optional).
- Touch-friendly: min 44px hit target for handles.
- No external DnD library if HTML5 DnD + buttons suffice; if adding a lib, justify — prefer **zero new deps**.

### 2. Focus this week (view chip)
- Dashboard chip / toggle: **Focus this week**.
- When on: show only projects that are **starred OR due within 7 days OR overdue OR status `in_progress`**, still respect hide-completed (exclude done/archived unless show completed).
- Sync to URL: `?focus=1` (or `focus=week`) via existing filter URL helpers.
- Persist chip state in URL only is OK; optional settings flag not required.
- Empty focus: friendly empty state (“Nothing in focus — star a project or set a deadline”).

### 3. Export / backup nudge + last-export timestamp
- Extend `AppSettings` with `lastExportAt: string | null` (ISO). Migrate safely (`null` default).
- On successful `exportData`, set `lastExportAt = now`.
- Settings Backup panel:
  - Show **Last export:** relative + absolute, or “Never”.
  - If never **or** last export older than **7 days**: show non-blocking banner/nudge “Export a backup so clearing browser storage does not lose your board.”
- Soft reminder on Dashboard (compact) when stale/never — dismissible for session only (sessionStorage), not permanent hide of Settings nudge.
- Keep dated filename `project-board-YYYY-MM-DD.json`.

### 4. Duplicate project
- Store: `duplicateProject(id: string): Project`.
- New id/slug, title suffix ` (copy)`, status default **`idea`** (or keep planned if idea already), steps cloned with **done reset to false** (milestones as checklist for the copy), links/tags/stack/summary/notes copied, `starred: false`, new timestamps.
- Activity: `project_created` message “Duplicated “X” → “X (copy)””.
- UI: Detail header + optional ProjectCard menu/action **Duplicate**.

### 5. Link chips polish
- Shared component `LinkChips` (or polish existing lists):
  - Card (dashboard/board): show up to 2 link chips if links exist (external icon, truncate label).
  - Detail: chips with open-in-new-tab, remove still available.
  - Safe URLs only: allow `http:`, `https:`; for path-like notes keep in notes_md; if user pastes path without scheme, still store but open button disabled with title “Local path — copy only” + copy-to-clipboard.
  - Prefer `rel="noopener noreferrer"` on external links.
- Seed: add real portfolio links where missing; optional github/local path labels in notes (already v0.6).

### 6. Version / docs
- `package.json` + `src/version.ts` → **0.7.0**
- README Features v0.7 section
- `npm run build` green, oxlint no new errors

## Out of scope
Cloud, multi-board, i18n, GitHub Issues sync, multi-user, personal name in chrome, heavy deps.

## Verify checklist
- [ ] Build exit 0
- [ ] Reorder steps persists after reload
- [ ] Keyboard move steps works
- [ ] Focus chip filters correctly + URL
- [ ] Export sets lastExportAt; nudge when never/stale
- [ ] Duplicate creates idea copy with unchecked steps
- [ ] Link chips safe + copy for path-like
- [ ] Footer v0.7.0
- [ ] No personal name in product chrome

## Quality bar
- Mobile: no layout break; handles usable
- No flash of wrong theme
- Activity log not spammy on every micro-drag mid-drag — log once on drop / reorder complete
