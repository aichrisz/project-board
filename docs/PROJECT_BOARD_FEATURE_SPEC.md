# Project Board — Product Feature Spec (for external AI)

**Document type:** Portable product specification  
**Audience:** Any AI or engineer implementing, reviewing, or extending the app  
**Product name:** Project Board  
**Current version:** 0.8.0 (“Steady”)  
**Last updated:** 2026-07-15  

This document is **self-contained**. It describes *what the product is* and *what features exist*. It does **not** depend on a specific host, owner name, or agent toolchain.

---

## 1. One-line summary

**Project Board** is a **local-first, single-user** web app for tracking personal side projects: status, progress steps, notes, deadlines, tags, links, and light analytics — inspired by Focalboard/Taskcafe, scoped down (not multiplayer Jira).

---

## 2. Product principles (non-negotiable unless PRD reopened)

| Principle | Meaning |
|-----------|---------|
| Local-first | Primary store is browser `localStorage` (key: `project-board-v1`) |
| Single-user | No auth, no multiplayer, no real-time collab |
| Generic branding | UI product name is **Project Board** only (no personal name in chrome) |
| UI language | **English only** (v1) |
| Completed items | `done` / `archived` are **hidden by default**; reveal via “Show completed” |
| Responsive | Mobile + desktop first-class |
| Lightweight | Prefer zero heavy chart/DnD libraries; CSS + small React surface |
| Privacy | No telemetry; no secrets in repo |
| Export safety net | JSON export/import so clearing storage is recoverable |

**Explicitly out of scope (unless product decisions change):**  
cloud sync, login, multi-board workspaces, GitHub Issues sync, i18n, multi-user permissions, backend API.

---

## 3. Tech stack

| Layer | Choice |
|-------|--------|
| Build | Vite |
| UI | React 19 + TypeScript |
| Routing | react-router-dom |
| Lint | oxlint (optional in CI) |
| Persist | `localStorage` blob version `1` |
| PWA | Lite: web manifest + minimal service worker (production) |
| Deploy | Static preview; optional tunnel for temporary public URL |

**Typical local commands:**

```bash
npm install
npm run dev          # development
npm run build        # tsc -b && vite build
npm run preview      # serve dist (e.g. port 8780)
```

---

## 4. Domain model

### 4.1 Project

| Field | Type / notes |
|-------|----------------|
| `id` | Stable string id |
| `title`, `slug` | Display + URL-friendly slug |
| `type` | `game` \| `web` \| `tool` \| `learning` \| `infra` \| `other` |
| `status` | `idea` \| `planned` \| `in_progress` \| `paused` \| `done` \| `archived` |
| `summary` | Short text |
| `progress_pct` | 0–100; usually derived from steps |
| `steps[]` | Checklist milestones |
| `notes_md` | Markdown (safe subset on render) |
| `links[]` | `{ id, label, url }` |
| `tags[]`, `stack[]` | String arrays |
| `deadline` | `YYYY-MM-DD` or null |
| `created_at`, `updated_at` | ISO timestamps |
| `started_at` | Optional; set when status becomes `in_progress` |
| `starred` | Boolean pin (default false) |

### 4.2 Step

| Field | Notes |
|-------|--------|
| `id`, `title` | |
| `done` | boolean |
| `order` | Integer 1…n (reorderable) |

### 4.3 Settings (`AppSettings`)

| Field | Notes |
|-------|--------|
| `showCompleted` | Reveal done/archived |
| `idleDays` | Threshold for “Idle” health badge (default 14) |
| `theme` | `dark` \| `light` \| `system` |
| `lastExportAt` | ISO string or null — set on successful export |

### 4.4 Activity event

Capped log (~100): project created/deleted, status change, step toggle, import, seed, reset, etc.

### 4.5 Storage blob

```json
{
  "version": 1,
  "projects": [ /* Project[] */ ],
  "settings": { /* AppSettings */ }
}
```

Activity may be stored separately or alongside depending on implementation; projects + settings are the canonical export payload.

---

## 5. Routes / views

| Route | Purpose |
|-------|---------|
| `/` | **Dashboard** — KPI, filters, cards, due-soon, recent activity, focus mode |
| `/board` | **Kanban** — columns by status; drag card to change status |
| `/activity` | Full activity log |
| `/project/:id` | Project detail (steps, notes, links, edit, archive, duplicate) |
| `/new` | Create project |
| `/settings` | Theme, display, backup, seed, snapshot |

**Mobile (< ~768px):** bottom tab bar (e.g. Home / Board / Activity / More).

---

## 6. Feature inventory by version

Use this as a capability checklist. Versions are incremental; **current ship = all rows through 0.7**.

### 6.1 v0.1 — MVP

- Create / edit / delete projects  
- Types & statuses as above  
- Steps checklist with progress  
- Notes field  
- Tags, stack, deadline  
- Dashboard card grid  
- Stats by type/status  
- Hide completed by default  
- Persist to `localStorage`  
- Responsive English UI  

### 6.2 v0.2 — Board

- `/board` kanban columns by status  
- Drag-and-drop card → update status  
- Sort: updated, deadline, progress, title (+ direction)  
- Health badges: overdue, at-risk, idle  
- Export / import JSON  
- Seed data loader (merge/replace patterns)  

### 6.3 v0.3 — Daily driver

- Activity log + recent strip on dashboard  
- First-visit onboarding / empty states (no forced auto-seed)  
- Theme: dark / light / system  
- Filter polish: status, type, search, tag chips, clear all  
- Filters reflected in **URL query** (shareable/bookmarkable)  
- PWA lite (manifest, icons, minimal SW in production)  

### 6.4 v0.4 — Polish

- Safe markdown preview for notes (`**bold**`, `*italic*`, `` `code` ``, lists, links)  
- Keyboard shortcuts (examples): `n` new, `/` search, `b` board, `d` dashboard, `a` activity, `?` help (ignored while typing)  
- Weekly snapshot: printable share card (KPIs + active titles)  

### 6.4.1 — Mobile

- Bottom navigation tabs  
- Touch targets ≥ 44px  
- Filters stack full-width on narrow screens  

### 6.5 v0.5 — Focus UX

- Collapsible filter panel (mobile collapsed by default; active-count badge)  
- **Star / pin**; starred sort to top  
- **Due soon** strip: deadline within 7 days or overdue (respects show-completed)  
- Soft archive + ~5s undo toast  
- Quick-add step on cards without opening detail  

### 6.6 v0.6 — Real inventory

- High-quality **seed inventory** of realistic example projects (template for first load)  
- Onboarding/Settings CTA: **Load realistic inventory** (merge or replace)  
- Export filename pattern: `project-board-YYYY-MM-DD.json` (UTC date)  
- App version shown in UI chrome/footer (semver constant)  

### 6.7 v0.7 — Discipline

1. **Reorder steps** — HTML5 drag handle + Up/Down buttons; persist contiguous `order` 1…n  
2. **Focus this week** — chip filters projects that are **starred OR due ≤7d/overdue OR `in_progress`**; URL e.g. `?focus=1`; empty-state copy when none  
3. **Backup nudge** — `lastExportAt` on export; Settings shows last export; dashboard soft banner if never or older than 7 days (session-only dismiss)  
4. **Duplicate project** — clone as new id; title suffix ` (copy)`; status `idea`; steps cloned with `done: false`; `starred: false`  
5. **Link chips** — http(s) open with `rel="noopener noreferrer"`; non-http path-like → copy only; block dangerous schemes; up to 2 chips on dashboard cards  

### 6.8 v0.8 — Steady (current)

1. **Weekly review** — route `/review`; KPI strip; sections overdue / due soon / stale in_progress / no steps; rule-based suggested actions; soft-archive idle bulk; snapshot + export; shortcut `r`  
2. **Board keyboard a11y** — focusable cards; ←→ (or h/l) change status; ↑↓ (or k/j) move focus; Enter/Space open detail; aria-live; ignore keys while typing  
3. **Hygiene tools** (Settings) — counts (no steps, idle, overdue, empty tags); soft-archive idle; no-steps links; copy hygiene report  
4. **Step bulk** — mark all done / clear all done / remove completed steps (confirm); one activity event per bulk action  
5. **Import preview** — parse first; show counts, overlapping ids, sample titles; Cancel / Replace all / Merge by id  

---

## 7. Cross-cutting behaviors

### 7.1 Filtering & sorting (Dashboard)

Typical dimensions:

- Status: all active / single status / show completed  
- Type  
- Free-text search  
- Tag  
- Sort key + direction  
- Focus this week (v0.7)  

URL query should stay in sync where implemented (`filtersUrl` helpers).

### 7.2 Health signals

Examples:

- **Overdue** — deadline in the past, project not terminal  
- **Idle** — `in_progress` (or similar) without update beyond `idleDays`  
- **At risk** — approaching deadline with low progress (implementation-defined)  

### 7.3 Links safety

- Prefer `http:` / `https:` for open-in-new-tab  
- Reject or refuse to navigate `javascript:`, `data:`, etc.  
- Local path-like strings: show as copyable, not navigable  

### 7.4 Seed vs empty board

- First visit may show **onboarding** with empty board  
- User explicitly loads seed (merge or replace) or creates projects  
- Replace overwrites project list; merge skips existing ids  

---

## 8. UX references (scoped)

| Borrow from Focalboard / Taskcafe | Do not copy into v1 |
|-----------------------------------|---------------------|
| Card + board mental model | Multi-board workspaces |
| Status columns / properties | Multi-user realtime |
| Visual “where is work?” | Complex permissions / server |

---

## 9. Suggested architecture map

```text
src/
  pages/          Dashboard, Board, Activity, ProjectDetail, Settings, NewProject
  components/     Layout, ProjectCard, Board*, Filters, StepList, LinkChips, …
  store/          ProjectContext (CRUD, steps, seed, export, theme, activity)
  lib/            stats, health, sort, export, filtersUrl, focus, links, storage, …
  data/           seed.ts
  types.ts
  version.ts      APP_VERSION semver for chrome
```

**Implementers:** extend this structure; avoid greenfield rewrite unless requested.

---

## 10. Acceptance / verify checklist (current product)

An implementation is “feature-complete for 0.7” if:

- [ ] `npm run build` succeeds  
- [ ] Create/edit/delete project works and survives reload  
- [ ] Steps toggle updates progress; reorder persists  
- [ ] Board DnD changes status  
- [ ] Hide completed works; show completed reveals done/archived  
- [ ] Theme persists  
- [ ] Export writes dated JSON and sets `lastExportAt`  
- [ ] Import restores projects + settings  
- [ ] Focus chip + URL work  
- [ ] Duplicate creates idea copy with unchecked steps  
- [ ] Link chips safe for http(s) / path-like  
- [ ] Footer/chrome shows **v0.8.0**  
- [ ] `/review` weekly review works  
- [ ] Board keyboard status/focus works  
- [ ] Import preview before apply  
- [ ] No personal name required in product UI chrome  
- [ ] Storage key remains `project-board-v1` (settings fields migrate additively)  

---

## 11. Roadmap hints (not committed)

Possible later themes (only if product owner approves a plan):

- Stronger a11y on kanban (keyboard move columns)  
- Portfolio / screenshot mode  
- Optional static deploy  
- Still **not** default: cloud multi-user, multi-board, i18n  

---

## 12. How another AI should use this file

1. Treat **§2 principles** as hard constraints.  
2. Treat **§6** as the feature backlog already shipped (do not re-propose v0.1–v0.5 as “new” unless fixing bugs).  
3. For new work: propose **v0.8+ plan** against gaps only; keep local-first.  
4. Prefer small, versioned increments with verify via `npm run build` + manual smoke of routes above.  
5. Keep UI English and product name **Project Board**.  

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| Terminal status | `done` or `archived` |
| Active statuses | idea, planned, in_progress, paused |
| Soft archive | Set status archived with short undo window |
| Realistic inventory seed | Built-in template projects for demo/bootstrap |
| Focus this week | Filter: starred ∪ due-soon/overdue ∪ in_progress |

---

*End of portable spec. Safe to paste into another AI chat as the single source of product truth for Project Board v0.7.*
