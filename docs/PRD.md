# PRD — Personal Project Dashboard  
**Owner workspace (private)** · **v0.2** (decisions locked from review) · 2026-07-11

| Field | Value |
|--------|--------|
| **Product name (working)** | **Project Board** *(generic — no personal name in product branding)* |
| **Name alts** | Buildboard · Forge Board · Stack Board |
| **Repo folder (local)** | `/root/projects/abel-project-dashboard` *(folder path may keep owner machine naming; **UI never shows personal name**)* |
| **Owner** | Private single-user |
| **Mentor / implementer** | Roxy: plan + verify · **Grok Build CLI**: implement |
| **Status** | PRD **v0.2** — decisions recorded; next = implementation plan |
| **Primary language UI** | **English only** (v1) |
| **Stack (locked)** | **TypeScript app** (Vite + React or Preact recommended) |
| **Primary goal** | One place for **progress, notes, steps, status, deadlines, and type/status stats** so personal projects are not forgotten. |

---

## 0. Decision log (Abel review answers)

| # | Question | Decision |
|---|----------|----------|
| 1 | Product name | **Generic** — no personal name in the product (working: **Project Board**) |
| 2 | Stack | **TypeScript app** (portfolio-grade SPA) |
| 3 | UI language | **English only** for v1 |
| 4 | `done` projects | **Hidden by default**; can be shown again via filter / “Show completed” |
| 5 | Device priority | **Both mobile and desktop** (responsive first-class, not desktop-only) |
| 6 | UX references | **[Focalboard](https://github.com/mattermost-community/focalboard)** · **[Taskcafe](https://github.com/JordanKnott/taskcafe)** |

---

## 1. Executive summary

Side projects (games, landings, tools, infra) scatter across chat, disk folders, and notes. There is no single **control surface** that answers:

- What projects exist, and what is their **status**?
- How far is **progress** (steps / milestones)?
- Where are the **notes** without digging chat history?
- Any **deadlines**?
- **Metrics**: games vs web vs tools; active vs stuck?

**Project Board** is a **personal, local-first** dashboard inspired by lightweight board tools (Focalboard / Taskcafe), **scoped down** for one person: visibility and light discipline — **not** multiplayer Jira.

---

## 2. Reference products → what we take / leave

### Focalboard (Mattermost community)
Open-source project/board management (Notion-like boards, views, cards).

| Borrow | Leave for v1 |
|--------|----------------|
| Clean **board / card** mental model | Multi-board workspaces, multi-user |
| Properties on cards (status, dates) | Full database engine / complex views matrix |
| Focus on **structured work items** | Server + auth stack |

### Taskcafe
Kanban-style task boards (columns, cards, projects).

| Borrow | Leave for v1 |
|--------|----------------|
| **Kanban columns by status** feel | Full team kanban + comments threads |
| Simple project → list of cards | Real-time collab, heavy backend |
| Visual “where is this work?” | Swimlanes, complex permissions |

### Our product positioning

```text
Focalboard / Taskcafe  →  full board apps
         ↓ scope down
Project Board          →  personal project inventory + steps + notes + stats
         ↓ not
Jira / Linear          →  enterprise process
```

**v1 UX blend:**
- **Home**: KPI + filters + card grid (dashboard).
- **Optional board view**: columns = status (`idea` … `done`) — Taskcafe/Focalboard-like; cards = projects.
- **Detail drawer/page**: steps checklist, notes, links, deadline (card back-side).

---

## 3. Problem statement

| Problem | Impact |
|---------|--------|
| Projects live in many places | Ideas vanish after a chat session |
| Progress only in memory/chat | Hard to resume after days off |
| No formal status | Toys, portfolio pieces, experiments mixed |
| No simple metrics | Hard to see patterns (many games, little polish) |
| Vault is great for knowledge, weak as a “board” | Need a dashboard UI, not only notes |

---

## 4. Goals & non-goals

### 4.1 Goals (v1)

1. **Inventory** of personal projects (seed + manual entry).
2. Clear **status lifecycle**: `idea` → `planned` → `in_progress` → `paused` → `done` → `archived`.
3. **Progress** + **step checklist** (toggle done).
4. **Notes** (lightweight markdown) — does not replace Obsidian.
5. Optional **deadline** + overdue / soon indicators.
6. **Home dashboard**: cards + filters + **stats** (by type, by status, overdue).
7. **`done` / `archived` hidden by default**; toggle **Show completed** (and/or filter chips) to reveal.
8. **Local-first**: browser storage + export/import JSON.
9. **Responsive**: first-class **mobile + desktop** (touch targets, collapsible nav, readable cards).
10. **English-only UI** strings.

### 4.2 Non-goals (v1)

- Multi-user, SSO, public share (except optional static deploy later).
- Full Focalboard multi-view database or Taskcafe team features.
- GitHub/Linear sync.
- Minute-level time tracking.
- Replacing Obsidian second brain.
- SuperGrok usage tracking (separate script).

---

## 5. Personas & use cases

### Persona
Single builder who juggles mini-games, web experiments, and infra scripts; wants a **simple board**, not process theater.

### Use cases

| ID | Use case | Priority |
|----|----------|----------|
| UC1 | Open home → see active projects + status | P0 |
| UC2 | Open project → progress, steps, notes, deadline | P0 |
| UC3 | Add a new project in &lt; 30 seconds | P0 |
| UC4 | Check off steps; progress updates | P0 |
| UC5 | Filter by status/type; search | P0 |
| UC6 | **Show completed** reveals `done` (and optionally `archived`) | P0 |
| UC7 | Stats by type & status | P0 |
| UC8 | Export / import JSON | P1 |
| UC9 | Board/kanban view by status | P1 |
| UC10 | Seed from known local projects | P1 |
| UC11 | Links to live URL / folder / vault path (text) | P2 |

---

## 6. Product concept

### 6.1 Core objects

```text
Project
  id, title, slug
  type          // game | web | tool | learning | infra | other
  status        // idea | planned | in_progress | paused | done | archived
  summary
  progress_pct  // 0–100; auto from steps when steps exist
  steps[]       // { id, title, done, order }
  notes_md
  links[]       // { label, url }
  tags[]
  deadline      // optional ISO date
  stack[]
  created_at, updated_at, started_at?
```

### 6.2 Status lifecycle

```text
idea → planned → in_progress ⇄ paused → done → archived
```

**Visibility rules (locked):**
- Default home list/board: statuses **`idea` | `planned` | `in_progress` | `paused`** only.
- **`done` and `archived` hidden** unless:
  - user enables **Show completed**, or
  - user picks explicit filter chip `Done` / `Archived` / `All`.
- Stats widgets should still count all projects (or show “active vs completed” split — prefer: KPI total includes all; main grid respects hide rule).

### 6.3 Health (derived)

| Signal | Rule (default) |
|--------|----------------|
| `at_risk` | deadline within 3 days (or overdue) and not done/archived |
| `idle` | `in_progress` and `updated_at` older than 14 days |

---

## 7. UI architecture

### 7.1 Views

1. **Dashboard (Home)** — KPI row, stats bars, filter chips, project cards (responsive grid).
2. **Board (P1)** — columns by status (Taskcafe/Focalboard-ish); drag optional later (v0.2+).
3. **Project detail** — page or right drawer: steps, notes, links, meta, status/deadline editors.
4. **Settings** — show completed default off, idle days, export/import, seed.

### 7.2 Responsive (both priorities)

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Single column cards; bottom or top compact filters; detail as full-screen route; large touch targets (≥44px) |
| Desktop | Multi-column grid; optional side drawer detail; board columns visible |

### 7.3 Wireframe (home, EN)

```text
┌────────────────────────────────────────────────────────────┐
│  Project Board              [+ New project] [Export] [···] │
├──────────┬──────────┬──────────┬───────────────────────────┤
│ Active 4 │ Ideas 2  │ Overdue 1│ Completed 3 (hidden)      │
├──────────┴──────────┴──────────┴───────────────────────────┤
│ Filters: [Active✓] [Idea] [Planned] [Paused]  [Show completed ☐]
│ Type: [All] [Game] [Web] [Tool] …          🔍 Search         │
├────────────────────────────────────────────────────────────┤
│  Cards…                                                     │
│  Stats: by type · by status                                 │
└────────────────────────────────────────────────────────────┘
```

**UI copy:** English only (`New project`, `Show completed`, `Overdue`, `Steps`, `Notes`, …).

---

## 8. Seed data (examples — no personal branding required)

| Title | Type | Suggested status |
|-------|------|------------------|
| Lobby Chaos | game | done (hidden by default) |
| Orbit Tap | game | done (hidden by default) |
| xVELOCITY | game | done / paused polish |
| Character landing | web | paused |
| Project Board | web | planned / in_progress |
| Second brain ops | infra | in_progress |
| Portfolio SPA | web | idea / planned |

---

## 9. Functional requirements

### P0

| ID | Requirement |
|----|-------------|
| F1 | CRUD projects (archive as soft end-state) |
| F2 | Fields: title, type, status, summary, progress, steps, notes, deadline, tags, links |
| F3 | Home list + filters + search |
| F4 | **Hide `done`/`archived` by default**; **Show completed** reveals them |
| F5 | Detail: step checklist; progress auto-from-steps |
| F6 | Persist locally (localStorage or IndexedDB) |
| F7 | Stats: by status, by type, overdue count |
| F8 | Responsive mobile + desktop |
| F9 | English-only UI |

### P1

| ID | Requirement |
|----|-------------|
| F10 | Export / import JSON |
| F11 | Board/kanban by status |
| F12 | Sort: updated, deadline, progress, title |
| F13 | Health badges idle / at_risk |
| F14 | Seed known projects button |

### P2

| ID | Requirement |
|----|-------------|
| F15 | Drag-reorder steps (and later cards on board) |
| F16 | Activity log |
| F17 | PWA offline |
| F18 | Dark/light theme |

---

## 10. Non-functional requirements

| Area | Target |
|------|--------|
| Stack | **TypeScript** SPA — **Vite + React** (or Preact) recommended |
| Performance | Usable first paint &lt; 2s mid-range phone; JSON &lt; 1MB comfortable |
| Privacy | Local-only default; no telemetry |
| Security | No secrets in repo; sanitize rendered markdown |
| A11y | Keyboard filters, focus states, contrast |
| Workflow | Implement via **Grok Build CLI**; Hermes plan/verify only |

---

## 11. Technical architecture (locked direction)

```text
Vite + TypeScript + React (or Preact)
  ├── components/   (layout, ProjectCard, Filters, Stats, StepList, …)
  ├── pages/        (Dashboard, ProjectDetail, Board?, Settings)
  ├── store/        (state + persist)
  ├── lib/          (stats, health, export)
  ├── data/         (seed JSON)
  └── styles/       (responsive CSS variables; Focalboard/Taskcafe-inspired density)
```

- **State:** lightweight store + persist middleware.
- **Charts:** CSS bars first (no heavy chart lib in MVP).
- **Deploy:** local dev + optional static host later (**no auto Pages without approval**).

---

## 12. Success metrics

| Metric | Target (2 weeks after MVP) |
|--------|----------------------------|
| Weekly opens | ≥ 2 |
| Active projects have ≥ 1 step or note | 100% |
| Completed remain findable via Show completed | Yes |
| Usable on phone and desktop without layout break | Yes |

---

## 13. Risks

| Risk | Mitigation |
|------|------------|
| Scope creep toward full Focalboard | Hard P0 boundary; board view is P1 |
| Cleared browser storage | Export CTA + import |
| Duplicate Obsidian | Notes stay short/operational |
| Personal name leaking into UI | Branding checklist: product name **Project Board** only |

---

## 14. Roadmap

| Phase | Content | Exit |
|-------|---------|------|
| **PRD v0.2** | This doc + decisions | ✅ |
| **Impl plan** | File tree, schema JSON, component list | Abel OK |
| **v0.1 MVP** | Dashboard + detail + CRUD + steps + hide completed + stats + persist + responsive EN | Daily usable |
| **v0.2** | Board view, export/import, seed, health | Inventory complete |
| **v0.3** | Polish, activity, PWA optional | Portfolio screenshots |

---

## 15. Acceptance criteria (MVP v0.1)

- [ ] Create ≥ 5 projects with type & status.
- [ ] Toggle steps; progress updates.
- [ ] Set/clear deadline; overdue visible.
- [ ] Stats by type & status correct.
- [ ] **Completed projects hidden by default**; **Show completed** lists them again.
- [ ] Refresh keeps data (local persist).
- [ ] Layout works on ~390px width and ≥1280px width.
- [ ] All user-visible strings English; **no personal name in product chrome**.
- [ ] README: dev scripts + export backup.
- [ ] No secrets; no unauthorized deploy.

---

## 16. Example project JSON

```json
{
  "id": "orbit-tap",
  "title": "Orbit Tap",
  "type": "game",
  "status": "done",
  "summary": "One-button orbital survival with challenge tuning.",
  "progress_pct": 100,
  "steps": [
    { "id": "s1", "title": "Core orbit loop", "done": true, "order": 1 },
    { "id": "s2", "title": "Modes + share card", "done": true, "order": 2 }
  ],
  "notes_md": "Tunnel URLs are ephemeral.",
  "links": [],
  "tags": ["canvas", "one-button"],
  "deadline": null,
  "stack": ["html", "canvas"],
  "updated_at": "2026-07-11T20:00:00Z"
}
```

---

## 17. Next step

1. Abel: optional name pick among **Project Board / Buildboard / Forge Board** (default **Project Board** if silent).  
2. Roxy: write **implementation plan** (stack confirm React vs Preact, schema, milestones).  
3. After plan OK → **Grok Build CLI** implements MVP.

---

*PRD v0.2 — decisions from owner review (generic name, TS, EN, hide completed, dual responsive, Focalboard/Taskcafe references).*
