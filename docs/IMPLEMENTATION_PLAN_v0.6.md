# Project Board v0.6 “Real inventory”

**Base:** v0.5.0 · **Approved:** Abel 2026-07-14 (continue all: tunnel + seed + v0.6)  
**Implementer:** Grok Build CLI · **Verify:** Hermes light  

## Goal

Board reflects Abel’s **actual** side-project inventory on this host (not placeholder demo copy). Easy reseed after wipe. Still local-first, English UI, brand **Project Board**.

## Ship

1. **Realistic seed** (`src/data/seed.ts`) — replace placeholders with projects grounded in vault + `/root/projects/*`:
   - **Project Board** (this app) — `in_progress`, starred, steps through v0.6, stack Vite/React/TS, path note
   - **Orbit Tap** — `done` / playable **v1.4**, tags canvas one-button, path `/root/projects/orbit-tap`
   - **Lobby Chaos** — `done` / playable **v0.5**, Hotelfach DE/ID, path `/root/projects/lobby-chaos`
   - **xVELOCITY Race** — `done` or `paused` if polish open — path `/root/projects/xvelocity-race`
   - **Roxy Landing** — `paused` / active fan landing — path `/root/projects/roxy-landing`, no GH Pages until asked
   - **Portfolio SPA** — `idea`/`planned` — link portfolio GH Pages if known (`aichrisz.github.io/...`)
   - **Second Brain + Hermes ops** — `in_progress`/`done` hybrid steps: vault path, crons morning/nightly, GitHub vault backup
   - Optional 1 learning: **Hotelfach / Azubi notes** as `learning` type (no code path required)

   Rules:
   - Accurate `summary`, `steps` (done flags match reality), `tags`, `stack`, `deadline` only if meaningful
   - Prefer **links** entries for local path + public URLs (label + url; use `file://` only if needed, or `https://` for GH; for local path put in notes_md as `` `path` `` and links with `#` or descriptive url if no public URL)
   - `starred: true` on Project Board + Second Brain ops
   - `withAutoProgress` still applied
   - Do **not** put personal legal name in UI product chrome; project titles OK as product names

2. **Settings / onboarding copy**
   - Rename seed actions to **“Load realistic inventory”** (merge / replace) + short help text that seed is Abel’s host inventory template
   - Onboarding primary CTA same wording

3. **Export filename**
   - `project-board-YYYY-MM-DD.json` (UTC date) when downloading export

4. **App version chrome**
   - Show **v0.6.0** in Layout footer (or header meta) from a single constant or `package.json` import if Vite allows; keep simple

5. **Version bump**
   - `package.json` → **0.6.0**, README short “v0.6 Real inventory”, `npm run build` green

## Out of scope

Cloud sync, multi-board, i18n ID, backend, renaming brand to personal name, GitHub Issues sync.

## Verify

- `npm run build` exit 0  
- Seed has ≥6 real projects; no “Chaotic lobby multiplayer vibes” fake copy  
- Merge/replace still works; first visit still empty until onboarding seed  
- Export downloads dated filename  
- Footer shows 0.6.0  
