# Project Board v0.12.0 Focus Dashboard Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Surface the three active projects, next actions, blockers, and freshness at the top of the existing Dashboard and release all shipped persistence/automation work as v0.12.0.

**Architecture:** Extend the existing pure project-signal module, add one small presentational Focus component, and mount it in `Dashboard`. Reuse workspace data, project routes, design tokens, and existing next-action/freshness logic; do not change the API or schema.

**Tech Stack:** React 19, TypeScript, React Router, node:test, Vite, CSS, npm semver metadata.

---

### Task 1: Add focus derivation and blocker extraction

**Objective:** Produce deterministic, bounded focus-card data without mutating workspace state.

**Files:**
- Modify: `src/lib/projectSignals.ts`
- Modify: `src/lib/projectSignals.test.ts`

**Step 1: Write failing tests**

Add tests proving:

```ts
assert.equal(getBlocker(makeProject({ notes_md: 'Blocker: Waiting for review' })), 'Waiting for review');
assert.equal(getBlocker(makeProject({ notes_md: 'BLOCKER: old\nBlocker: latest' })), 'latest');
assert.equal(getBlocker(makeProject({ notes_md: 'Blocker:   ' })), null);
assert.deepEqual(getFocusProjects(projects).map((p) => p.id), ['newest', 'middle', 'oldest']);
```

Also prove only `in_progress` projects are included, invalid dates remain deterministically ordered, only three are returned, overflow count is reported, and source arrays are unchanged.

**Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='getBlocker|getFocusProjects'`

Expected: FAIL because the helpers do not exist.

**Step 3: Implement minimum helpers**

- `getBlocker(project): string | null` scans lines from newest to oldest for a case-insensitive line-start `Blocker:` label.
- `getFocusProjects(projects)` filters `in_progress`, sorts valid `updated_at` newest first with `id` tie-breaker/fallback, returns `{ projects: firstThree, total }`.
- Reuse `IDEAL_ACTIVE_PROJECTS`; do not introduce another cap constant.

**Step 4: Verify GREEN**

Run: `npm test -- --test-name-pattern='getBlocker|getFocusProjects'`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add src/lib/projectSignals.ts src/lib/projectSignals.test.ts
git commit -m "feat: derive dashboard focus projects"
```

### Task 2: Render the responsive Focus section

**Objective:** Add the approved one-screen focus summary to the existing Dashboard.

**Files:**
- Create: `src/components/FocusProjects.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/index.css`
- Modify: `src/components/projectSignalsRender.test.ts`

**Step 1: Write failing render and CSS tests**

Extend the Vite SSR mock harness to render `FocusProjects` and assert:

- section heading `Focus`;
- exactly three project links when four active projects exist;
- next action, blocker, and freshness labels;
- `No next action recorded` and `No blocker recorded` fallbacks;
- overflow link/copy points to `/review`;
- zero-active empty state links to `/board`.

Add static CSS assertions for a one-column default, three-column desktop media rule, `min-width: 0`, and 44 px project-link target.

**Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='focus projects|focus project targets'`

Expected: FAIL because component/styles are absent.

**Step 3: Implement the component**

`FocusProjects` receives `projects`, calls the helpers, and renders semantic cards with a single main link to `/project/:id`. Keep fallback copy bounded and all labels textual. Add it near the top of `Dashboard`, after page-level notices/header and before filters/project grid; reuse existing panel/badge tokens.

**Step 4: Add responsive CSS**

Use native CSS grid:

```css
.focus-project-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) {
  .focus-project-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

Ensure cards and content can shrink at 320 px, links have `min-height: var(--touch)`, and no fixed widths are introduced.

**Step 5: Verify GREEN**

Run: `npm test -- --test-name-pattern='focus projects|focus project targets'`

Expected: focused tests pass.

**Step 6: Commit**

```bash
git add src/components/FocusProjects.tsx src/pages/Dashboard.tsx src/index.css src/components/projectSignalsRender.test.ts
git commit -m "feat: add dashboard focus strip"
```

### Task 3: Synchronize v0.12.0 release metadata

**Objective:** Ensure the shipped application version is accurate everywhere users and maintainers see it.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/version.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_BOARD_FEATURE_SPEC.md`
- Create: `src/version.test.ts`

**Step 1: Write failing synchronization test**

Add a test that reads package metadata and asserts:

```ts
assert.equal(APP_VERSION, '0.12.0');
assert.equal(packageJson.version, APP_VERSION);
assert.equal(packageLock.version, APP_VERSION);
assert.equal(packageLock.packages[''].version, APP_VERSION);
```

**Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='application version'`

Expected: FAIL with current `0.11.0`.

**Step 3: Bump and document**

Run `npm version 0.12.0 --no-git-tag-version`, update `src/version.ts`, README, and current-version references in the portable feature spec. Add a concise top changelog entry covering Focus Dashboard plus persistence, Cloudflare Access workspace isolation, ETag/If-Match concurrency, conflict-safe CLI, encrypted OneDrive backup, and verified restore drill.

Do not change workspace schema version `1`.

**Step 4: Verify GREEN**

Run: `npm test -- --test-name-pattern='application version'`

Expected: synchronization test passes.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/version.ts src/version.test.ts README.md CHANGELOG.md docs/PROJECT_BOARD_FEATURE_SPEC.md
git commit -m "chore: release project board v0.12.0"
```

### Task 4: Full verification, review, deployment, and production proof

**Objective:** Prove v0.12.0 works locally and in production without harming persistent data.

**Files:**
- No planned source changes; fixes discovered by gates require focused tests and commits.

**Step 1: Run full gates**

```bash
npm test
npm run test:server
npm run test:cli
npm run lint
npm run build
bash deploy/check.sh
git diff --check
git status --short
```

Expected: all tests/build/checks pass; lint may retain only the documented Fast Refresh warning; worktree is clean.

**Step 2: Review**

Run spec-compliance review, then code-quality/security/accessibility review. Resolve every Critical or Important finding and rerun gates.

**Step 3: Back up and deploy**

Create a consistent production SQLite backup with `deploy/backup.mjs`, run `deploy/install.sh`, and verify service health before any push.

**Step 4: Verify production**

- `/api/health` returns success.
- Cloudflare Access still redirects unauthenticated public requests.
- Authenticated workspace still contains exactly 31 projects and three `in_progress` projects.
- Dashboard renders Focus cards with no horizontal overflow at 320 px and 390 px.
- Touch targets are at least 44 px.
- Footer visibly reports `v0.12.0`.
- Existing ETag is returned and no workspace data was rewritten by deployment.
- Backup/offsite/restore timers remain active.

**Step 5: Update Project Board and push**

Use the conflict-safe API/CLI to mark the v0.12.0 milestone and next action. Push `main`, then verify local and remote HEAD match.

```bash
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```
