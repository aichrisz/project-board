# Implementation Plan — Project Board v0.3 “Daily driver”

**Base:** v0.2.0 · **PRD:** docs/PRD.md P2 subset  
**Implementer:** Grok Build CLI · Verify: Roxy light

## Goal
Make Project Board a **daily-driver**: activity visibility, welcoming empty/onboarding states, dark/light theme, sharper filters/search (URL state), and light PWA install/offline shell. Bump to **0.3.0**.

## Must ship

### 1. Activity log (light)
- Store last N events (e.g. 100) in localStorage blob: `{ id, at, type, projectId?, message }`
- Emit on: create/update status/toggle step/delete-or-archive/import/seed
- UI: **Activity** page or drawer + short “Recent” strip on Dashboard
- English messages only

### 2. Onboarding + empty states
- First visit (no projects): welcome card — Seed sample data / Create project / Skip
- Empty filter results: clear filters CTA
- Empty board column already exists — keep consistent copy

### 3. Dark / light theme
- CSS variables for both; default follow `prefers-color-scheme` or dark
- Toggle in header + Settings; persist in settings (`theme: 'dark'|'light'|'system'`)

### 4. Filter / search polish
- Tag filter chips (from union of project tags)
- “Clear filters” control
- Optional URL query sync: `?status=&type=&q=&showCompleted=&sort=&dir=` (shareable/bookmarkable)
- Keep Show completed behavior

### 5. PWA lite
- `manifest.webmanifest` (name **Project Board**, theme colors)
- Minimal service worker: cache shell (index + assets) for offline open of last build
- Register SW only in production build
- Icons: simple SVG/PNG in `public/`

### 6. Hygiene
- `package.json` version **0.3.0**
- README: Activity, theme, PWA, URL filters
- Keep `allowedHosts: true`
- English UI; product name **Project Board**; no personal names
- `npm run build` green

## Out of scope
Multi-board, cloud sync, i18n, full markdown renderer, backend

## Verify checklist
- [ ] Build exit 0
- [ ] Theme toggle persists
- [ ] Activity entries appear after status/step change
- [ ] First-load empty onboarding when storage cleared
- [ ] URL query updates filters
- [ ] Manifest linked; SW registers on preview/prod
