# Implementation Plan — Project Board v0.1 MVP

**PRD:** `docs/PRD.md` v0.2  
**Date:** 2026-07-11  
**Implementer:** Grok Build CLI  
**Verify:** Roxy (Hermes) light checks only  

## Goal
Ship a usable **Vite + React + TypeScript** SPA: project inventory, steps, notes, deadlines, stats, hide completed by default, English UI, responsive mobile+desktop, local persist + export/import.

## Stack
- Vite 6 + React 18 + TypeScript
- CSS modules or single `index.css` with CSS variables (no heavy UI kit required)
- State: React context + `localStorage` key `project-board-v1`
- Charts: CSS bar stats only
- Path alias `@/` optional

## Repo layout
```
abel-project-dashboard/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  README.md
  docs/PRD.md
  docs/IMPLEMENTATION_PLAN.md
  public/
  src/
    main.tsx
    App.tsx
    index.css
    types.ts
    lib/id.ts
    lib/stats.ts
    lib/health.ts
    lib/storage.ts
    lib/export.ts
    data/seed.ts
    store/ProjectContext.tsx
    components/
      Layout.tsx
      KpiRow.tsx
      Filters.tsx
      StatsPanel.tsx
      ProjectCard.tsx
      ProjectForm.tsx
      StepList.tsx
      EmptyState.tsx
    pages/
      Dashboard.tsx
      ProjectDetail.tsx
      Settings.tsx
```

## Data model (TypeScript)
See PRD §6. Storage blob:
```ts
{ version: 1, projects: Project[], settings: { showCompleted: boolean, idleDays: number } }
```

## MVP features (must ship)
1. Dashboard KPIs + filters + search + card grid
2. Default hide `done`/`archived`; "Show completed" toggle
3. CRUD create/edit (modal or page)
4. Detail: steps toggle, notes textarea, deadline, status, type, links
5. Progress auto from steps when steps.length > 0
6. Stats by type and status
7. Overdue / at_risk / idle badges
8. Export JSON / import JSON
9. Seed button (Lobby Chaos, Orbit Tap, xVELOCITY, Landing, Project Board, Second brain, Portfolio)
10. Responsive EN UI only; product name **Project Board** (no personal name)
11. `npm run build` succeeds; `npm run dev` works

## Out of MVP
- Kanban board view (v0.2)
- Drag cards, PWA, i18n, themes beyond one polished dark theme

## Visual direction
- Dense, clean, Focalboard/Taskcafe-inspired: subtle borders, status color chips, card grid
- Dark theme default (readable on mobile)

## Verification checklist
- [ ] `npm install && npm run build` exit 0
- [ ] Create project, toggle step, progress changes
- [ ] Completed hidden until Show completed
- [ ] Export produces JSON; import restores
- [ ] Layout OK at 390px and 1280px (manual)
- [ ] No personal name in UI chrome

## Execution order for agent
1. Scaffold Vite React-TS
2. Types + storage + seed
3. Store context
4. Dashboard shell + filters + cards
5. Detail + form
6. Stats + badges
7. Export/import + settings
8. Polish CSS responsive
9. README
10. `npm run build` until green
