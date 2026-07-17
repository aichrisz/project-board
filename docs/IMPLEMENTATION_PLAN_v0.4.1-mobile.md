# Project Board v0.4.1 — Mobile nav

## Problem
On narrow screens top nav crams brand + Dashboard/Board/Activity/Settings + actions → overcrowded (user screenshot).

## Ship
1. **Breakpoint ~768px**: desktop keeps horizontal nav.
2. **Mobile**: brand left; hamburger opens sheet/drawer with full nav + Snapshot + New project + theme; optional sticky bottom tab bar (Dashboard / Board / Activity / More) — pick one clean pattern, not both if cluttered.
3. Prefer: **hamburger + slide-over** OR **bottom nav** (4 items). Bottom nav often better thumb reach for daily driver.
4. Filters on Dashboard: stack full-width; chips wrap without horizontal page overflow; reduce padding on KPI cards.
5. Touch targets ≥44px. No horizontal scroll on body.
6. Bump 0.4.1, README note. EN. Build green. allowedHosts kept.

## Verify
`npm run build` 0; no layout overflow at 360–430px width; nav usable one-handed.
