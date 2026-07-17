# Implementation Plan — Project Board v0.2

**Base:** v0.1 MVP (shipped)  
**PRD:** docs/PRD.md v0.2 P1 items  
**Implementer:** Grok Build CLI · Verify: Roxy light

## Goal
Add **Board (kanban) view** by status + polish P1 remaining: reliable sort, health badges visible, seed/export already present but ensure UX polish. Bump version to **0.2.0**.

## Must ship
1. **Board page/view** (`/board` or toggle Dashboard | Board)
   - Columns: Idea · Planned · In progress · Paused · (+ Done/Archived only if Show completed)
   - Cards in columns (reuse ProjectCard compact or BoardCard)
   - Click card → project detail
   - Empty column state
   - Responsive: horizontal scroll columns on mobile; multi-column desktop
2. **Optional v0.2 stretch:** drag-and-drop status change between columns (if clean with HTML5 DnD or light lib; skip if unstable)
3. **Sort** controls on Dashboard: updated | deadline | progress | title (asc/desc)
4. **Health badges** clearly on cards (idle / at risk / overdue)
5. Settings/README note for Board view
6. English only; product name **Project Board**; no personal names
7. `npm run build` green
8. Keep `preview.allowedHosts: true` (tunnel fix)

## Out of scope
- Multi-user, backend, PWA, i18n, themes matrix

## Files likely touch
- `src/App.tsx` routes
- `src/pages/Board.tsx` (new)
- `src/components/Layout.tsx` nav: Board
- `src/components/BoardColumn.tsx` / `BoardCard.tsx` optional
- `src/pages/Dashboard.tsx` sort UI
- `package.json` version 0.2.0
- `README.md`

## Verify
- Build exit 0
- Board shows columns; hide completed still applies
- Nav Board ↔ Dashboard works
- Sort changes order
