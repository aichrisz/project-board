# Project Board v0.5 “Focus”

Base: 0.4.1. Grok Build implement.

## Ship
1. **Collapsible filters** — Dashboard filters panel; mobile default collapsed (“Filters” toggle + active count badge); desktop can stay open or remember preference in settings/localStorage.
2. **Starred / pin** — `starred?: boolean` on project (or settings.starredIds); star control on card + detail; starred sort to top (before other sort) when not filtered away.
3. **Due soon strip** — Dashboard strip: projects with deadline in next 7 days OR overdue (exclude done/archived unless show completed); tap → detail.
4. **Soft archive + undo** — Archive action → status archived; toast “Archived — Undo” ~5s restores previous status; prefer soft archive over hard delete default (keep delete in detail with confirm).
5. **Quick add step** — On project card: compact “+ step” adds step without full detail navigation (optional expand inline).
6. Version **0.5.0**, README, EN, Project Board brand, allowedHosts, build green. Migrate storage schema safely (default starred false).

## Out
Cloud, i18n, multi-board, heavy deps.

## Verify
build 0; star persists; filters collapse mobile; due strip logic; undo archive; no mobile nav regression.
