# Implementation Plan — Project Board v0.10 "Quiet Command Center"

Date: 2026-08-02
Spec: `docs/superpowers/specs/2026-08-02-project-board-quiet-command-center-design.md` (approved)
Lane: separate Luna Max implementation lane
Baseline commit: `489e1e5` (clean tree)

---

## 0. How to read this plan

Every stage below has five fixed parts:

- **Files / symbols** — exact paths and the symbol or CSS region to touch.
- **Edits** — concrete, named changes. No "restyle as needed".
- **Gate** — a shell command pair. The `RED` command must fail (or print the
  pre-change value) *before* the edit; the `GREEN` command must pass *after*.
  This is the test-first substitute for a visual change (see §0.3).
- **Preservation checkpoint** — the specific behavior that must be re-proved
  still works, with how to prove it.
- **Done when** — the completion criteria.

### 0.1 Lane rules (hard fence)

Allowed to change, and nothing else:

```
src/index.css
src/components/Layout.tsx          src/components/ProjectCard.tsx
src/components/BoardCard.tsx       src/components/BoardColumn.tsx
src/components/KpiRow.tsx          src/components/Filters.tsx
src/components/DueSoonStrip.tsx    src/components/HealthBadges.tsx
src/components/StepList.tsx        src/components/StatsPanel.tsx
src/components/RecentActivity.tsx  src/components/Onboarding.tsx
src/components/ThemeToggle.tsx     src/components/KeyboardShortcuts.tsx
src/components/EmptyState.tsx      src/components/Toast.tsx
src/components/LinkChips.tsx       src/components/ProjectForm.tsx
src/pages/Dashboard.tsx  src/pages/Board.tsx     src/pages/Review.tsx
src/pages/Activity.tsx   src/pages/ProjectDetail.tsx
src/pages/NewProject.tsx src/pages/Settings.tsx
src/version.ts
index.html
public/manifest.webmanifest
package.json          (version field only)
README.md
```

Forbidden — a diff touching any of these fails the lane:

```
src/lib/boardKeyboard.ts     src/lib/boardScrollHint.ts
src/lib/dialogFocus.ts       src/hooks/useDialogFocus.ts
src/lib/storage.ts           src/lib/export.ts
src/lib/importValidation.ts  src/lib/snapshot.ts
src/store/ProjectContext.tsx src/types.ts
src/lib/**  (all other modules)
src/**/*.test.ts  (no edits, no new files)
package-lock.json            scripts/test-resolve-hook.mjs
```

`src/version.ts` is in the allowed list even though the spec's §10 file list
omits it: the footer version string the spec specifies comes from
`APP_VERSION` in that file, not from `package.json` at runtime. This is a spec
gap, resolved by inclusion, recorded in §9.

`src/lib/snapshot.ts` is forbidden and does not need touching: the weekly
snapshot opens a *separate document* whose CSS is inlined in that module
(`body { ... color: #152033; background: #fff }`, plus its own
`@media print`). It is already light-on-white and is not affected by
`src/index.css`. Stage 6 verifies it rather than editing it.

### 0.2 Fixed commands

```bash
BUILD:   npm run build
TEST:    npm test            # must print "# pass 99" and "# fail 0"
LINT:    npm run lint        # must print "Found 1 warning and 0 errors."
PREVIEW: npm run preview -- --host 127.0.0.1 --port 8780
PAGES:   npm run build:pages
DEPS:    git diff --stat package-lock.json   # must be empty
         git diff -U0 package.json           # only the "version" line
```

Baseline measured at `489e1e5`: `npm test` → 99 pass / 0 fail;
`npm run lint` → 1 warning, 0 errors (pre-existing, in
`src/store/ProjectContext.tsx`, a forbidden file — do not "fix" it).

### 0.3 Why gates are greps, not new tests

The spec forbids modifying `src/**/*.test.ts`, and §9 Functional 1 pins the
suite at exactly 99 cases — so a new test file is also out (it would change the
count). The test-first discipline is preserved by running an executable
assertion *before* the edit, observing the expected failure, then re-running it
after. Every gate below is such a command. None of them create files.

### 0.4 Baseline facts this plan depends on

Verified by reading the repo at `489e1e5`:

- There are **no `--pb-*` custom properties yet**. The existing palette uses
  `--bg`, `--bg-elevated`, `--bg-card`, `--bg-card-hover`, `--bg-topbar`,
  `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-dim`,
  `--primary`, `--primary-hover`, `--primary-soft`, `--primary-on`, `--danger`,
  `--danger-soft`, `--warn`, `--warn-soft`, `--success`, `--success-soft`,
  `--radius`, `--radius-sm`, `--shadow`, `--font`, `--mono`, `--touch`,
  `--max`, `--status-{idea,planned,in_progress,paused,done,archived}`,
  `--status-on`, `--focus-ring`. Declared at `src/index.css:4-41` (dark) and
  `43-74` (light).
- **No `.tsx` file reads a CSS variable.** The only three inline styles are
  `style={{ width: ... }}` in `ProjectCard.tsx:84`, `StatsPanel.tsx:24`,
  `ProjectDetail.tsx:219`. The spec's "CSS variable renames breaking inline
  styles" risk is therefore inert; the alias step still runs, but as insurance
  for `index.html` / `manifest` literals, not `.tsx`.
- `src/index.css` is 2689 lines. It has **no** global `:focus-visible` rule,
  **no** `@media print`, **no** `prefers-reduced-motion`, **no**
  `forced-colors` block. Those are all new.
- `backdrop-filter: blur(10px)` appears twice: `index.css:155` (`.topbar`) and
  `index.css:1958` (`.bottom-nav`). Both must go.
- `--shadow` is `0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)`
  and is applied at 9 sites. The inset highlight and the 24px blur both
  violate §4.7.
- `--max` is `1200px`; the spec's content column is `1180px`.
- `--font` is `'Inter', system-ui, …`. The spec mandates a system stack with no
  font download, so `'Inter'` must be dropped (it is not bundled; it only
  resolves if the OS happens to have it, which makes rendering
  machine-dependent).
- `.board-column` is `width: min(280px, 82vw); flex: 0 0 min(280px, 82vw)`
  (`index.css:1386`), gap `12px`, `.board-columns` padding `4px`,
  `.board-scroll` margin `0 -4px`, `.main:has(.board-page)` padding-inline
  `12px`. These numbers drive the Board overflow-parity gate (§4).
- `ACTIVE_STATUSES` has 4 entries; `PROJECT_STATUSES` has 6. The Board renders
  4 columns normally and 6 when `showCompleted` is on.
- `src/lib/dependencies.test.ts` reads `package.json` but asserts only on
  `dependencies['react-router']`, never on the app `version`. Bumping to
  `0.10.0` is test-safe.
- `Filters.tsx` persists `project-board-filters-open` (`'1'`/`'0'`). This is a
  pre-existing third localStorage key. Keep it exactly; it is not a new key.

---

## 1. Measured contrast ledger

Spec §8 requires measurement against final token values, not assumption. The
ratios below were computed from the spec's §4 hex values using the WCAG 2.x
relative-luminance formula. They are the **target values** for the stage 7
check: the checker must reproduce them, and any drift means a token changed.

### 1.1 Dark — text on surface (needs ≥4.5:1 body, ≥3:1 large)

| Foreground | sunken `#0a0c0f` | base `#101318` | raised `#161a20` | overlay `#1c2128` | hover `#1e232b` |
|---|---|---|---|---|---|
| `--pb-text` `#e7eaef` | 16.24 | 15.43 | 14.48 | 13.42 | 13.09 |
| `--pb-text-secondary` `#a8b0bd` | 8.96 | 8.52 | 7.99 | 7.41 | 7.22 |
| `--pb-text-muted` `#8590a0` | 6.06 | 5.76 | 5.40 | 5.00 | **4.88** |
| `--pb-accent` `#5b8def` | 6.06 | 5.76 | 5.41 | 5.01 | **4.89** |
| `--pb-accent-hover` / `--pb-focus-ring` `#7aa4f5` | 7.89 | 7.49 | 7.03 | 6.52 | 6.36 |
| `--pb-signal-danger` `#d4705e` | 5.85 | 5.56 | 5.22 | 4.84 | **4.72** |
| `--pb-signal-warn` `#d2a349` | 8.46 | 8.04 | 7.55 | 6.99 | 6.82 |
| `--pb-signal-ok` `#5f9e7a` | 6.21 | 5.90 | 5.54 | 5.13 | 5.00 |

Every pairing clears 4.5:1. The tightest is `--pb-signal-danger` on
`--pb-surface-hover` at 4.72 — that pairing is real (a danger label inside a
hovered project card), so it is an explicit stage 7 check, not an incidental
one. `--pb-text-muted` measures **5.76** on base, comfortably above the ≥4.6
the spec claimed for it; no adjustment needed, and spec §13's "lighten it if it
measures under 4.5" contingency does not fire.

### 1.2 Dark — status hues (spine / rule / dot fills only)

| Token | base | raised | hover |
|---|---|---|---|
| `--pb-status-idea` `#8b94a6` | 6.10 | 5.72 | 5.17 |
| `--pb-status-planned` `#6d8fd0` | 5.75 | 5.40 | 4.88 |
| `--pb-status-progress` `#d2a349` | 8.04 | 7.55 | 6.82 |
| `--pb-status-paused` `#a37f5f` | 5.10 | 4.79 | **4.33** |
| `--pb-status-done` `#5f9e7a` | 5.90 | 5.54 | 5.00 |
| `--pb-status-archived` `#5a616e` | **2.99** | **2.80** | **2.53** |

`--pb-status-paused` fails 4.5:1 on `--pb-surface-hover` and
`--pb-status-archived` fails on every surface. **This does not require a token
change**, because every concrete rule in spec §6 puts the status hue on a
*non-text* element and keeps the meaning in an adjacent text label:

- Dashboard project card — hue on the `3px` left spine; the status **label**
  sits in the meta row in `--pb-text-secondary` (7.99 on raised).
- Board — hue on the column header's `2px` bottom rule; the header **label** is
  `--pb-text`.
- Due soon — hue on the leading `8px` dot; the words "due in 3 days" /
  "overdue 2 days" are `--pb-signal-warn` / `--pb-signal-danger`.
- Health badges — border **and** text in the status hue, but health badges only
  ever use danger / warn / ok, which all clear 4.5:1.

Under WCAG 1.4.11 a graphical object whose information is also available in
text is exempt, so the spine/rule/dot fills carry no contrast floor. Spec §4.4
says exactly this ("Status color is decorative reinforcement only. Every
status/health indicator keeps its visible text label"). The consequence is a
hard implementation rule, enforced by the stage 7 gate in §7.3:

> **No `--pb-status-*` token may be used as a `color:` value.** They appear
> only in `background`, `border-color`, `border-left-color`, and
> `border-bottom-color`.

### 1.3 Light — text on surface

| Foreground | sunken `#ecece7` | base `#f5f5f2` | raised `#fbfbf9` | overlay `#ffffff` | hover `#efeee8` |
|---|---|---|---|---|---|
| `--pb-text` `#1a1e24` | 14.12 | 15.32 | 16.15 | 16.73 | 14.39 |
| `--pb-text-secondary` `#4c545f` | 6.47 | 7.01 | 7.40 | 7.66 | 6.59 |
| `--pb-text-muted` `#626b77` | **4.56** | 4.94 | 5.21 | 5.40 | **4.65** |
| `--pb-accent` `#2c5fd0` | 4.85 | 5.26 | 5.55 | 5.75 | 4.94 |
| `--pb-accent-hover` / ring `#1f4db5` | 6.36 | 6.90 | 7.27 | 7.53 | 6.51 |
| `--pb-signal-danger` `#a83c2a` | 5.30 | 5.75 | 6.06 | 6.28 | 5.40 |
| `--pb-signal-warn` `#8a6410` | **4.53** | 4.92 | 5.18 | 5.37 | **4.62** |
| `--pb-signal-ok` `#2f6b4c` | 5.32 | 5.78 | 6.09 | 6.31 | 5.43 |

Every light pairing clears 4.5:1. The two tightest are `--pb-text-muted` on
sunken (4.56) and `--pb-signal-warn` on sunken (4.53) — both real (muted
placeholder text inside a sunken input; a warn label inside a sunken trough).
Note this **inverts the spec's §12 risk expectation**: light theme is not the
weak side. Dark's `--pb-signal-danger`-on-hover (4.72) is the tightest pairing
in the whole system. Stage 7 measures both regardless.

### 1.4 Three token decisions the spec leaves open or under-specifies

These are recorded here so no stage invents them. Each is a gap or a
measurement failure, not a redesign.

**(a) `--pb-line-strong` must be raised in both themes — measurement failure.**
Spec §6 assigns `--pb-line-strong` to the input border; spec §8 requires
borders that identify a UI component to clear 3:1 against adjacent surfaces.
The §4.1 value `#3a414d` measures 1.91 / 1.81 / 1.70 / 1.57 / 1.54 against
sunken / base / raised / overlay / hover — a clear fail. §8 explicitly governs
("must be measured against the final token values, not assumed from this
document"), so the value changes:

| Theme | Spec value | Plan value | vs sunken | base | raised | overlay | hover |
|---|---|---|---|---|---|---|---|
| dark | `#3a414d` | **`#666f80`** | 3.87 | 3.68 | 3.45 | 3.20 | 3.12 |
| light | *(undefined in §4.5)* | **`#86837c`** | 3.19 | 3.46 | 3.65 | 3.78 | 3.25 |

Side effect, accepted: `--pb-line-strong` is also the card hover border, which
becomes more visible. That is an improvement, not a regression.
`--pb-line` (1.42 dark / 1.26 light) and `--pb-line-subtle` (1.23 / 1.14) stay
at their spec values — they are decorative dividers, never the sole identifier
of a control, and the `forced-colors` block in stage 1 covers the case where a
user drops custom colors.

**(b) Light theme needs `--pb-text-inverse: #ffffff` — spec gap.** §4.2 defines
`--pb-text-inverse #0d1014` for dark only; §4.5 omits it. Dark ink on the light
accent `#2c5fd0` measures **3.32** and fails. White on `#2c5fd0` measures
**5.75**, and on `--pb-accent-hover` `#1f4db5` measures **7.53**. Use white.

**(c) Light theme needs `--pb-surface-hover: #efeee8` — spec gap.** §4.5 omits
it. `#efeee8` sits between light sunken and base and holds every foreground
above 4.5:1 (column in §1.3). `--pb-scrim rgba(6, 8, 11, 0.72)` is shared by
both themes as specified — a dark scrim over light content is correct, and it
is not a text pairing.

---

## 2. Board overflow parity — the one arithmetic risk

Spec §6 gives Board column `min-width 264px` desktop / `240px` <768px. Spec §12
requires "keep 6-column total width ≥ v0.9 at every breakpoint" so
`boardScrollHint` gating is unchanged. Taken as literal *widths*, 264/240 are
**narrower** than v0.9's `min(280px, 82vw)`, which shrinks total width and
breaks §12.

Both hold only if 264/240 are read as what they say — **minimums** — and the
effective basis stays at the v0.9 value:

```css
.board-column {
  flex: 0 0 min(280px, 82vw);
  width: min(280px, 82vw);
  min-width: 240px;            /* spec floor, narrow */
}
@media (min-width: 768px) {
  .board-column { min-width: 264px; }
}
```

Arithmetic: `82vw` is 262.4px at 320px viewport and 319.8px at 390px, so the
narrow width is 262.4px at 320px (the 240px floor never binds) and 280px from
342px upward. On desktop `82vw ≥ 629px`, so width is 280px and the 264px floor
never binds. **Total width is bit-identical to v0.9 at every breakpoint**, so
overflow triggers identically and hint gating is provably unchanged.

Do **not** instead set `width: 264px` / `240px`. The §7 gate below would catch
it, but the failure mode is subtle: the hint would still appear at narrow
widths (4 columns × 240px + 3 × 12px = 1044px still overflows a 304px
scroller), so a casual check passes while the §12 contract is silently broken.

Measured six-column scroll widths this plan must reproduce (`showCompleted`
on, `6 × w + 5 × 12 + 8` padding):

| Viewport | Column w | 6-col scrollWidth | Approx clientWidth | Overflows |
|---|---|---|---|---|
| 320 | 262.4 | 1642 | 304 | yes |
| 390 | 280 | 1748 | 374 | yes |
| 768 | 280 | 1748 | 752 | yes |
| 1024 | 280 | 1748 | 1008 | yes |
| 1440 | 280 | 1748 | 1424 | yes |

Four-column (`showCompleted` off) scrollWidth is `4 × 280 + 3 × 12 + 8 = 1164`,
which overflows at 320 / 390 / 768 / 1024 and **fits** at 1440 (1424 client,
1164 content) — same as v0.9. The narrow hint is scoped to ≤767px, so this
does not affect gating.

---

## 3. Dependency-aware stage order

```
Stage 0  baseline capture ─────────────────────────────┐
Stage 1  tokens + base + a11y blocks (index.css only)  │ blocks everything
   │                                                    │
   ├── Stage 2  shell (Layout, index.html, manifest, version)
   │      │  blocks 3-6: every page renders inside the shell's
   │      │  content column, sticky bar, and bottom-bar inset
   │      ├── Stage 3  Dashboard  (KpiRow, Filters, DueSoonStrip,
   │      │              ProjectCard, StatsPanel, RecentActivity,
   │      │              Onboarding, EmptyState)
   │      ├── Stage 4  Board      (Board, BoardColumn, BoardCard)
   │      │              depends on 3 only for shared .status-* and
   │      │              progress-hairline rules introduced there
   │      ├── Stage 5  Detail / Review / Activity
   │      │              depends on 3 (ledger strip reused by Review,
   │      │              timeline shared by RecentActivity + Activity)
   │      └── Stage 6  Settings / NewProject / dialogs / print
   │                     depends on 2 (dialog surfaces) and 5 (form rows
   │                     share the field grid used by Detail's meta)
   └── Stage 7  sweep: alias removal, contrast measurement, five-width capture
          │
          Stage 8  release gate
```

Stages 3–6 are independent of each other **except** for the shared rules noted
above; run them in the listed order so shared CSS lands once. Stage 7 cannot
start until 2–6 are all merged, because alias removal needs the final grep
surface.

---

## Stage 0 — Baseline capture

**Files / symbols:** none (read-only).

**Edits:** none.

**Gate:**

```bash
# RED/GREEN are the same here — this stage only records the "before".
npm test 2>&1 | tail -6            # expect: # pass 99 / # fail 0
npm run lint 2>&1 | tail -2        # expect: Found 1 warning and 0 errors.
npm run build                      # expect: exit 0
git status --porcelain             # expect: empty
grep -c 'backdrop-filter' src/index.css        # expect: 2
grep -c 'box-shadow: var(--shadow)' src/index.css  # expect: 9
grep -c -- '--pb-' src/index.css               # expect: 0
```

Then capture reference screenshots of the current UI at 320 / 390 / 768 / 1024 /
1440, dark and light, for `/`, `/board`, `/review`, `/activity`,
`/project/:id`, `/new`, `/settings` (seed data loaded via
Settings → "Load realistic inventory (replace)"). Store outside the repo.

**Preservation checkpoint:** none yet — this *is* the reference.

**Done when:** all six gate commands produce the stated output and the 70
reference screenshots exist.

---

## Stage 1 — Token foundation

**Files / symbols:**

- `src/index.css` region `:root, [data-theme='dark']` (lines 4–41)
- `src/index.css` region `[data-theme='light']` (lines 43–74)
- `src/index.css` base reset region (lines 76–136: `*`, `html/body/#root`,
  `body`, `a`, `a:hover`, `button/input/select/textarea`, `button`, `code`,
  `.sr-only`)

**Edits:**

1. In the dark block, add the full `--pb-*` set as the **canonical** tokens:
   all of §4.1, §4.2, §4.3, §4.4, plus §4.7's `--pb-space-{2,4,6,8,12,16,20,24,32,40}`,
   `--pb-radius-sm: 4px`, `--pb-radius: 6px`, `--pb-radius-lg: 10px`,
   `--pb-radius-pill: 999px`, `--pb-dur-fast: 110ms`, `--pb-dur: 160ms`,
   `--pb-ease: cubic-bezier(0.2, 0, 0.2, 1)`,
   `--pb-elev: 0 1px 2px rgba(0, 0, 0, 0.35)`,
   `--pb-elev-dialog: 0 12px 32px rgba(0, 0, 0, 0.45)`, and the §4.6 type
   scale as `--pb-font-{title,section,item,body,meta,kpi}` size/weight/tracking
   triplets. Use `--pb-line-strong: #666f80` per §1.4(a).
2. In the light block, mirror §4.5 plus the three §1.4 fills:
   `--pb-line-strong: #86837c`, `--pb-text-inverse: #ffffff`,
   `--pb-surface-hover: #efeee8`. `--pb-scrim` is declared once in the dark
   block and inherited (not redeclared) by light.
3. Add `--pb-font-stack: ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
   Roboto, 'Helvetica Neue', Arial, sans-serif` and keep `--mono` as-is.
4. **Alias the legacy names to the new tokens** in both blocks so nothing
   breaks mid-flight. Direction: legacy name → `var(--pb-*)`. Full map:

   | Legacy | Alias target |
   |---|---|
   | `--bg` | `var(--pb-surface-base)` |
   | `--bg-elevated` | `var(--pb-surface-raised)` |
   | `--bg-card` | `var(--pb-surface-raised)` |
   | `--bg-card-hover` | `var(--pb-surface-hover)` |
   | `--bg-topbar` | `var(--pb-surface-base)` |
   | `--border` | `var(--pb-line)` |
   | `--border-strong` | `var(--pb-line-strong)` |
   | `--text` | `var(--pb-text)` |
   | `--text-muted` | `var(--pb-text-secondary)` |
   | `--text-dim` | `var(--pb-text-muted)` |
   | `--primary` | `var(--pb-accent)` |
   | `--primary-hover` | `var(--pb-accent-hover)` |
   | `--primary-soft` | `var(--pb-accent-quiet)` |
   | `--primary-on` | `var(--pb-text-inverse)` |
   | `--danger` / `--warn` / `--success` | `var(--pb-signal-danger/warn/ok)` |
   | `--danger-soft` / `--warn-soft` / `--success-soft` | 14%-opacity washes of the matching signal |
   | `--radius` | `var(--pb-radius)` |
   | `--radius-sm` | `var(--pb-radius-sm)` |
   | `--shadow` | `var(--pb-elev)` |
   | `--font` | `var(--pb-font-stack)` |
   | `--max` | `1180px` |
   | `--status-idea` … `--status-archived` | `var(--pb-status-idea)` … `var(--pb-status-archived)` (note `--status-in_progress` → `--pb-status-progress`) |
   | `--status-on` | `var(--pb-text-inverse)` |
   | `--focus-ring` | `var(--pb-focus-ring)` |

   `--text-dim` deliberately collapses onto `--pb-text-muted`: §4.2 forbids a
   fourth text token. `--focus-ring` also changes from a translucent
   `rgba(...)` to an opaque hue, which is required for the 3:1 outline.
5. `body`: `font-family: var(--pb-font-stack)`; `font-size: 0.875rem`;
   `line-height: 1.5`; `background: var(--pb-surface-base)`;
   `color: var(--pb-text)`. Add `font-variant-numeric: normal` at body and
   `tabular-nums` on the specific numeric classes in later stages.
6. `code`: `background: var(--pb-surface-sunken)`;
   `border-radius: var(--pb-radius-sm)`.
7. Add four new global blocks immediately after `.sr-only`:

```css
:focus-visible {
  outline: 2px solid var(--pb-focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}

@media (forced-colors: active) {
  .project-card, .board-card, .board-column, .chip, .kpi-ledger,
  input, select, textarea, .badge, .link-chip, .menu-sheet,
  .shortcut-panel, .import-panel {
    border: 1px solid CanvasText;
  }
}

@media print {
  body { background: #fff; color: #000; }
  .topbar, .bottom-nav, .app-footer, .toast, .menu-sheet,
  .menu-backdrop, .filters { display: none !important; }
  .project-card, .panel, .kpi-ledger { border: 1px solid #000; }
}
```

8. Replace `--shadow`'s definition (no inset highlight, ≤2px blur) — done via
   the alias in (4). Delete `backdrop-filter: blur(10px)` at `.topbar`
   (line 155) and set `background: var(--pb-surface-base)`; the `.bottom-nav`
   occurrence at line 1958 is removed in stage 2.

**Gate:**

```bash
# RED (before edit)
grep -c -- '--pb-surface-base' src/index.css          # 0  → must become ≥1
grep -c 'outline: 2px solid var(--pb-focus-ring)' src/index.css  # 0
grep -c 'prefers-reduced-motion' src/index.css        # 0
grep -c 'forced-colors' src/index.css                 # 0
grep -c '@media print' src/index.css                  # 0
grep -c "'Inter'" src/index.css                       # 1  → must become 0

# GREEN (after edit)
test "$(grep -c 'prefers-reduced-motion' src/index.css)" = 1 && \
test "$(grep -c 'forced-colors' src/index.css)" = 1 && \
test "$(grep -c '@media print' src/index.css)" = 1 && \
test "$(grep -c "'Inter'" src/index.css)" = 0 && \
test "$(grep -c 'rgba(255, 255, 255, 0.04) inset' src/index.css)" = 0 && \
echo TOKENS-OK
grep -n 'backdrop-filter' src/index.css   # expect exactly 1 hit, line ~1958 (.bottom-nav, stage 2)
npm run build && npm test && npm run lint
```

**Preservation checkpoint:** No markup changed, so every behavior is
structurally intact. Prove rendering did not break: load `/` and `/board` in
dark, light, and system, and confirm no element renders transparent-on-
transparent or with a missing background (the failure mode of a bad alias).
Toggle the OS light/dark preference with theme = `system` and confirm the
palette follows without reload.

**Done when:** the whole existing UI renders in the new palette with **zero**
`.tsx` diffs, `git diff --stat` shows only `src/index.css`, build/test/lint
match baseline, and the focus ring is visible on every interactive element on
`/settings` when tabbing through.

---

## Stage 2 — Shell

**Files / symbols:**

- `src/components/Layout.tsx` — `Layout`, `PRIMARY_NAV`, `navClass`,
  `tabClass`, the `<header className="topbar">` region, the
  `<footer className="app-footer">` region
- `src/index.css` regions `.topbar` … `.brand-mark` (145–185), `.nav` /
  `.nav-link` (187–211), `.main` (252–259), `.app-footer` (261–278),
  `.bottom-nav` (281–283), the `@media (max-width: 767px)` bottom-bar and
  menu-sheet region (1889–2100)
- `src/version.ts` — `APP_VERSION`
- `package.json` — `version`
- `index.html` — `<meta name="theme-color">`
- `public/manifest.webmanifest` — `background_color`, `theme_color`

**Edits:**

1. `src/version.ts`: `APP_VERSION = '0.10.0'`. `package.json`:
   `"version": "0.10.0"`. Nothing else in `package.json`.
2. `index.html`: `theme-color` `#0f1218` → `#101318`. Leave the pre-paint
   theme script byte-identical — it is behavior, and it reads
   `project-board-v1`.
3. `public/manifest.webmanifest`: `background_color` and `theme_color`
   `#0f1218` → `#101318`. No other field.
4. `.topbar`: height `48px` (`padding: 0 var(--pb-space-16)`),
   `background: var(--pb-surface-base)`,
   `border-bottom: 1px solid var(--pb-line-subtle)`, keep
   `position: sticky; top: 0; z-index: 20`. **Remove `backdrop-filter`.**
5. `.brand-text`: `font-size: 13px`, `letter-spacing: 0.06em`,
   `font-weight: 600`, `text-transform: none`. Keep the `.brand-mark` glyph.
6. `.nav-link`: plain text, `color: var(--pb-text-secondary)`, no background,
   no border-radius. `.nav-link.active`: `color: var(--pb-text)` plus
   `box-shadow: inset 0 -2px 0 var(--pb-accent)` (a bottom rule that does not
   shift layout). Delete any pill/filled treatment.
7. `.main`: `max-width: var(--max)` (now 1180px); padding-inline `24px` at
   ≥1024, `16px` at ≥768, `12px` below 768 — implemented as a base of `12px`
   with two `min-width` media queries so the 320px case needs no override.
8. `.app-footer`: single line, `border-top: 1px solid var(--pb-line-subtle)`,
   `color: var(--pb-text-muted)`, `font-size: 0.75rem`. Change the markup in
   `Layout.tsx` from two spans to the spec string:
   `Project Board v{APP_VERSION} · local-first · data stays in this browser`,
   keeping `aria-label={`Version ${APP_VERSION}`}` on the version span so the
   existing accessible name survives.
9. `.bottom-nav` (in the ≤767px block): height
   `calc(56px + env(safe-area-inset-bottom, 0px))`,
   `background: var(--pb-surface-raised)`,
   `border-top: 1px solid var(--pb-line-subtle)`. **Remove
   `backdrop-filter: blur(10px)` (line 1958).** `.bottom-tab`: keep
   `min-height: var(--touch)`, label `11px`, `.bottom-tab.active` →
   `color: var(--pb-accent-hover)` with
   `box-shadow: inset 0 2px 0 var(--pb-accent)` and **no** `--pb-accent-quiet`
   background fill (accent-budget rule: the header's `+ New` button is the one
   accent fill per view).
10. `.menu-sheet`: `background: var(--pb-surface-overlay)`,
    `border-left: 1px solid var(--pb-line)`,
    `box-shadow: var(--pb-elev-dialog)`, transition
    `transform var(--pb-dur) var(--pb-ease)`. `.menu-backdrop`:
    `background: var(--pb-scrim)`, no blur. Do not change `hidden`,
    `role`, `aria-modal`, `tabIndex`, or any ref.
11. `.app-footer` bottom padding on mobile keeps the
    `calc(12px + 56px + env(safe-area-inset-bottom, 0px))` clearance.

**Gate:**

```bash
# RED
grep -c 'backdrop-filter' src/index.css                  # 1  → must become 0
grep -n "0.9.0" src/version.ts package.json              # 2 hits
grep -c '#0f1218' index.html public/manifest.webmanifest # 1 and 2

# GREEN
test "$(grep -c 'backdrop-filter' src/index.css)" = 0 && \
test "$(grep -c "0.10.0" src/version.ts)" = 1 && \
node -e "if(require('./package.json').version!=='0.10.0')process.exit(1)" && \
test "$(grep -c '#0f1218' index.html)" = 0 && \
test "$(grep -c '#0f1218' public/manifest.webmanifest)" = 0 && \
test "$(grep -c '#101318' public/manifest.webmanifest)" = 2 && \
echo SHELL-OK
git diff -U0 package.json      # only the version line
git diff --stat package-lock.json   # empty
npm run build && npm test && npm run lint
```

**Preservation checkpoint:** all seven shortcuts and the dialog focus
lifecycle run through `Layout`. With `PREVIEW` running:

- Press `n` `/` `b` `d` `r` `a` `?` from `/` — all seven fire. Type `n` and `?`
  inside the search field and inside a notes textarea — neither fires.
- At 390px: open the actions menu, confirm focus lands on the close button,
  `Tab` and `Shift+Tab` wrap inside the sheet, `Escape` closes, focus returns
  to the hamburger. Repeat for the `?` dialog: focus in, wrap both ways,
  `Escape`, focus restored to whatever was focused when `?` was pressed.
- Confirm `useDialogFocus.ts` and `dialogFocus.ts` are absent from
  `git diff --name-only`.

**Done when:** the gate passes, the footer reads
`Project Board v0.10.0 · local-first · data stays in this browser`, the header
is 48px and opaque while scrolling `/activity` with 100 events, the bottom bar
shows at 767px and is gone at 768px, every bottom tab measures ≥44×44 at 320px,
and `git diff --name-only` lists only `Layout.tsx`, `index.css`, `version.ts`,
`package.json`, `index.html`, `manifest.webmanifest`.

---

## Stage 3 — Dashboard

**Files / symbols:**

- `src/components/KpiRow.tsx` — `KpiRow`
- `src/components/Filters.tsx` — `Filters` (JSX only; leave `readStoredOpen`,
  `writeStoredOpen`, `defaultOpen`, `FILTERS_OPEN_KEY`, `DESKTOP_MQ` untouched)
- `src/components/DueSoonStrip.tsx` — `DueSoonStrip`, `dueLabel`
- `src/components/ProjectCard.tsx` — `ProjectCard`
- `src/components/HealthBadges.tsx` — `HealthBadges`
- `src/components/StatsPanel.tsx` — `StatsPanel`, `Bars`
- `src/components/RecentActivity.tsx` — `RecentActivity`
- `src/components/Onboarding.tsx` — `Onboarding`
- `src/components/EmptyState.tsx` — `EmptyState`
- `src/pages/Dashboard.tsx` — the `return` JSX only: `.page-header`,
  `.banner-nudge`, and a new `.dash-layout` / `.dash-main` / `.dash-rail`
  wrapper. **No hook, memo, callback, or filter logic may change.**
- `src/index.css` regions `.page-header`–`.muted` (369–387), `.kpi-*`
  (390–435), `.filters*` (438–530, 2271–2338), `.card-grid` (561–578),
  `.project-card`–`.progress-*` (580–822), `.stats-panel`–`.stat-bar-pct`
  (825–900), `.empty-*` (903–920), `.due-soon-*` (2339–2440),
  `.onboarding*` (1666–1710), `.recent-activity*` (1712–1786),
  `.banner-nudge*` (1227–1262)

**Edits:**

1. **KPI ledger.** `KpiRow`: replace the four `.kpi-card` divs with one
   `<div className="kpi-ledger">` containing four
   `<div className="kpi-cell">` (`.kpi-cell` + `.kpi-figure` + `.kpi-label`).
   Keep `aria-label="Key metrics"`, the four labels, `stats.*` values, and the
   `kpi-hint` " hidden" suffix verbatim. Keep the danger modifier as
   `kpi-cell kpi-cell-danger`. CSS: `.kpi-ledger` is one
   `--pb-surface-raised` panel, `1px --pb-line`, `--pb-radius`,
   `display: grid`, cells separated by
   `border-left: 1px solid var(--pb-line-subtle)` (first cell none) — no
   per-cell background, border-radius, or shadow. `grid-template-columns:
   repeat(2, 1fr)` at base (the 320px 2×2), `repeat(4, 1fr)` at ≥768px.
   `.kpi-figure`: `font-size: 1.75rem; line-height: 1.05; font-weight: 620;
   letter-spacing: -0.02em; font-variant-numeric: tabular-nums`.
   `.kpi-label`: the §4.6 section-label style (`0.6875rem`, uppercase, 600,
   `0.09em`).
2. **Filter toolbar.** `.filters`: drop card background/shadow, become
   `border-block: 1px solid var(--pb-line-subtle)` with no radius.
   `.chip`: `border-radius: var(--pb-radius-sm)`,
   `border: 1px solid var(--pb-line)`, `height: 28px` at ≥768,
   `min-height: 36px` below (the existing ≤767 rule already sets
   `min-height: var(--touch)`; **raise it to 44px there, not lower it** — §7's
   390px row requires ≥44×44, and the spec's `36px` touch figure conflicts
   with its own §8 target floor; the 44px floor wins, recorded in §9).
   `.chip.active`: `background: var(--pb-accent-quiet)`,
   `border-color: var(--pb-accent)`, `color: var(--pb-text)`.
   `.filters-badge`: `border-radius: var(--pb-radius-pill)`,
   `background: var(--pb-accent-quiet)`, `color: var(--pb-text)`,
   `font-variant-numeric: tabular-nums`. Leave `aria-expanded`,
   `aria-controls`, `hidden`, and the `useId` panel id alone.
3. **Due soon.** `DueSoonStrip`: wrap in a section-label header
   (`.section-label` + count), and give each row a leading
   `<span className={`status-dot status-${p.status}`} aria-hidden />` before
   the title. Keep `dueLabel`'s exact strings (`"3d overdue"`, `"Due today"`,
   `"Due tomorrow"`, `"Due in 3d"`) — they already satisfy §6's "words always
   present" requirement, so do not reword them. `.due-soon-item-meta`:
   right-aligned, `font-variant-numeric: tabular-nums`, colored
   `--pb-signal-danger` when `.due-overdue`, `--pb-signal-warn` when
   `.due-soon`. Rows are hairline-divided, no card.
4. **Project card.** `ProjectCard` JSX reorder to spec §6: title row
   (`.card-title` + star button) → meta row (`.card-meta`: status label · type
   label · tags) → progress hairline row → `LinkChips` (max 2, unchanged) →
   `.card-quick` actions. Move the `<h3 className="card-title">` and star into
   a single `.card-head`; the status text moves from `.status-chip` into
   `.card-meta` as plain `--pb-text-secondary` text. Add
   `<span className={`card-spine status-${project.status}`} aria-hidden />` or
   equivalent `border-left: 3px solid` driven by a
   `data-status={project.status}` attribute on `<article>` — prefer the data
   attribute so no extra DOM node is added:

   ```css
   .project-card { border-left: 3px solid var(--pb-line); }
   .project-card[data-status='idea']        { border-left-color: var(--pb-status-idea); }
   .project-card[data-status='planned']     { border-left-color: var(--pb-status-planned); }
   .project-card[data-status='in_progress'] { border-left-color: var(--pb-status-progress); }
   .project-card[data-status='paused']      { border-left-color: var(--pb-status-paused); }
   .project-card[data-status='done']        { border-left-color: var(--pb-status-done); }
   .project-card[data-status='archived']    { border-left-color: var(--pb-status-archived); }
   ```

   Progress: replace `.progress-track`/`.progress-fill` with a `2px`
   square-ended hairline (`border-radius: 0`) plus
   `12/18 steps · 67%` beside it in `--pb-text-muted` with
   `tabular-nums`. Keep the `style={{ width: `${project.progress_pct}%` }}`
   inline style and `aria-hidden` on the track exactly as-is.
   Card: `--pb-surface-raised`, `--pb-radius`, `1px --pb-line`,
   `box-shadow: none`. Hover → `--pb-surface-hover` + `--pb-line-strong`.
5. **Hover-vs-focus actions.** `.card-quick` buttons stay rendered and
   focusable always. Fade only inside a hover-capable query, with a mandatory
   focus override:

   ```css
   @media (hover: hover) and (min-width: 768px) {
     .project-card .card-quick { opacity: 0.55; transition: opacity var(--pb-dur-fast) var(--pb-ease); }
     .project-card:hover .card-quick,
     .project-card:focus-within .card-quick,
     .project-card .card-quick:focus-visible,
     .project-card .card-quick:has(:focus-visible) { opacity: 1; }
   }
   ```

   Never `visibility: hidden`, never `display: none`, never `pointer-events:
   none`. Below 768px and on touch the actions are always fully opaque.
6. **Grid.** `.card-grid`: 1 column base, `repeat(2, 1fr)` at ≥768px,
   `repeat(3, 1fr)` at ≥1120px, unchanged at 1440 (no 4th column). Replace the
   existing `640px` / `1000px` breakpoints.
7. **Rail.** In `Dashboard.tsx`, wrap the projects grid and the
   `RecentActivity` / `StatsPanel` pair so DOM order is main-then-rail:
   `<div className="dash-layout"><div className="dash-main">…grid…</div>
   <aside className="dash-rail">…RecentActivity, StatsPanel…</aside></div>`.
   CSS: single column below 1120px (rail flows after main, matching DOM order,
   so tab order needs no fix), `grid-template-columns: minmax(0, 1fr) 300px` at
   ≥1120px. `StatsPanel` and `RecentActivity` lose `.panel` chrome and become
   `.section-label` + hairline rule + list. `.stat-bar-fill` keeps its inline
   width style.
8. **Notice bands.** `Onboarding`: `.onboarding-card` → hairline band with
   `border-left: 3px solid var(--pb-accent)`, no shadow, no radius on the left
   edge. `.banner-nudge`: same band with
   `border-left: 3px solid var(--pb-signal-warn)`. Keep `role="status"`, the
   two exact copy variants, the three action buttons, and the
   `dismissBackupNudge` → `sessionStorage` behavior untouched.
9. `HealthBadges`: `.badge*` become hairline chips —
   `background: transparent`, `border: 1px solid` + `color:` in
   `--pb-signal-danger` (overdue), `--pb-signal-warn` (at risk / idle),
   `--pb-text-muted` (`badge-muted` step count). Keep every `title` attribute
   and label string.

**Gate:**

```bash
# RED
grep -c 'kpi-ledger' src/components/KpiRow.tsx        # 0 → must become 1
grep -c 'data-status' src/components/ProjectCard.tsx  # 0 → must become 1
grep -c 'dash-rail' src/pages/Dashboard.tsx           # 0 → must become 1

# GREEN — structure
test "$(grep -c 'kpi-card' src/components/KpiRow.tsx)" = 0 && \
test "$(grep -c 'hover: hover' src/index.css)" -ge 1 && \
test "$(grep -c 'visibility: hidden' src/index.css)" = 0 && \
echo DASH-OK

# GREEN — logic untouched (byte-identical hook bodies)
git diff src/pages/Dashboard.tsx | grep -E '^[-+].*(useMemo|useCallback|useEffect|setSearchParams|filtersToSearchParams|filtersFromSearchParams|sortProjects|matchesFocusThisWeek|computeStats|getDueSoonProjects)' \
  && echo 'FAIL: dashboard logic touched' || echo 'OK: logic untouched'

npm run build && npm test && npm run lint
```

**Preservation checkpoint:** every URL filter param must still round-trip.
With `PREVIEW` and seed data loaded, open each and confirm the stated effect
and that the chips/selects reflect it:

```
/?status=in_progress
/?type=game&q=orbit
/?showCompleted=1&status=done
/?tag=portfolio&sort=title&dir=asc
/?focus=1
/?status=archived&type=web&tag=portfolio&q=roxy&sort=deadline&dir=desc&showCompleted=1&focus=1
```

Then: toggle a chip and confirm the URL updates with `replace` (no history
entry added — press Back once and you leave `/`). Collapse the filters panel,
reload, confirm it is still collapsed (`project-board-filters-open` === `'0'`).
Star a project and confirm it sorts to the top. Archive a card and confirm the
5-second Undo toast restores the previous status. Quick-add a step from a card
and confirm the progress figure changes. Duplicate a card and confirm the copy
is `idea` with steps unchecked. Tab through one card: star → main link →
each link chip → `+ step` → Duplicate → Archive, all with a visible ring.

**Done when:** the gate passes, the four QA behaviors above hold, the KPI strip
is 2×2 at 320px and one 4-cell row at 768px with hairlines and no gaps, no
project card has a `box-shadow`, and at 1440px the layout is a 3-up grid plus a
300px rail inside an 1180px column.

---

## Stage 4 — Board

**Files / symbols:**

- `src/components/BoardColumn.tsx` — `BoardColumn` (JSX only; every `on*` prop
  and `registerCardRef` wiring stays identical)
- `src/components/BoardCard.tsx` — `BoardCard` (JSX only; `draggable`,
  `tabIndex`, `data-project-id`, `aria-label`, `onFocus`, `onKeyDown`,
  `onDragStart`, `onDragEnd`, and the `e.detail === 0` link guard stay
  identical)
- `src/pages/Board.tsx` — the `return` JSX only. **`handleCardKeyDown`,
  `handleDrop`, `focusCard`, `registerCardRef`, all four `useEffect` blocks,
  `shouldShowBoardScrollHint`, `metrics`, `narrow`, `hintDismissed` and the
  `aria-live` div must be byte-identical after the edit.**
- `src/index.css` regions `.main:has(.board-page)`–`.board-scroll-hint`
  (1347–1588), the narrow board block (1589–1610), `.board-card-focused` /
  `.board-card:focus` (2510–2525)

**Edits:**

1. `.board-column`: `background: var(--pb-surface-sunken)`,
   `border-radius: var(--pb-radius-lg)`, `1px solid var(--pb-line)`, and the
   width rule from §2 **verbatim** (`flex: 0 0 min(280px, 82vw)` +
   `min-width: 240px`, raised to `264px` at ≥768px). Do not change
   `min-height` / `max-height`.
2. `.board-column-header`: `position: sticky; top: 0; z-index: 1`,
   `background: var(--pb-surface-sunken)`,
   `border-bottom: 2px solid` in the status hue via a `data-status` attribute
   on the header (same pattern as the card spine, `border-bottom-color`).
   Remove the separate `.status-dot` from `BoardColumn.tsx`'s header — the 2px
   rule replaces it, and §9 Visual 5 requires each status hue in *exactly one
   place per surface*. Title stays `--pb-text` with its `<h2>`.
   `.board-column-count`: `--pb-radius-pill`, `tabular-nums`,
   `color: var(--pb-text-muted)`, `background: var(--pb-surface-base)`.
3. `.board-card`: `padding: 10px 12px` on `.board-card-link`,
   `background: var(--pb-surface-raised)`, `1px solid var(--pb-line)`,
   `--pb-radius`, `box-shadow: none`. Content trimmed to title + one meta line
   + the 2px progress hairline. **Remove `.board-card-summary` rendering** and
   drop `HealthBadges` from the card footer, folding the deadline into the meta
   line. Keep the `aria-label` template string exactly:
   `` `${project.title}, ${TYPE_LABELS[project.type]}, ${project.progress_pct}%` ``.
   No status spine (the column carries status).
4. `.board-card-handle`: replace the `⋮⋮` glyph with a 2×3 dot grip —
   `background-image: radial-gradient(currentColor 1px, transparent 1px)`,
   `background-size: 4px 4px`, `width: 8px; height: 12px`,
   `color: var(--pb-text-muted)`. Keep `aria-hidden` and the
   `title="Drag to change status"`.
5. States: `.board-card-focused` gets
   `border-color: var(--pb-line-strong)` + `background: var(--pb-surface-hover)`
   **in addition to** the global `:focus-visible` ring — keep the existing
   `.board-card:focus:not(:focus-visible):not(.board-card-focused)` rule so a
   mouse click does not paint a ring. `.board-column-drop`:
   `box-shadow: inset 0 0 0 1px var(--pb-accent)`, no background fill, no
   `transform`, no `scale`.
6. Focus-ring clipping: add `scroll-padding-inline: 8px` to `.board-scroll`
   and keep `.board-columns` `padding: 4px` so the 2px ring + 2px offset never
   sits flush against the clip edge. `.board-column-body` keeps
   `overflow-y: auto`; add `scroll-padding-block: 4px` there for the same
   reason on vertical scroll.
7. `.board-scroll-hint`: `font-size: 0.75rem`,
   `color: var(--pb-text-muted)`, `border-top: 1px solid var(--pb-line-subtle)`,
   no left accent bar, no background, no radius. **The element's copy, its
   `id="board-scroll-hint"`, the `aria-describedby` wiring, and the
   `showScrollHint` condition are unchanged.**
8. Board stays full-bleed: keep `.main:has(.board-page) { max-width: none }`
   and set its padding-inline to the same 12/16/24 gutters as `.main`.

**Gate:**

```bash
# RED
grep -c 'scroll-padding-inline' src/index.css   # 0 → must become 1
grep -c 'radial-gradient' src/index.css         # 0 → must become 1

# GREEN — the three untouchable modules and the keyboard handler
git diff --name-only | grep -E 'boardKeyboard|boardScrollHint|dialogFocus|useDialogFocus' \
  && echo 'FAIL: forbidden module touched' || echo 'OK'
git diff src/pages/Board.tsx | grep -E '^[-+].*(isBoardKeyboardKey|resolveBoardKeyboardAction|shouldShowBoardScrollHint|BOARD_NARROW_QUERY|BOARD_HINT_DISMISS_SCROLL|aria-live|setLiveMessage|requestAnimationFrame)' \
  && echo 'FAIL: board behavior touched' || echo 'OK: behavior untouched'
test "$(grep -c 'min-width: 240px' src/index.css)" -ge 1 && \
test "$(grep -c 'min-width: 264px' src/index.css)" -ge 1 && \
test "$(grep -c 'min(280px, 82vw)' src/index.css)" -ge 1 && echo BOARD-WIDTH-OK
npm run build && npm test && npm run lint
```

**Preservation checkpoint** — run every §9.7 edge case plus the overflow parity
check. With `PREVIEW` and seed data:

1. **Overflow parity.** At 320 / 390 / 768 / 1024 / 1440, with `showCompleted`
   both off and on, run in the console:
   `const e=document.querySelector('.board-scroll'); console.log(innerWidth, e.scrollWidth, e.clientWidth, e.scrollWidth-e.clientWidth)`.
   Compare against the stage 0 baseline capture of the same expression. The
   `scrollWidth` values must match the v0.9 numbers **exactly** and the sign of
   `scrollWidth - clientWidth` must match at every width. Expected 6-column
   `scrollWidth`: 1642 at 320px, 1748 at 390/768/1024/1440.
2. **Hint gating.** At 390px the hint appears; scroll the board 24px sideways
   and it disappears and stays gone for the session; reload and it returns.
   At 1024px it never appears. Confirm
   `Object.keys(localStorage)` is exactly
   `["project-board-v1","project-board-activity-v1","project-board-filters-open"]`
   — no hint key. Confirm the hint is not reachable by `Tab` and has no
   `aria-live` / `role` attribute.
3. **Keyboard.** Focus the first card of the leftmost column: `←` and `h` must
   not scroll the page and must not change status. Focus the last card of a
   column: `↓` and `j` must not move focus and must not open the project. `→`
   moves status and the `aria-live` region announces
   `Moved to <Status>`; focus follows the card into its new column. `Enter` and
   `Space` open the focused project. Type `j` and `l` in the Dashboard search
   field — the field consumes them.
4. **Drag.** Drag a card to another column: the target column shows a 1px
   accent inset with no scale or rotation, and the drop changes status and logs
   one activity event.

**Done when:** the gate passes, all four checkpoint groups pass, and the Board
is visually a set of sunken troughs — distinguishable at a glance from the
Dashboard's card grid (§9 Visual 4).

---

## Stage 5 — Project Detail, Review, Activity

**Files / symbols:**

- `src/pages/ProjectDetail.tsx` — the non-editing `return` JSX: `.detail-nav`,
  `.detail-header`, `.detail-grid`, the five `<section className="panel">`
  blocks, `.meta-timestamps`. **`addLink`, `removeLink`, `softArchive`,
  `undoArchive`, the `getHealth` / `daysUntilDeadline` memos, the editing-mode
  early return, and every `updateProject` call stay identical.**
- `src/components/StepList.tsx` — `StepList` JSX. **`moveStep`, `applyDrop`,
  `handleAdd`, the `sorted` / `canReorder` / `hasDone` / `hasIncomplete` /
  `showBulk` derivations, and all drag handlers stay identical.**
- `src/pages/Review.tsx` — `ProjectListSection`, and the `return` JSX.
  **`computeReviewKpis`, `computeReviewBuckets`, `suggestReviewActions`,
  `handleSoftArchiveIdle` and its `window.confirm` string stay identical.**
- `src/pages/Activity.tsx` — the `<ol className="activity-feed">` region.
  **`TYPE_LABELS`, `formatWhen`, and the `activity.length` copy stay
  identical.**
- `src/components/RecentActivity.tsx` — timeline markup (shares CSS with
  Activity). `formatRelative` stays identical.
- `src/components/LinkChips.tsx` — chip borders only.
- `src/index.css` regions `.detail-nav`–`.detail-grid` (923–961), `.steps`–
  `.step-item-actions` (1016–1110), `.link-*` (1112–1226), `.panel` /
  `.panel-title` (838–853), `.panel-title-row`–`.md-preview a` (2104–2190),
  `.review-*` (2526–2605), `.activity-*` (1788–1888), `.recent-activity-*`
  (1712–1786)

**Edits:**

1. **Shared section primitive.** Add once:

   ```css
   .section-label {
     font-size: 0.6875rem; line-height: 1.2; font-weight: 600;
     letter-spacing: 0.09em; text-transform: uppercase;
     color: var(--pb-text-muted); margin: 0;
   }
   .section-head {
     display: flex; align-items: baseline; justify-content: space-between;
     gap: var(--pb-space-8);
     padding-bottom: var(--pb-space-6);
     border-bottom: 1px solid var(--pb-line-subtle);
     margin-bottom: var(--pb-space-12);
   }
   ```

   `.panel` keeps its border only where §5 allows a real object: project cards,
   dialogs, the Settings danger zone. Everywhere else, replace
   `<section className="panel"><h2 className="panel-title">` with
   `<section><div className="section-head"><h2 className="section-label">`.
   Keep every heading string and every `aria-label`; the `<h2>` level does not
   change, so the heading outline is preserved.
2. **Detail editorial head.** `.detail-header`: `<h1 className="page-title">`
   first, then one `.detail-meta` line joining
   `status · type · created · deadline · progress` with `·` separators in
   `--pb-text-secondary`. Only the deadline segment is colored, and only when
   warn/danger — reuse `.deadline-hint.warn` / `.deadline-hint.danger` colors.
   The `.card-top` chip row (`status-chip`, `type-chip`, starred/risk/idle
   badges) is replaced by this line plus `HealthBadges`-style chips in the
   rail; keep the Starred / Overdue / At risk / Idle **text labels** verbatim.
3. **Detail two-column.** Wrap the five panels as
   `<div className="detail-layout"><div className="detail-main">Notes,
   Steps</div><aside className="detail-rail">Progress/health, Meta, Links,
   deadline, danger actions</aside></div>`. Single column below 1024px in the
   same DOM order; `grid-template-columns: minmax(0, 1fr) 300px` at ≥1024px.
   Move the Delete button into the rail's danger group; keep its
   `window.confirm` string and `navigate('/')` exactly.
4. **Steps as rows.** `.steps` → hairline-divided list:
   `.step-item { display: grid; grid-template-columns: auto 1fr auto;
   align-items: center; gap: var(--pb-space-8);
   border-bottom: 1px solid var(--pb-line-subtle); min-height: 48px; }`
   with `min-height: 40px` at `@media (hover: hover) and (min-width: 768px)`.
   `.step-handle` and `.step-move-btn` are **always visible** — delete any
   opacity/hover gating; each button keeps `min-width: 44px; min-height: 44px`
   below 768px. `.step-item.done .step-check span` keeps
   `text-decoration: line-through` and moves to `--pb-text-muted`.
   `.step-bulk-actions` moves into the Steps `.section-head` as a
   right-aligned action row. `.step-drag-over` becomes a
   `box-shadow: inset 0 2px 0 var(--pb-accent)` insertion rule instead of a
   background fill.
5. **Notes tabs.** `.segmented` / `.seg-btn` → two text tabs:
   transparent background, `--pb-text-secondary`, active =
   `--pb-text` + `box-shadow: inset 0 -2px 0 var(--pb-accent)`. Keep
   `role="group" aria-label="Notes mode"` and both button labels.
   `.md-preview`: body type, `max-width: 72ch`, `code` on
   `--pb-surface-sunken`, `a` in `--pb-accent` with
   `text-decoration: underline`. `.notes-area` gets `max-width: 72ch` too.
   `renderMarkdownSafe` is not touched.
6. **Review as a report.** `ProjectListSection` renders
   `.section-head` + `<h2 className="section-label">{title}</h2>` +
   `<span className="section-count">` + a hairline row list. Empty buckets
   render a single muted line — change `emptyLabel` default from
   `'None — nice.'` to a per-bucket sentence passed from the caller:
   `Nothing overdue.` / `Nothing due in the next 7 days.` /
   `Nothing stale in progress.` / `Every project has steps.` Keep the
   `{projects.length}` count and the `review-project-meta` composition
   (`STATUS_LABELS · TYPE_LABELS · deadline · pct`) exactly.
   The KPI strip reuses `.kpi-ledger` / `.kpi-cell` from stage 3 with
   `grid-template-columns: repeat(2, 1fr)` base, `repeat(3, 1fr)` ≥768,
   `repeat(6, 1fr)` ≥1120 (six KPIs). Suggested actions become
   `<ol className="review-suggestions">` with a hairline between items and
   `font-variant-numeric: tabular-nums` on the marker; the idle bulk archive
   button moves to a trailing band with
   `border-left: 3px solid var(--pb-signal-warn)` and keeps its
   `(${count})` suffix in the label. Buckets may run two-up at ≥1024px via
   `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` on
   `.review-sections`.
7. **Activity timeline.** `.activity-feed` gets
   `position: relative` and `::before` — a `1px` `--pb-line-subtle` vertical
   rule at `left: 9px`. Each `.activity-feed-item` is
   `padding-left: 24px` with a `7px` `::before` dot centered on the rule,
   colored per event kind from the existing `.activity-type-*` selectors
   remapped to the semantic set: `project_created` → `--pb-signal-ok`,
   `status_changed` → `--pb-status-progress`, `step_toggled` →
   `--pb-status-planned`, `project_deleted` → `--pb-signal-danger`,
   `import`/`seed`/`reset` → `--pb-text-muted`. `.activity-type` keeps its
   **text label** (`Created`, `Status`, …) so the dot is reinforcement only.
   `.activity-feed-time`: right-aligned, `tabular-nums`, `--pb-text-muted`.
   Add sticky date group headers in `.section-label` style — group by
   `new Date(e.at).toDateString()` **in the JSX only**, without changing the
   `activity` array, its order, or the cap. End the list with a muted line:
   `Showing the latest {activity.length} of at most 100 events.`
   `RecentActivity` reuses `.activity-feed`'s rule and dot classes.

**Gate:**

```bash
# RED
grep -c 'section-label' src/index.css                    # 0 → must become ≥1
grep -c 'detail-rail' src/pages/ProjectDetail.tsx        # 0 → must become 1

# GREEN — logic untouched
for f in src/pages/ProjectDetail.tsx src/pages/Review.tsx src/components/StepList.tsx; do
  git diff "$f" | grep -E '^[-+].*(window\.confirm|updateProject|onReorder|moveStep|applyDrop|softArchiveIdle|computeReview|reorderSteps|removeCompletedSteps|setAllStepsDone)' \
    && echo "FAIL: logic touched in $f" || echo "OK: $f"
done
test "$(grep -c '72ch' src/index.css)" -ge 2 && echo MEASURE-OK
npm run build && npm test && npm run lint
```

**Preservation checkpoint:**

- **Step reorder both ways.** Drag step 3 above step 1 and confirm the order
  persists after reload as 1…n. Then use `↑`/`↓` buttons to move it back and
  confirm the same. Confirm the first row's `↑` and last row's `↓` are
  `disabled`. Confirm the grip and both arrows are visible without hovering at
  390px and are each ≥44×44.
- **Bulk steps.** Mark all done → progress 100% and one activity event. Clear
  all done → 0%. Remove completed → the `window.confirm` text is unchanged and
  cancelling removes nothing.
- **Notes.** Toggle Edit/Preview; confirm `**bold**`, `*italic*`, `` `code` ``,
  a list, and an `https://` link all render, and that a `javascript:` link is
  not rendered as a link (markdown sanitizer untouched).
- **Detail meta writes.** Change status and type from the rail selects, set and
  clear a deadline, edit manual progress on a project with no steps — each
  persists. Star, Duplicate (navigates to the copy), Archive (5s Undo toast),
  Delete (confirm → navigate `/`).
- **Review.** `r` navigates there. Soft-archive idle shows the exact
  confirm string and the count in the button. Snapshot and Export buttons work.
  Every bucket with zero items shows one muted sentence, not an empty box.
- **Activity.** 100-event cap holds: trigger >100 events (toggle steps
  repeatedly) and confirm the list stops at 100 and the closing line reads
  `Showing the latest 100 of at most 100 events.`

**Done when:** the gate passes, all five checkpoint groups pass, Detail is
main+rail at ≥1024px and single-column below in the same DOM order (verified by
tabbing straight through without a jump), and Review reads as a report while
Activity reads as a timeline (§9 Visual 4).

---

## Stage 6 — Settings, New Project, dialogs, print

**Files / symbols:**

- `src/pages/Settings.tsx` — the `return` JSX. **`handleImportFile`,
  `applyImport`, `closeImportPreview`, `copyHygieneReport`,
  `handleSoftArchiveIdle`, every `window.confirm` string, and every
  `setMessage` string stay identical.**
- `src/pages/NewProject.tsx` — `.page-header` only.
- `src/components/ProjectForm.tsx` — field grid classes only; validation and
  submit logic untouched.
- `src/components/ThemeToggle.tsx` — class names only; `cycleTheme`,
  `setTheme`, both `aria-label`s and the `title` stay identical.
- `src/components/KeyboardShortcuts.tsx` — the `.shortcut-panel` JSX only.
  **The entire `useEffect` key handler, `isTypingTarget`, `SHORTCUTS`, and the
  `useDialogFocus` call stay byte-identical.**
- `src/components/Toast.tsx` — surface + border only.
- `src/index.css` regions `.field*`–`.form-actions` (963–1013),
  `.settings-page` / `.settings-actions` / `.banner*` (1316–1346),
  `.hygiene-*` (2606–2631), `.import-*` (2632–2688),
  `.shortcut-*` (2191–2270), `.toast*` (2447–2509),
  and the `@media print` block from stage 1

**Edits:**

1. **Form rows.** `.field` becomes a two-column grid at ≥768px:
   `grid-template-columns: minmax(180px, 34%) 1fr`, label + `.field-hint`
   stacked in column 1, control in column 2, `border-bottom: 1px solid
   var(--pb-line-subtle)`, `padding-block: var(--pb-space-12)`. Stacked
   (single column) below 768px. `.field-row` keeps its existing 520px
   two-up behavior for the Status/Type pair.
2. **Inputs.** `input, select, textarea`:
   `background: var(--pb-surface-sunken)`,
   `border: 1px solid var(--pb-line-strong)` (the §1.4(a) value, ≥3:1),
   `border-radius: var(--pb-radius-sm)`, `min-height: 44px`, dropping to
   `36px` at `@media (hover: hover) and (min-width: 768px)`.
   `:focus` → `border-color: var(--pb-accent)`; the global
   `:focus-visible` ring still applies. `::placeholder`:
   `color: var(--pb-text-muted)`.
3. **Buttons.** `.btn-primary`: `background: var(--pb-accent)`,
   `color: var(--pb-text-inverse)`, `border-color: var(--pb-accent)` (5.90:1
   dark / 5.75:1 light). `.btn-secondary`: transparent fill,
   `1px solid var(--pb-line)`, `color: var(--pb-text)`. `.btn-ghost`:
   transparent, no border, `color: var(--pb-text-secondary)`.
   `.btn-danger`: transparent fill with `--pb-signal-danger` border and text;
   it fills only in the confirmed state — since confirmation is a native
   `window.confirm`, there is no post-confirm render, so `.btn-danger:active`
   is the fill state. Keep `min-height: var(--touch)` at all widths.
   **Accent budget:** exactly one `.btn-primary` per view. Settings currently
   renders `.btn-primary` once (Export JSON) plus once inside the import
   dialog (Replace all) — the dialog is a separate view, so this holds.
   Dashboard has `.btn-primary` in the header (`+ New project`), in the backup
   nudge (`Export JSON`), in Onboarding, and in both `EmptyState`s. **Demote
   the backup-nudge Export button and the empty-state secondary actions to
   `.btn-secondary`**, leaving the header `+ New project` as the single accent
   fill on `/`. Onboarding and `EmptyState` never render at the same time as
   the nudge, and Onboarding replaces the whole body, so each remains a
   single-accent view.
4. **Danger zone.** Group `Reset board` (Settings → Seed data) into its own
   `<section className="panel danger-zone">`:
   `border: 1px solid var(--pb-signal-danger)`,
   `background: var(--pb-surface-sunken)`, `--pb-radius-lg`, with the existing
   consequence text. This is the only bordered panel on the page.
5. **Import dialog.** `.import-overlay`: `background: var(--pb-scrim)`, no
   blur. `.import-panel`: `background: var(--pb-surface-overlay)`,
   `--pb-radius-lg`, `box-shadow: var(--pb-elev-dialog)`,
   `1px solid var(--pb-line)`. `.import-summary-list` becomes hairline rows
   with `tabular-nums` counts. **Every string, the five summary rows, the
   sample-titles list, the merge-settings checkbox, and all three buttons keep
   their exact wording and handlers.** `.banner.error` becomes a
   `border-left: 3px solid var(--pb-signal-danger)` list with one
   plain-language line per error and `color: var(--pb-signal-danger)` on the
   text (5.22:1 on raised). `.banner.success` mirrors it with
   `--pb-signal-ok`.
6. **`?` dialog.** `.shortcut-overlay` / `.shortcut-panel` get the same
   overlay treatment as the import dialog. `.shortcut-list` becomes a
   hairline-divided two-column list (`grid-template-columns: 4rem 1fr`).
   `.shortcut-list kbd`: `background: var(--pb-surface-sunken)`,
   `1px solid var(--pb-line-strong)`, `--pb-radius-sm`, `--mono`,
   `font-size: 0.75rem`. Keep `role="dialog"`, `aria-modal="true"`,
   `aria-labelledby="shortcut-help-title"`, the `Esc` close button, and the
   `Ignored while typing in fields.` note.
7. **`.toast`**: `--pb-surface-overlay`, `1px solid var(--pb-line)`,
   `--pb-radius`, `box-shadow: var(--pb-elev-dialog)`. Keep the 5000ms
   `durationMs` behavior and the Undo action.
8. **Print.** Extend the stage 1 `@media print` block to also hide
   `.detail-actions`, `.settings-actions`, `.step-add`, `.link-add`,
   `.card-quick`, and `.board-scroll-hint`, and to force
   `.section-label { color: #000 }` and
   `.kpi-ledger .kpi-cell { border-left-color: #000 }`. **Do not touch
   `src/lib/snapshot.ts`:** the weekly snapshot is a separate document with its
   own inline `<style>` and its own `@media print`, already black-on-white.
   Stage 6 verifies it prints legibly rather than editing it.

**Gate:**

```bash
# RED
grep -c 'danger-zone' src/index.css                 # 0 → must become ≥1
grep -c 'var(--pb-surface-overlay)' src/index.css   # count before

# GREEN — copy and handlers untouched
git diff src/pages/Settings.tsx | grep -E '^[-+].*(window\.confirm|setMessage|setError|importData|parseImportJson|summarizeImport|loadSeed|resetAll|navigator\.clipboard|formatHygieneReport)' \
  && echo 'FAIL: settings logic touched' || echo 'OK'
git diff src/components/KeyboardShortcuts.tsx | grep -E '^[-+].*(navigate|preventDefault|isTypingTarget|useDialogFocus|helpOpen|SHORTCUTS)' \
  && echo 'FAIL: shortcut logic touched' || echo 'OK'
git diff --name-only | grep 'snapshot' && echo 'FAIL: snapshot.ts touched' || echo 'OK'
test "$(grep -c 'backdrop-filter' src/index.css)" = 0 && echo NO-BLUR-OK
npm run build && npm test && npm run lint
```

**Preservation checkpoint** — the import boundary is the highest-risk contract.
With `PREVIEW`:

1. **Export.** Click Export JSON. Filename is
   `project-board-YYYY-MM-DD.json` with today's date. Open the file: shape is
   `{ version: 1, projects: [...], settings: { showCompleted, idleDays, theme,
   lastExportAt } }`. Settings → Last export now shows a fresh relative time.
2. **Round trip.** Import that file with Replace all → project count, steps,
   links, `starred` flags, tags, deadlines, and settings all identical. Then
   import a **v0.9-produced** export (from the stage 0 baseline) and confirm
   the same.
3. **Rejections** — each must show its plain-language error and change nothing:
   a 6 MB file; a file with 5001 projects; a file with
   `"status": "nope"`; a file with `"version": 2`; a file with
   `"theme": "neon"`; a project with 501 steps; malformed JSON.
4. **Merge.** Import with Merge by id, with the settings checkbox off →
   existing ids kept, settings unchanged. With it on → settings applied.
5. **Theme.** Cycle dark → light → system from the header button and from
   Settings → Appearance. With `system`, change the OS preference and confirm
   the palette follows without reload.
6. **Snapshot print.** Open the weekly snapshot from the header, from Settings,
   and from Review in **dark** theme; use the browser's print preview and
   confirm black text on white with visible hairline KPI boxes.
7. **`?` dialog.** Open with `?`, confirm the `<kbd>` table is readable in both
   themes, `Tab` wraps, `Escape` closes, focus returns.

**Done when:** the gate passes, all seven checkpoint groups pass, `npm run
build:pages` emits both `dist/.nojekyll` and `dist/404.html`, and no input,
select, or textarea anywhere measures under 44px tall at 390px.

---

## Stage 7 — Sweep, contrast measurement, five-width capture

**Files / symbols:** `src/index.css` (token blocks + dead rules), `README.md`.

**Edits:**

1. **Alias removal.** Search for every legacy name before deleting it:

   ```bash
   for v in bg bg-elevated bg-card bg-card-hover bg-topbar border border-strong \
            text text-muted text-dim primary primary-hover primary-soft primary-on \
            danger danger-soft warn warn-soft success success-soft radius radius-sm \
            shadow font max status-idea status-planned status-in_progress \
            status-paused status-done status-archived status-on focus-ring; do
     n=$(grep -c -- "var(--$v)" src/index.css)
     echo "$v: $n"
   done
   ```

   Rewrite each remaining `var(--legacy)` to its `var(--pb-*)` target, then
   delete the alias declarations. `--mono` and `--touch` are **not** aliases —
   they keep their own names and values.
2. Delete dead rules whose markup no longer exists: `.status-chip`,
   `.status-dot` (Board header now uses the 2px rule; `.status-dot` survives
   only if Due soon still uses it — check before deleting), `.kpi-card`,
   `.kpi-card.kpi-danger`, `.board-card-summary`, `.onboarding-card`'s shadow,
   `.segmented`'s box treatment, `.panel-title` where superseded by
   `.section-label`. Verify each with
   `grep -rn "className.*<class>" src/` returning zero before removing.
3. **Raw-hex audit.** Every color outside the two token blocks must be a
   token, except the `@media print` and `@media forced-colors` blocks (which
   legitimately use `#000` / `#fff` / `CanvasText`).
4. `README.md`: replace the "Accessibility & mobile (v0.9)" lead section with a
   "Design (v0.10 'Quiet Command Center')" section covering the surface ladder,
   the single accent and its budget rule, semantic status hues always paired
   with text, the editorial hierarchy, the ledger/trough/report/timeline
   grouping devices, the measured contrast floors from §1, and "no new
   dependency". Bump the stated version to 0.9.0 → **0.10.0** in the header
   block and in the footer-chrome bullet. Keep the v0.9 and earlier sections as
   history. Do not change the Setup / Development / Tests / Pages sections
   except the version string.

**Gate:**

```bash
# GREEN — no legacy variable survives
test "$(grep -cE 'var\(--(bg|bg-elevated|bg-card|bg-card-hover|bg-topbar|border|border-strong|text|text-muted|text-dim|primary|primary-hover|primary-soft|primary-on|danger|danger-soft|warn|warn-soft|success|success-soft|radius|radius-sm|shadow|font|max|status-idea|status-planned|status-in_progress|status-paused|status-done|status-archived|status-on|focus-ring)\)' src/index.css)" = 0 && echo NO-ALIAS-OK

# GREEN — banned visual techniques (§9 Visual 2)
test "$(grep -cE 'backdrop-filter|text-shadow|filter:\s*blur|linear-gradient\([^)]*\)\s*(1px|border)' src/index.css)" = 0 && echo NO-BANNED-OK

# GREEN — no shadow blur > 32px and no chromatic shadow
grep -nE 'box-shadow[^;]*' src/index.css | grep -vE 'rgba\(0, 0, 0, 0\.(35|45)\)|inset 0 (-?)2px 0 var\(--pb-accent\)|inset 0 0 0 1px var\(--pb-accent\)|none' \
  && echo 'REVIEW each hit' || echo SHADOW-OK

# GREEN — status hues are never text (§1.2 rule)
grep -nE 'color:\s*var\(--pb-status-' src/index.css \
  && echo 'FAIL: status hue used as text color' || echo STATUS-FILL-ONLY-OK

# GREEN — raw hex only inside token blocks / print / forced-colors
grep -nE '#[0-9a-fA-F]{3,8}' src/index.css | grep -vnE 'pb-|--(mono|touch)|@media|CanvasText|#000|#fff' | head
# inspect: every remaining hit must be inside :root/[data-theme] or the print block

# GREEN — no dependency drift
git diff --stat package-lock.json     # empty
git diff -U0 package.json | grep -E '^[-+]' | grep -v version   # empty

# GREEN — forbidden files untouched across the whole lane
git diff --name-only 489e1e5 | grep -E 'boardKeyboard|boardScrollHint|dialogFocus|useDialogFocus|storage\.ts|export\.ts|importValidation|snapshot\.ts|ProjectContext|types\.ts|\.test\.ts|package-lock|test-resolve-hook' \
  && echo 'FAIL: forbidden file in lane diff' || echo LANE-FENCE-OK

npm run build && npm test && npm run lint && npm run build:pages
test -f dist/.nojekyll && test -f dist/404.html && echo PAGES-OK
```

**Contrast measurement — exact procedure.** Serve the production build
(`npm run preview -- --host 127.0.0.1 --port 8780`) and, for **each** theme,
run a contrast checker (browser DevTools "Contrast ratio" in the color picker,
or an axe/Lighthouse accessibility audit) over the pairings below. Record the
measured value next to the target from §1. Any deviation >0.05 means a token
drifted and must be corrected before proceeding.

| # | Pairing | Where to sample | Dark target | Light target |
|---|---|---|---|---|
| 1 | `--pb-text` on base | page title on `/` | 15.43 | 15.32 |
| 2 | `--pb-text-secondary` on raised | card meta row | 7.99 | 7.40 |
| 3 | `--pb-text-muted` on base | footer line | 5.76 | 4.94 |
| 4 | `--pb-text-muted` on sunken | input placeholder, `/settings` | 6.06 | **4.56** |
| 5 | `--pb-text-muted` on hover | meta row of a hovered card | 4.88 | 4.65 |
| 6 | `--pb-accent` on raised | a link inside a card | 5.41 | 5.55 |
| 7 | `--pb-text-inverse` on accent | `+ New project` label | 5.90 | 5.75 |
| 8 | `--pb-signal-danger` on raised | Overdue badge text | 5.22 | 6.06 |
| 9 | `--pb-signal-danger` on hover | Overdue badge, card hovered | **4.72** | 5.40 |
| 10 | `--pb-signal-warn` on sunken | warn label in a Board trough | 8.46 | **4.53** |
| 11 | `--pb-signal-ok` on raised | success banner text | 5.54 | 6.09 |
| 12 | `--pb-focus-ring` vs base | focused nav tab | 7.49 | 6.90 |
| 13 | `--pb-focus-ring` vs raised | focused card | 7.03 | 7.27 |
| 14 | `--pb-focus-ring` vs sunken | focused Board card in a trough | 7.89 | 6.36 |
| 15 | `--pb-line-strong` vs sunken | input border | 3.87 | 3.19 |
| 16 | `--pb-line-strong` vs raised | input border on a raised panel | 3.45 | 3.65 |
| 17 | `--pb-accent` vs raised | active chip border | 5.41 | 5.55 |
| 18 | `--pb-accent` vs sunken | drag-over column inset border | 6.06 | 4.85 |

Rows 4, 9, 10 are the three tightest in the system and are the ones most likely
to fail if a token is nudged; rows 15–18 are the 3:1 UI-border checks. Rows
12–14 must clear 3:1 against **both** adjacent surfaces, which they do by wide
margins.

**Done when:** every gate command prints its OK line, all 18 pairings measure
within 0.05 of target in both themes, README states v0.10.0, and
`git diff --name-only 489e1e5` contains only files from the §0.1 allowed list.

---

## 8. Browser QA matrix

Run against the **production preview**, not the dev server:
`npm run build && npm run preview -- --host 127.0.0.1 --port 8780`.

Seed with Settings → "Load realistic inventory (replace)" (8 projects) so
cards, deadlines, links, tags, and steps are all populated. Set `showCompleted`
on for the 6-column Board passes.

### 8.1 Width × theme grid

Every cell is: **7 routes × 3 themes.** Themes are `dark`, `light`, and
`system` — for `system`, flip the OS preference mid-session and confirm the
palette follows with no reload and no flash (the pre-paint script in
`index.html` covers first load).

| Width | Per-cell checks (all 7 routes, all 3 themes) |
|---|---|
| **320** | No horizontal **page** scrollbar on any route (`document.documentElement.scrollWidth <= 320`); the Board's `.board-scroll` is the only sideways scroller. KPI ledger renders 2×2 with hairlines and no gaps. Cards single column, 12px gutters, 12px internal padding. Page title 1.375rem. Filters collapsed with the active-count badge visible. On `/board` with zero projects, the `Create one` link is above the fold. Bottom tab labels truncate with ellipsis, never wrap to two lines. No text below 12px. |
| **390** | Single column, 16px internal card padding. **Every** interactive target ≥44×44: bottom tabs, chips, star, `+ step`/Duplicate/Archive, step grip, step ↑/↓/×, inputs, selects, theme toggle, hamburger, dialog close. Due-soon rows keep title and date on one line with the date not truncated. Card actions fully opaque (no hover gating on touch). |
| **768** | Bottom bar hidden, top text tabs shown with the 2px accent underline on the active tab. Dashboard cards 2 columns. Filters expanded by default (fresh profile / cleared `project-board-filters-open`). Settings form rows label-left at `minmax(180px, 34%) 1fr`. Board shows ~3 columns and still overflows; hint present on `/board`. |
| **1024** | 24px gutters. Project Detail is main + 300px rail. Review buckets may run two-up. Board shows ~4 columns (3 full + a partial), still overflowing with 6 columns; **hint absent** (narrow gate is ≤767px). |
| **1440** | Content capped at 1180px and centered; Board still full-bleed to the gutters. Dashboard is a 3-up grid + rail — **no 4th column**. Notes preview measure ≤72ch. Ledger cells distribute evenly with hairlines and no gaps. Nothing stretches to fill. |

### 8.2 Cross-cutting checks at every width

Run these five at all five widths, in dark and light:

1. **No clipped focus ring.** `Tab` through the entire page. Pay specific
   attention to a Board card at the left and right edge of the scroller, a
   project card at the grid edge, and the last step row inside
   `.board-column-body`'s vertical scroller. The 2px ring + 2px offset must be
   fully visible on all four sides.
2. **No overlapping sticky element.** Scroll `/activity` (100 events) and
   `/board`: the 48px command bar, the Board column sticky headers, and the
   Activity date group headers must never overlap each other or content.
3. **No target under 44px on touch widths** (320, 390) and none under 32px with
   ≥8px separation on pointer widths (768, 1024, 1440).
4. **No text under 12px.** Check the footer, section labels, meta rows, chip
   text, bottom-tab labels, and `<kbd>`.
5. **Reduced motion.** With `prefers-reduced-motion: reduce` forced in
   DevTools, confirm no transition is observable on: nav tab hover, card hover,
   chip activation, the mobile sheet open/close, and the toast. Every state
   change must still be legible.

### 8.3 Functional QA — keyboard, focus, dialogs, Board overflow

Run once at 390px and once at 1440px, in dark and light.

**Keyboard / shortcuts**

- All seven (`n` `/` `b` `d` `r` `a` `?`) fire from `/`.
- Each is suppressed inside the search input, the notes textarea, the step
  input, the link inputs, and every `<select>`.
- `/` from `/board` navigates to `/` and focuses+selects `#board-search`.

**Focus / dialogs**

- Mobile sheet (390px): opener → focus on close button → `Tab` wraps forward →
  `Shift+Tab` wraps backward → `Escape` closes → focus back on the hamburger.
- `?` dialog: same lifecycle; focus returns to whatever was focused before `?`.
- Import preview dialog: opens on file select, `Cancel` closes it, and the
  scrim click closes it. (Note: the import dialog is **not** wired to
  `useDialogFocus` in v0.9 — do not add it. That would be a behavior change and
  is out of scope; record it as a follow-up.)

**Board overflow**

- 390px: hint visible → scroll 24px sideways → hint gone → stays gone on
  in-session navigation away and back → returns after reload.
- 1024px and 1440px: hint never appears even with 6 columns overflowing.
- `Object.keys(localStorage)` contains exactly the three known keys.
- `.board-scroll` `scrollWidth` matches the stage 0 baseline exactly at all
  five widths, for 4 and 6 columns.
- Edge keys: `←`/`h` at the leftmost column does not scroll the page; `↓`/`j`
  at the last card neither moves focus nor opens; `Enter` and `Space` open;
  `aria-live` announces `Moved to <Status>`.

**Export / import**

- Export filename `project-board-YYYY-MM-DD.json`; `lastExportAt` written.
- Replace-all round trip preserves projects, steps, links, `starred`, tags,
  deadlines, settings.
- A v0.9 export imports cleanly.
- All seven rejection cases from stage 6 show their plain-language error and
  mutate nothing.

### 8.4 Evidence

70 screenshots (5 widths × 7 routes × 2 explicit themes) plus a `system`-mode
spot check on `/` and `/board` at 390 and 1440. Each paired with its stage 0
counterpart. Record the 18-row contrast table with measured values, and the
`scrollWidth` comparison table.

---

## 9. Release gate

All of the following must hold on the final branch before merge:

1. `npm run build` exits 0.
2. `npm test` prints `# pass 99` / `# fail 0`, and
   `git diff --name-only 489e1e5 -- 'src/**/*.test.ts'` is empty.
3. `npm run lint` prints `Found 1 warning and 0 errors.` (baseline warning
   only; it lives in a forbidden file and must remain).
4. `npm run build:pages` emits `dist/.nojekyll` and `dist/404.html`.
5. `git diff --stat package-lock.json` is empty;
   `git diff -U0 package.json` shows only the `version` line.
6. `git diff --name-only 489e1e5` is a subset of the §0.1 allowed list, and the
   §0.1 forbidden grep returns nothing.
7. All seven routes load and render; every URL filter param from spec §3
   applies.
8. The 18-row contrast table is filled in for both themes with every row at or
   above its floor (4.5:1 text, 3:1 UI border).
9. The §8.1 grid and the five §8.2 cross-cutting checks pass at all five widths
   in both themes, with the `system` spot check.
10. The §8.3 functional block passes in full.
11. Footer reads `Project Board v0.10.0 · local-first · data stays in this
    browser`; `package.json`, `src/version.ts`, and `README.md` all say
    `0.10.0`.
12. Visual acceptance, judged from the screenshots: at most one accent-filled
    element per view; Dashboard / Board / Review / Activity are distinguishable
    at a glance by grouping device (ledger, troughs, report lists, timeline);
    each status hue appears in exactly one place per surface, always beside its
    text label; no `box-shadow` outside the two allowed elevations.
13. **Fresh review.** A reviewer who has not seen the intermediate stages reads
    the spec's §3 preserved-contract table and §9 acceptance criteria top to
    bottom against the running build, and signs off on each row. Any row they
    cannot verify from the running app blocks the merge.
14. Rollback: the change is confined to presentation plus three version
    strings. If a contract fails after merge, revert the range in one commit —
    no data migration or storage rollback is involved.

---

## 10. Self-review

Contradictions found in the spec and how this plan resolves them — each is a
decision the implementer must not silently re-litigate:

1. **Board column width (spec §6 vs §12).** §6's `264px` / `240px` minimums are
   narrower than v0.9's `280px`, so reading them as fixed widths shrinks total
   width and breaks §12's "keep 6-column total width ≥ v0.9". Resolved in §2 by
   treating them as literal `min-width` floors with the v0.9 flex-basis
   retained, which makes overflow bit-identical. This is the single most
   likely place for a well-meaning implementer to break the hint contract.
2. **`--pb-line-strong` cannot be both §4.1's value and §8's 3:1 input
   border.** Measured 1.70–1.91. §8 explicitly governs over §4.1's illustrative
   values, so §1.4(a) raises it to `#666f80` / `#86837c`. This is the only
   token value in the plan that departs from a number the spec states outright,
   and it is stated as such rather than buried.
3. **Chip touch height (spec §6 `36px` vs §7/§8 `≥44×44`).** The 44px floor
   wins below 768px; `28px` applies only at pointer widths. §7 and §8 are
   accessibility contracts; §6's `36px` is a density preference.
4. **Status hue as text.** §4.4 lists "label" as a place the hue is applied,
   but `--pb-status-archived` measures 2.53–2.99 and `--pb-status-paused`
   measures 4.33 on hover. Every *concrete* rule in §6 puts the hue on a
   spine/rule/dot with the label in a neutral text token, so §1.2 makes that a
   hard rule and no token changes. If a future change does colour a status
   label, archived and paused must be lightened first.
5. **Light theme gaps.** §4.5 omits `--pb-line-strong`, `--pb-text-inverse`,
   and `--pb-surface-hover`. §1.4(b)(c) fills all three with measured values.
   Dark ink on the light accent measures 3.32 and would have failed silently.
6. **`src/version.ts` missing from §10's file list** while the spec specifies a
   footer version string that comes from `APP_VERSION`. Added to the allowed
   list in §0.1.
7. **§12's light-theme contrast risk is misdirected.** Measurement puts every
   light pairing at or above 4.53, while dark's danger-on-hover is 4.72 — the
   tightest in the system. Stage 7 measures both, so the plan does not depend
   on the spec's guess being right.
8. **Print vs snapshot.** §8 asks for print rules for "the snapshot/share
   card", but that card is a separate document with its own inline CSS in the
   forbidden `src/lib/snapshot.ts`. Stage 6 therefore *verifies* the snapshot
   and adds app-level print rules to `index.css` instead. Nothing is left
   unaddressed and no forbidden file is touched.

Scope creep deliberately refused:

- The import preview dialog is not wired to `useDialogFocus`, unlike the mobile
  sheet and `?` dialog. That is a real a11y gap, but fixing it is a behavior
  change (spec §2, §12 "Scope creep into behavior"). Recorded as a follow-up in
  §8.3, not fixed here.
- The pre-existing `oxlint` warning in `src/store/ProjectContext.tsx` stays.
  The file is forbidden and the warning is baseline.
- `.status-dot` is removed from the Board column header (§9 Visual 5 permits
  one hue location per surface) but survives in Due soon. No component is
  abstracted, no new shared component is created, and `src/index.css` remains
  the single source of visual truth (spec §2).
- No route, filter, sort, setting, storage key, dependency, or test is added or
  changed. The `project-board-filters-open` key is pre-existing and preserved
  as-is.
- The 4-up Dashboard grid at 1440px, the `in_progress` amber-vs-teal question,
  and the below-1120px rail placement are all left exactly as the spec's §13
  decided. They are revisit-after-living-with-it items, not stage work.
