# Project Board

A **local-first** personal project inventory dashboard. Track status, progress, steps, notes, deadlines, and simple stats for your side projects — inspired by Focalboard / Taskcafe, scoped down for one person.

- **Product name:** Project Board  
- **Stack:** Vite + React + TypeScript  
- **Version:** 0.8.0  
- **Storage:** browser `localStorage` key `project-board-v1`  
- **UI language:** English  

## Features (v0.8 “Steady”)

- **Weekly review** — `/review` (shortcut `r`): KPI strip, overdue / due soon / stale in progress / no steps, rule-based suggested actions, soft-archive idle bulk, snapshot + export  
- **Board keyboard** — focusable cards; ←→ / h l change status; ↑↓ / k j move focus; Enter/Space open; aria-live status; hint in subtitle  
- **Hygiene tools** — Settings panel: counts (no steps, idle, overdue, empty tags), soft-archive idle, no-steps links, copy plain-text report  
- **Step bulk** — mark all done / clear done / remove completed; one activity event each  
- **Import preview** — parse → modal (counts, sample titles, settings keys); Cancel / Replace all / Merge by id (+ optional apply settings)  
- **Version chrome** — footer shows **v0.8.0**  

## Features (v0.7 “Discipline”)

- **Drag-reorder steps** — HTML5 drag handle on project detail; Up/Down buttons for keyboard a11y; order persists as 1…n  
- **Focus this week** — Dashboard chip filters starred, due within 7 days / overdue, or `in_progress`; URL `?focus=1`  
- **Backup nudge** — `settings.lastExportAt` set on export; Settings shows last export; soft Dashboard banner when never or &gt;7 days (session dismiss)  
- **Duplicate project** — copy as `idea` with steps unchecked; Detail + card actions  
- **Link chips** — safe http(s) open; path-like links copy-only; up to 2 chips on cards  
- **Version chrome** — footer shows **v0.7.0**  

## Features (v0.6 “Real inventory”)

- **Realistic seed** — host inventory template (Project Board, Orbit Tap, Lobby Chaos, xVELOCITY Race, Roxy Landing, Portfolio SPA, Second Brain + Hermes ops, Hotelfach study aids)  
- **Load realistic inventory** — onboarding CTA + Settings merge/replace (seed mirrors projects on this host)  
- **Dated export** — downloads `project-board-YYYY-MM-DD.json`  
- **Version chrome** — footer shows **v0.6.0**  

## Features (v0.5 “Focus”)

- **Collapsible filters** — Dashboard filters panel; collapsed by default on mobile with active-count badge; open/closed preference remembered  
- **Star / pin** — Star on card and detail; starred projects sort to the top  
- **Due soon strip** — Deadlines in the next 7 days or overdue (excludes done/archived unless Show completed)  
- **Soft archive + undo** — Archive from card or detail; toast with Undo for ~5s; hard delete still on detail with confirm  
- **Quick-add step** — Compact “+ step” on project cards without opening detail  

## Features (v0.4.1)

- **Mobile layout** — bottom tab bar (Home / Board / Activity / More) under 768px; top bar is brand + New + actions menu (theme, snapshot, export); no crammed horizontal nav  
- **Filters on narrow screens** — stack full-width; chips wrap; KPI cards use tighter padding; touch targets ≥44px  

## Features (v0.4)

- **Markdown notes preview** — safe subset on project detail (**bold**, *italic*, `code`, lists, links); Edit / Preview toggle  
- **Keyboard shortcuts** — `n` new · `/` search · `b` board · `d` dashboard · `r` review · `a` activity · `?` help (ignored while typing)  
- **Weekly snapshot** — header **Snapshot** or Settings → printable share card (KPIs + active titles)  
- **Dashboard** — KPI row, filters, search, dense project cards  
- **Board** — kanban columns by status (Idea → Archived); drag a card to change status  
- **Activity log** — persisted events; Activity page + Recent strip on Dashboard  
- **Onboarding** — first visit with an empty board offers seed data, create project, or skip  
- **Theme** — dark / light / system; toggle in header and Settings  
- **Filter polish** — status/type/tag chips, Clear filters, URL query sync  
- **PWA lite** — web manifest, install icons, minimal service worker (production)  
- Progress from steps, health badges, export/import JSON, seed data  

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Production build

```bash
npm run build
```

Preview the build:

```bash
npm run preview
```

Service worker registration runs only in production builds (`import.meta.env.PROD`).

## Views

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — cards, filters, sort, stats, recent activity, due soon |
| `/board` | Board — columns by status; drag or keyboard to change status |
| `/review` | Weekly review — KPIs, buckets, suggested actions, hygiene bulk |
| `/activity` | Activity log (last 100 events) |
| `/project/:id` | Project detail |
| `/new` | Create project |
| `/settings` | Theme, hygiene, idle days, export/import preview, seed |

## URL filters (Dashboard)

Bookmark or share a filtered view. Examples:

| Query | Effect |
|-------|--------|
| `/?status=in_progress` | Only in-progress |
| `/?type=game&q=orbit` | Games matching “orbit” |
| `/?showCompleted=1&status=done` | Show completed, Done only |
| `/?tag=portfolio&sort=title&dir=asc` | Tag + sort |
| `/?focus=1` | Focus this week (starred / due soon / in progress) |

## Export backup tip

Browser storage can be cleared. From the app header or **Settings → Export JSON**, download a backup file regularly (`project-board-YYYY-MM-DD.json`). Restore via **Settings → Import JSON**. Settings records **Last export** time; a soft reminder appears on the Dashboard when you have never exported or the last export is older than 7 days (dismissible for the session only).

Data shape:

```json
{
  "version": 1,
  "projects": [ /* ... starred?: boolean ... */ ],
  "settings": {
    "showCompleted": false,
    "idleDays": 14,
    "theme": "system",
    "lastExportAt": null
  }
}
```

Activity events use a separate key: `project-board-activity-v1` (capped at 100).  
Missing `starred` on load migrates to `false`. Missing `lastExportAt` migrates to `null`.

## Seed projects (realistic inventory)

On first load (empty storage), the board starts **empty** with an onboarding card. Load inventory from onboarding or **Settings**:

| Project | Type | Status |
|---------|------|--------|
| Project Board | web | in_progress |
| Orbit Tap | game | done |
| Lobby Chaos | game | done |
| xVELOCITY Race | game | done |
| Roxy Landing | web | paused |
| Portfolio SPA | web | planned |
| Second Brain + Hermes ops | infra | in_progress |
| Hotelfach study aids | learning | in_progress |

Seed notes include local paths under `/root/projects/*` and vault path for ops. Public URLs are linked where they exist (portfolio).

## Privacy

Everything stays in your browser. No accounts, no telemetry, no secrets required.
