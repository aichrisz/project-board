# Project Board v0.4

Base: 0.3.0. Implementer: Grok Build CLI.

## Ship
1. **Markdown notes preview** — safe subset (bold/italic/code/lists/links); edit + preview toggle on detail
2. **Keyboard shortcuts** — `n` new, `/` focus search, `b` board, `d` dashboard, `a` activity, `?` help overlay; ignore when typing in inputs
3. **Weekly snapshot** — Settings or header: generate simple printable/share card (canvas or print CSS) with KPI counts + active project titles; download PNG if easy else print-friendly HTML window
4. Bump **0.4.0**, README; keep allowedHosts; EN only; name Project Board
5. `npm run build` green

## Out
Cloud sync, i18n, multi-board, heavy MD libs if not needed (prefer small/zero dep)

## Verify
build 0; shortcuts not fire in inputs; preview no raw script XSS; snapshot produces output
