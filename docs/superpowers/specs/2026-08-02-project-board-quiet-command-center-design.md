# Project Board v0.10 — "Quiet Command Center" Visual Design Spec

Date: 2026-08-02
Status: ready for implementation
Scope: visual system only (CSS tokens, layout, hierarchy, density, markup class structure). No behavior, storage, or dependency change.

---

## 1. Goal

Turn Project Board from a competent-but-generic dashboard into a **mature dark personal operations desk**: the surface a single owner opens every morning to see what is late, what is moving, and what to touch next.

Design direction, in five commitments:

1. **Soft ink/slate surfaces.** Near-black with a blue-grey cast, not pure `#000`, not neutral grey. Depth comes from a 3-step surface ladder plus hairline borders — never from blur or glow.
2. **Restrained focus blue.** One accent hue, used for interactive affordance and focus only. Accent is never decoration and never fills large areas.
3. **Semantic status signals.** Status, health, and deadline pressure each own a fixed hue with a fixed meaning, applied in small doses (spine, rule, dot, label) and **always paired with a text label**.
4. **Strong editorial hierarchy.** Page title → section label → item title → meta. Sizes and weights carry the hierarchy; boxes do not. Section labels are small uppercase with tracking, separated by hairline rules, like a printed report.
5. **Purposeful density.** More information per screen than v0.9, achieved by removing card chrome and padding — not by shrinking touch targets or text below legible floors.

### Explicit rejections

These are out of scope and must not appear in the implementation:

- **Cyberpunk / neon.** No saturated cyan/magenta, no `box-shadow` glow, no text-shadow, no gradient borders, no scanline or grid overlays, no animated accent pulses.
- **Glassmorphism.** No `backdrop-filter`, no translucent floating panels, no frosted headers. Overlays use an opaque surface plus a flat scrim.
- **Generic uniform SaaS cards.** No screen made of identical rounded boxes with identical padding and drop shadows. Cards differ by role: the KPI strip is a hairline-divided ledger, Review buckets are lists, Activity is a timeline, and project cards get a status spine instead of a shadow.

---

## 2. Non-goals

- No new features, routes, filters, sorts, or settings.
- No data model change, no migration, no new localStorage key.
- No new runtime or dev dependency; no CSS framework, no icon package, no font download (system font stack only).
- No component library abstraction refactor, no move to CSS modules or styled-components — `src/index.css` stays the single source of visual truth.
- No change to Board horizontal overflow behavior, Board keyboard model, dialog focus lifecycle, shortcut bindings, or PWA registration.
- No test rewrites. The 99 existing Node tests must pass unmodified.
- No GitHub Pages / deployment flow change.

---

## 3. Preserved contract

Anything below that breaks is a failed implementation.

| Area | Contract |
|------|----------|
| Routes | `/`, `/board`, `/review`, `/activity`, `/project/:id`, `/new`, `/settings` unchanged, including URL filter params (`status`, `type`, `tag`, `q`, `sort`, `dir`, `showCompleted`, `focus`). |
| Storage | `project-board-v1` shape and `project-board-activity-v1` (cap 100) unchanged. Import/export JSON identical, including the dated filename and `settings.lastExportAt` write on export. |
| Import validation | Bounds and allow-lists untouched (5 MB, 5000 projects, 500 steps/links, allow-listed `status` / `type` / `theme`). |
| Theme | dark / light / system all remain fully supported and switchable from header and Settings. Both themes get the new palette; `system` still follows `prefers-color-scheme`. |
| Board | Intentional internal horizontal scroll kept. `src/lib/boardKeyboard.ts` decisions, aria-live announcements, and the `src/lib/boardScrollHint.ts` gating (real-overflow only, retires after short horizontal scroll, never persisted, not focusable, not `aria-live`) all unchanged. |
| Dialogs | `src/hooks/useDialogFocus.ts` drives the mobile menu sheet and `?` dialog: focus in, Tab/Shift+Tab wrap, Escape closes, focus restored. |
| Shortcuts | `n` `/` `b` `d` `r` `a` `?` unchanged and still ignored while typing. |
| PWA | Manifest present, icons present, service worker registered only under `import.meta.env.PROD`. |
| Snapshot | Printable share card still prints legibly on white paper. |
| Tests | `npm test` — 99 passing cases, files unmodified. |

---

## 4. Tokens

All tokens are CSS custom properties declared in `src/index.css`. Dark is the reference theme; light is a deliberate mirror, not an inversion. Existing variable names are kept where they exist and aliased where renamed, so no `.tsx` inline style breaks.

### 4.1 Surfaces and lines — dark

| Token | Value | Use |
|-------|-------|-----|
| `--pb-surface-sunken` | `#0a0c0f` | Board column troughs, code blocks, inputs |
| `--pb-surface-base` | `#101318` | Page background |
| `--pb-surface-raised` | `#161a20` | Cards, panels, toolbars |
| `--pb-surface-overlay` | `#1c2128` | Dialogs, sheets, menus (opaque) |
| `--pb-surface-hover` | `#1e232b` | Row/card hover |
| `--pb-line-subtle` | `#22262e` | Hairline dividers inside panels |
| `--pb-line` | `#2c313a` | Card and panel borders |
| `--pb-line-strong` | `#3a414d` | Input borders, active dividers |
| `--pb-scrim` | `rgba(6, 8, 11, 0.72)` | Dialog backdrop — flat, no blur |

### 4.2 Text — dark

| Token | Value | Target contrast on `--pb-surface-base` |
|-------|-------|----------------------------------------|
| `--pb-text` | `#e7eaef` | ≥ 13:1 |
| `--pb-text-secondary` | `#a8b0bd` | ≥ 7:1 |
| `--pb-text-muted` | `#8590a0` | ≥ 4.6:1 (still passes AA body text) |
| `--pb-text-inverse` | `#0d1014` | On accent fills |

There is no fourth, dimmer text token. If something is too unimportant for `--pb-text-muted`, it should not be on screen.

### 4.3 Accent — one hue, restrained

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--pb-accent` | `#5b8def` | `#2c5fd0` | Links, focus ring, active nav underline, primary button fill |
| `--pb-accent-hover` | `#7aa4f5` | `#1f4db5` | Hover/active state |
| `--pb-accent-quiet` | `rgba(91, 141, 239, 0.14)` | `rgba(44, 95, 208, 0.12)` | Selected chip / active row wash |
| `--pb-focus-ring` | `#7aa4f5` | `#1f4db5` | Focus outline color (must clear 3:1 against both adjacent surfaces) |

Accent budget rule: at most **one** accent-filled element per view (the primary action). Everything else uses accent as a 1–2px line, a text color, or a 14%-opacity wash.

### 4.4 Semantic status — fixed meanings

| Token | Dark | Meaning |
|-------|------|---------|
| `--pb-status-idea` | `#8b94a6` | `idea` — unformed, deliberately neutral slate |
| `--pb-status-planned` | `#6d8fd0` | `planned` — committed, cool but desaturated so it never reads as accent |
| `--pb-status-progress` | `#d2a349` | `in_progress` — the only warm signal in normal operation |
| `--pb-status-paused` | `#a37f5f` | `paused` — clay, warm but dulled |
| `--pb-status-done` | `#5f9e7a` | `done` — moss |
| `--pb-status-archived` | `#5a616e` | `archived` — recedes |
| `--pb-signal-danger` | `#d4705e` | Overdue, destructive actions, import errors |
| `--pb-signal-warn` | `#d2a349` | Due within 7 days, stale in progress |
| `--pb-signal-ok` | `#5f9e7a` | Healthy, complete, import success |

Status color is decorative reinforcement only. Every status/health indicator keeps its visible text label (or, where space forbids text, an `aria-label` plus a `title`) so the meaning survives greyscale, color blindness, and forced-colors mode.

### 4.5 Light theme mirror

Warm paper rather than white: `--pb-surface-base #f5f5f2`, `--pb-surface-raised #fbfbf9`, `--pb-surface-sunken #ecece7`, `--pb-surface-overlay #ffffff`, `--pb-line #dedcd5`, `--pb-line-subtle #e8e6e0`, `--pb-text #1a1e24`, `--pb-text-secondary #4c545f`, `--pb-text-muted #626b77`. Status hues shift darker for contrast on paper: idea `#5f6878`, planned `#3a63ad`, progress `#8a6410`, paused `#7a5433`, done `#2f6b4c`, archived `#5a616e`; danger `#a83c2a`, warn `#8a6410`, ok `#2f6b4c`.

### 4.6 Typography

System stack only: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Numerals use `font-variant-numeric: tabular-nums` in KPIs, counts, progress percentages, dates, and timestamps.

| Role | Size / line-height | Weight | Tracking |
|------|-------------------|--------|----------|
| Page title | `1.625rem` / 1.15 | 600 | `-0.012em` |
| Section label | `0.6875rem` / 1.2, uppercase | 600 | `0.09em` |
| Card / item title | `0.9375rem` / 1.3 | 600 | `-0.005em` |
| Body | `0.875rem` / 1.5 | 400 | 0 |
| Meta / chip | `0.75rem` / 1.35 | 500 | `0.01em` |
| KPI figure | `1.75rem` / 1.05 | 620 (600 fallback) | `-0.02em` |

Minimum rendered text size anywhere: `0.75rem` (12px). Notes/body measure capped at `72ch`.

### 4.7 Space, radius, elevation, motion

- Space scale: `2, 4, 6, 8, 12, 16, 20, 24, 32, 40` px as `--pb-space-*`.
- Radius: `--pb-radius-sm 4px` (chips, inputs), `--pb-radius 6px` (cards), `--pb-radius-lg 10px` (panels, dialogs), `--pb-radius-pill 999px` (star toggle, count badges only).
- Elevation: hairline border + at most `0 1px 2px rgba(0,0,0,0.35)`. Dialogs may use `0 12px 32px rgba(0,0,0,0.45)`. No other shadows. No `backdrop-filter` anywhere.
- Motion: `--pb-dur-fast 110ms`, `--pb-dur 160ms`, easing `cubic-bezier(0.2, 0, 0.2, 1)`. Animate only `opacity`, `background-color`, `border-color`, `color`, `transform` on ≤4px offsets.

---

## 5. Layout and hierarchy

Every page follows one skeleton:

```
[ command bar — sticky, 48px, hairline bottom ]
[ page head: title + one-line context + primary action ]
[ ——— hairline rule ——— ]
[ section label ]  content
[ section label ]  content
[ footer: version + storage note ]
```

- Content column: `max-width 1180px`, centered, gutters `24px` desktop / `16px` ≥768 / `12px` <768.
- **Section label + hairline rule replaces the "card" as the primary grouping device.** Panels are used only where content is genuinely a distinct object (a project card, a dialog, the danger zone).
- Two-column split (main + `300px` rail) appears at ≥1120px on Dashboard and Project Detail. Below that, the rail content flows after the main column in DOM order — no visual-only reordering that breaks tab order.
- The Board is the deliberate exception: full-bleed to the viewport gutters so columns get maximum width before overflowing.

---

## 6. Page changes

### Layout (`src/components/Layout.tsx`)

- Command bar: brand mark (text, 13px, letter-spaced) left; nav center; actions right. Height 48px, `--pb-surface-base` with `--pb-line-subtle` bottom hairline, `position: sticky; top: 0`. Opaque — no blur.
- Desktop nav (≥768px): plain text tabs, `--pb-text-secondary`, active tab is `--pb-text` with a `2px` `--pb-accent` bottom rule. No filled pills, no boxes.
- Mobile (<768px): bottom tab bar retained at `56px` + `env(safe-area-inset-bottom)`, `--pb-surface-raised`, top hairline; icons + 11px labels; each target ≥44×44. Top bar keeps brand + New + actions menu.
- Footer: single hairline-topped line, `--pb-text-muted`, 12px: `Project Board v0.10.0 · local-first · data stays in this browser`.

### Dashboard (`src/pages/Dashboard.tsx`, `KpiRow`, `Filters`, `DueSoonStrip`, `ProjectCard`, `StatsPanel`, `RecentActivity`, `Onboarding`)

- **KPI row → ledger strip.** One `--pb-surface-raised` panel divided by vertical hairlines into cells: tabular figure over uppercase micro-label. No per-KPI box, border, or shadow. Wraps to 2×2 below 768px, stacks to a 2-column grid at 320px.
- **Filters → quiet toolbar.** Collapsed-by-default behavior on mobile and the remembered open/closed preference are unchanged; the panel loses its card treatment and becomes a hairline-bounded band. Chips: 4px radius, `--pb-line` border, `--pb-accent-quiet` wash + `--pb-accent` border when active, `28px` tall desktop / `36px` touch. Active-count badge is a pill in `--pb-accent-quiet`.
- **Due soon strip** becomes a labeled list of rows with a leading 8px status dot and a right-aligned tabular relative date, colored by `--pb-signal-warn` / `--pb-signal-danger` with the words "due in 3 days" / "overdue 2 days" always present.
- **Project cards** are the one place with real object identity: `--pb-surface-raised`, `--pb-radius`, `1px --pb-line`, plus a `3px` left **status spine** in the status hue. Layout: title row (title + star), meta row (status label · type · tags), a `2px` square-ended progress hairline with `12/18 steps · 67%` beside it, then link chips (max 2) and actions. Hover raises to `--pb-surface-hover` and `--pb-line-strong`. Row actions may fade in on `:hover` only via `@media (hover: hover)`; they are always rendered, always focusable, and become fully opaque on `:focus-visible` and on touch devices.
- Grid: 1 column <768, 2 at ≥768, 3 at ≥1120 with the rail, 3 at ≥1440 (no 4th column — line length and scanability beat raw density here).
- **Stats + Recent activity** move into the right rail at ≥1120px as label-and-hairline sections, not cards.
- **Onboarding** and the backup nudge become a single-hairline notice band with a left `3px` accent (onboarding) or `--pb-signal-warn` (backup nudge) rule; the nudge keeps session-only dismissal.

### Board (`src/pages/Board.tsx`, `BoardColumn`, `BoardCard`)

- Columns: `--pb-surface-sunken` trough, `--pb-radius-lg`, `min-width 264px` desktop / `240px` <768. Sticky column header inside the trough with the status label, a `2px` bottom rule in the status hue, and a tabular count in a pill.
- Cards: denser than Dashboard cards — `10px 12px` padding, title + one meta line + progress hairline only. Status spine omitted (the column already carries status); instead the drag affordance is a 2×3 dot grip at `--pb-text-muted`.
- Focus and drag states: `:focus-visible` shows the standard focus ring; the keyboard-focused card additionally gets `--pb-line-strong` border and `--pb-surface-hover`. Drag-over column shows `--pb-accent` 1px inset border — no scaling, no rotation.
- **Overflow and hint unchanged.** Only the hint's typography/color changes (12px, `--pb-text-muted`, hairline-topped). Column min-widths are chosen so overflow still triggers at the same breakpoints as v0.9 for 6 columns.

### Project Detail (`src/pages/ProjectDetail.tsx`, `HealthBadges`, `StepList`)

- Editorial head: title at page-title scale, then a single metadata line — `status · type · created · deadline · progress` — separated by `·` in `--pb-text-secondary`, with only the deadline colored when it is warn/danger.
- Two columns ≥1024px: main (Notes, Steps) + `300px` rail (health, links, deadline, activity for this project, danger actions). Single column below, same DOM order.
- **Steps** become a hairline-divided row list, not cards: checkbox, label (strikethrough + `--pb-text-muted` when done), drag grip, Up/Down buttons. Rows are `40px` desktop, `48px` touch. The grip and Up/Down buttons are **always visible** on touch and always focusable everywhere. Bulk actions sit in a right-aligned action row under the section label.
- **Notes**: Edit/Preview toggle becomes two text tabs with an accent underline. Preview typography is the editorial body style, `72ch` measure, `--pb-surface-sunken` for `code`, and links in `--pb-accent` with underline.
- **Health badges**: hairline-bordered chips, status hue for border and text, neutral background. Text label always present.

### Review (`src/pages/Review.tsx`)

- Reads as a printed weekly report. KPI strip reuses the Dashboard ledger. Each bucket (overdue / due soon / stale in progress / no steps) is a section label + hairline rule + list of rows, with the bucket count in the label. Empty buckets render a single muted line ("Nothing overdue.") rather than an empty box.
- Suggested actions: numbered list with a hairline between items; each row has its action button right-aligned. The idle bulk archive action is grouped at the end under a `--pb-signal-warn`-ruled band with an explicit count in the button label.

### Activity (`src/pages/Activity.tsx`, `RecentActivity`)

- Timeline: one `1px --pb-line-subtle` vertical rule at `9px` from the left; each event has a `7px` dot on the rule, colored by event kind using the semantic set. Sticky date group headers (section-label style). Timestamps are tabular, right-aligned, `--pb-text-muted`.
- 100-event cap unchanged; the list ends with a muted line stating the cap.

### Settings and New Project (`src/pages/Settings.tsx`, `src/pages/NewProject.tsx`)

- Form rows: label + help text left, control right at ≥768px (`grid-template-columns: minmax(180px, 34%) 1fr`); stacked below. Hairline between rows.
- Inputs: `--pb-surface-sunken`, `1px --pb-line-strong`, `--pb-radius-sm`, `36px` desktop / `44px` touch, accent border + focus ring on focus. Placeholder at `--pb-text-muted`.
- Buttons: primary = accent fill with `--pb-text-inverse`; secondary = hairline border, transparent fill; destructive = `--pb-signal-danger` border and text, filled only after confirm.
- **Danger zone** is the one bordered panel on the page: `--pb-signal-danger` 1px border, sunken surface, explicit consequence text.
- Import preview dialog and hygiene counts keep exact wording and behavior; only surfaces, dividers, and label styles change. Import errors render as a danger-ruled list, one plain-language line each.

---

## 7. Responsive requirements

| Width | Requirements |
|-------|--------------|
| **320px** | No horizontal page scroll on any route (the Board's internal scroller is the only sideways scroll). KPI ledger = 2×2. Cards single column, `12px` gutters, `12px` internal padding. Page title drops to `1.375rem`. Filters collapsed by default with the active-count badge visible. Empty-state `Create one` action stays above the fold (reserved board height stays compact, as in v0.9). Bottom tab labels may truncate but never wrap. |
| **390px** | Same single-column layout with `16px` internal card padding. All touch targets ≥44×44. Due-soon rows keep date on the same line as the title without truncating the date. |
| **768px** | Nav switches from bottom bar to top text tabs; bottom bar hidden. Dashboard cards 2 columns. Filters expanded by default. Settings form rows go label-left. Board shows ~3 columns and still overflows sideways with the hint gate intact. |
| **1024px** | Content column engaged with `24px` gutters. Project Detail becomes main + rail. Review buckets may run two-up where each list is ≥6 rows. Board shows ~4 columns. |
| **1440px** | Content capped at `1180px` and centered; the Board remains full-bleed. Dashboard = main 3-up grid + rail. No element stretches to fill; notes measure stays ≤`72ch`. Ledger strip cells distribute evenly with hairlines, no gaps. |

Verification at each width: no clipped focus ring, no overlapped sticky headers, no target under 44px on touch widths, no text under 12px.

---

## 8. Accessibility, keyboard, focus, reduced motion

- **Contrast:** every text/background pairing in both themes must measure ≥4.5:1 for text under 18.66px/bold-14px and ≥3:1 for large text; UI borders that convey state (input border, focused card border, active chip border) ≥3:1 against their adjacent surface. This must be measured against the final token values, not assumed from this document.
- **Never color alone:** status, health, due-soon pressure, and validation results all carry text.
- **Focus:** `:focus-visible { outline: 2px solid var(--pb-focus-ring); outline-offset: 2px; }` globally. `outline: none` without an equivalent visible replacement is banned. Focus rings must not be clipped by `overflow: hidden` on cards or Board columns — use `outline-offset` with padding headroom, and keep the Board scroller's `scroll-padding-inline` so a focused card is never flush against the clip edge.
- **Targets:** ≥44×44 on touch widths; ≥32px high with ≥8px separation on pointer widths (satisfying WCAG 2.5.8 with margin).
- **Board keyboard:** unchanged. ←→/`h``l` status, ↑↓/`k``j` focus, Enter/Space open, keys claimed before resolution so edge presses don't scroll or activate, ignored while typing. `aria-live` status region retained; its new styling must not make it visually hidden in a way that changes announcement behavior.
- **Dialogs:** `useDialogFocus` untouched. Overlay is opaque `--pb-surface-overlay` over `--pb-scrim`; the scrim is not focusable and the dialog keeps `role="dialog"` + `aria-modal` + a labelled heading.
- **Shortcuts:** unchanged, including typing suppression; the `?` dialog's key table is restyled as a hairline-divided two-column list with `<kbd>` in `--pb-surface-sunken`.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets all transition/animation durations to `0.01ms` and removes any transform-based enter/exit. Nothing depends on motion to be understood.
- **Forced colors:** `@media (forced-colors: active)` keeps 1px borders on cards, chips, and inputs (`border-color: CanvasText`) so grouping survives when custom colors are dropped.
- **Print:** the snapshot/share card forces light surfaces, black text, and visible hairlines regardless of theme.

---

## 9. Acceptance criteria

### Visual

1. Every color, space, radius, duration, and font size in `src/index.css` resolves from a `--pb-*` token; no raw hex outside the token blocks.
2. Zero occurrences of `backdrop-filter`, `text-shadow`, `filter: blur`, gradient borders, or any `box-shadow` with a spread/blur >32px or a chromatic color.
3. At most one accent-filled element per view.
4. Dashboard, Board, Review, and Activity are visually distinguishable at a glance by their grouping device (ledger strip, troughs, report lists, timeline) — none is a grid of identical boxes.
5. Each project status renders its assigned hue in exactly one place per surface (card spine on Dashboard, column header rule on Board) and always alongside its text label.
6. Dark and light themes both meet the contrast targets in §8, measured with a checker.
7. Screenshots at 320 / 390 / 768 / 1024 / 1440 show no horizontal page scrollbar, no clipped focus ring, no overlapping sticky element, and no sub-12px text.
8. Footer reads `v0.10.0` and matches `package.json`.

### Functional

1. `npm run build` succeeds; `npm test` reports 99 passing, with no test file modified.
2. All seven routes load and render; every URL filter param from §3 still applies.
3. Export produces the same JSON shape and dated filename; re-importing an export from v0.9 leaves projects, steps, links, starred flags, and settings intact.
4. Import validation still rejects an oversized file, an over-limit project count, and a bad `status` value with the same plain-language errors.
5. Theme switch works from header and Settings for all three modes; `system` follows an OS change without reload.
6. Board: columns still scroll horizontally at narrow widths; the hint appears only on real overflow, retires after a short horizontal scroll, is absent from localStorage, and is not focusable.
7. Board keyboard: at the first column, ← does not scroll the page; at the last card, ↓ does not move focus or activate; Enter opens the focused project; typing in the search field consumes the keys.
8. Mobile sheet and `?` dialog: focus enters, Tab wraps both directions, Escape closes, focus returns to the opener.
9. All seven shortcuts fire from the Dashboard and are suppressed inside inputs and textareas.
10. `npm run build:pages` still emits `dist/.nojekyll` and `dist/404.html`.
11. `git diff --stat package.json package-lock.json` shows no dependency line changed.
12. With reduced motion enabled, no transition is observable and every state change is still legible.

---

## 10. Exact likely files

Touched (visual):

- `src/index.css` — the bulk of the change: token blocks for both themes, base/typography reset, and all component rules.
- `src/components/Layout.tsx` — command bar / nav / bottom bar / footer structure + version string.
- `src/components/ProjectCard.tsx` — status spine, title/meta/progress row order.
- `src/components/BoardCard.tsx`, `src/components/BoardColumn.tsx` — sticky header, trough, grip, density.
- `src/components/KpiRow.tsx` — ledger strip markup (single panel, hairline-divided cells).
- `src/components/Filters.tsx` — toolbar band + chip classes.
- `src/components/DueSoonStrip.tsx`, `src/components/HealthBadges.tsx` — dot + label rows, chip borders.
- `src/components/StepList.tsx` — hairline row list, always-visible grip/Up/Down.
- `src/components/StatsPanel.tsx`, `src/components/RecentActivity.tsx` — rail sections, timeline rule.
- `src/components/Onboarding.tsx` — notice band.
- `src/components/ThemeToggle.tsx` — icon button sizing/states.
- `src/components/KeyboardShortcuts.tsx` — dialog surface + `<kbd>` styling.
- `src/pages/Dashboard.tsx`, `Board.tsx`, `Review.tsx`, `Activity.tsx`, `ProjectDetail.tsx`, `NewProject.tsx`, `Settings.tsx` — section-label wrappers, grid/rail containers, class renames only.
- `index.html` — `<meta name="theme-color">` values for the new surfaces.
- `public/manifest.webmanifest` (or equivalent) — `background_color` / `theme_color` to match; no other manifest field.
- `package.json` — version `0.10.0`.
- `README.md` — new "Design (v0.10)" section and version bump.

Must not be touched:

`src/lib/boardKeyboard.ts`, `src/lib/dialogFocus.ts`, `src/lib/boardScrollHint.ts`, `src/hooks/useDialogFocus.ts`, storage/import/export modules, all `src/**/*.test.ts`, `package-lock.json`, `scripts/test-resolve-hook.mjs`.

---

## 11. Implementation stages (for Luna Max)

Each stage ends with `npm run build && npm test` green and a visual check at 390 and 1440.

1. **Token foundation.** Add both theme token blocks, base reset, typography scale, focus-visible rule, reduced-motion and forced-colors blocks. Alias any renamed variable to its old name so nothing breaks mid-flight. Deliverable: existing UI renders in the new palette with no markup change.
2. **Shell.** Layout: command bar, desktop text tabs with accent underline, mobile bottom bar with safe-area inset, footer + version `0.10.0`. Verify shortcuts and the mobile sheet focus lifecycle by hand.
3. **Dashboard.** Ledger KPI strip, filter toolbar, due-soon rows, project cards with status spine, rail at ≥1120px, onboarding/backup notice bands. Verify all URL filter params and the hover-vs-focus action visibility rule.
4. **Board.** Troughs, sticky headers, dense cards, grip, drag-over and keyboard-focus states, restyled hint. Re-verify overflow triggering, hint gating, and every keyboard edge case from §9.
5. **Detail, Review, Activity.** Editorial head + rail, step rows with always-visible controls, report-style buckets, timeline. Verify step reorder by both drag and Up/Down, and the notes Edit/Preview toggle.
6. **Settings, New Project, dialogs, print.** Form grid, inputs, button hierarchy, danger zone, import preview and error list, `?` dialog table, print rules for the snapshot card. Verify import rejection paths and export filename.
7. **Sweep.** Remove token aliases and dead CSS, measure contrast in both themes with a checker, capture the five widths, confirm no dependency diff, update README.

---

## 12. Risks

- **Contrast regression in light theme.** The warm-paper mirror is the easiest place to land at 4.2:1. Mitigation: measure every pairing in stage 7 and treat light theme as a first-class check, not an afterthought.
- **Density eroding touch targets.** Tightening padding is the point, but 44px floors are non-negotiable. Mitigation: density lives in desktop-only media queries; touch widths keep generous row heights.
- **Hover-only affordances.** Fading card actions in on hover can strand keyboard and touch users. Mitigation: `@media (hover: hover)` gate plus mandatory `:focus-visible` opacity override; verified in stage 3.
- **Board column widths shifting overflow.** `boardScrollHint` gating depends on real measured overflow; changing `min-width` changes when the hint appears. Mitigation: keep 6-column total width ≥ v0.9 at every breakpoint and re-run the manual overflow check in stage 4.
- **Focus rings clipped by new `overflow: hidden` containers.** Troughs and cards are the likely culprits. Mitigation: `outline-offset` headroom plus `scroll-padding-inline` on the Board scroller; explicit check at all five widths.
- **CSS variable renames breaking inline styles in `.tsx`.** Status colors are the most likely to be referenced inline. Mitigation: aliases in stage 1, alias removal only in stage 7 after a repo-wide search for `--pb-`.
- **Scope creep into behavior.** Restyling Review and Settings invites "small" logic fixes. Mitigation: any behavior change is a separate change, out of this spec.
- **Print legibility.** A dark-first palette can print as a black rectangle. Mitigation: explicit print rules in stage 6.

---

## 13. Self-review

What I would challenge in this spec:

- **The three-columns-max Dashboard cap at 1440px** trades density for line length. If the owner's real inventory grows past ~30 projects, a 4-up grid at 1440 may serve better. Revisit after living with it, not before.
- **`--pb-text-muted` at ~4.6:1** is deliberately close to the AA floor. If measurement puts any pairing under 4.5:1, lighten the token rather than shrinking its usage — the token exists to be safe for body text.
- **One accent hue with no secondary** means Review's "suggested actions" have no color of their own and lean entirely on hierarchy and numbering. That is the intent (quiet), but it is the section most at risk of reading flat. Judge it on screen in stage 5; the fix is spacing and a stronger section rule, not a second accent.
- **Status hue assignments are opinionated.** `in_progress` as amber means an active board looks warm, which some will read as "warning". The paired text label is the safeguard; if it still misreads, swap `in_progress` to a desaturated teal and keep amber exclusively for deadline pressure.
- **The right rail below 1120px** falls to the bottom of a long page, which can bury stats and recent activity on tablets. Acceptable: both are reference data, and the KPI ledger already carries the headline numbers at the top.

What this spec does not and cannot settle without running the app: exact measured contrast ratios, the precise breakpoint at which six Board columns begin to overflow, and whether the ledger strip's hairline cells hold together at 320px. All three are explicit stage checks rather than assumptions.
