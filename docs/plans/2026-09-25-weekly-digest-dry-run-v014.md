# Project Board v0.14.0 Weekly Digest & CLI Dry Run Implementation Plan

> **For Hermes:** Execute implementation task-by-task with OpenCode using model `opencode-go/deepseek-v4.1-flash`, strict TDD, then independent spec and quality reviews.

**Goal:** Add a read-only Guided Brief to Weekly Review and a no-write CLI mutation preview with text/JSON output, then release v0.14.0.

**Architecture:** Weekly Digest uses pure derivation helpers over existing projects/activity and a small Review component. CLI dry-run reuses existing parsing, API GET, mutation functions, validation, and outputs, but skips PUT. Workspace schema remains `1`; no dependency, route, persistence field, AI, scheduler, or generic diff framework is added.

**Tech Stack:** React 19, TypeScript, Node.js ESM, native `fetch`, `node:test`, existing SQLite test server, CSS, Vite.

**Design source:** `docs/superpowers/specs/2026-09-25-weekly-digest-dry-run-v014-design.md`

---

### Task 1: Derive Weekly Digest data with pure helpers

**Objective:** Produce deterministic `Keep moving`, `Needs attention`, and `Latest wins` data without mutation.

**Files:**
- Create: `src/lib/weeklyDigest.ts`
- Create: `src/lib/weeklyDigest.test.ts`
- Reuse: `src/lib/projectSignals.ts`
- Reuse types: `src/types.ts`

**Step 1: Write RED tests**

Create fixtures and test:

- Keep moving reuses `getFocusProjects`, max three, and exposes existing next action/blocker/freshness.
- Attention list deduplicates projects with blocker plus freshness.
- Attention order is blocker+Review, blocker, Review, Quiet; then valid newest `updated_at`; then id.
- Attention max is five and inputs remain unchanged.
- Parse only `Milestone YYYY-MM-DD: non-empty text`, case-insensitive keyword, valid real calendar date.
- Dedupe identical project/date/text milestones.
- Include only unambiguous completed-step and status→done activities.
- Exclude generic updates, blockers, imports, resets, malformed notes/dates.
- Latest wins order newest-first then stable key, max five, no input mutation.

Run:

```bash
npm test -- --test-name-pattern='weekly digest'
```

Expected: RED because module/exports are missing.

**Step 2: Implement minimum pure module**

Export focused functions/types:

```ts
export function deriveKeepMoving(projects: Project[]): DigestFocusItem[]
export function deriveNeedsAttention(projects: Project[]): DigestAttentionItem[]
export function deriveLatestWins(projects: Project[], activity: ActivityEvent[]): DigestWin[]
```

Reuse `getFocusProjects`, `getNextAction`, `getBlocker`, and `getFreshness`. Keep parsing local; do not change schema or persist normalized values.

**Step 3: Verify GREEN**

```bash
npm test -- --test-name-pattern='weekly digest'
npm test
npm run lint
npm run build
git diff --check
```

Expected: all pass; only the known Fast Refresh warning may remain.

**Step 4: Commit**

```bash
git add src/lib/weeklyDigest.ts src/lib/weeklyDigest.test.ts
git commit -m "feat: derive weekly digest"
```

---

### Task 2: Render Guided Brief in Weekly Review

**Objective:** Add the selected Weekly Digest B layout above Review KPIs, mobile-first and accessible.

**Files:**
- Create: `src/components/WeeklyDigest.tsx`
- Modify: `src/pages/Review.tsx`
- Modify: `src/index.css`
- Test: nearest existing render test under `src/**/*.test.ts`; create `src/components/WeeklyDigest.test.ts` only if the current lightweight Vite render harness cannot cover it cleanly.

**Step 1: Write RED render/integration tests**

Test:

- headings `Weekly digest`, `Keep moving`, `Needs attention`, `Latest wins`;
- max three active projects and max five attention/wins;
- next action, blocker fallback, freshness, and project links;
- three empty-state messages;
- Review mounts one digest before KPI content;
- CSS contains one-column default and two-column desktop breakpoint;
- linked names keep visible focus styling and dense actions meet existing 44px convention.

Run focused test and expect RED due missing component/mount/CSS.

**Step 2: Implement minimum component and mount**

`WeeklyDigest` receives only:

```ts
{ projects: Project[]; activity: ActivityEvent[] }
```

It calls pure helpers with `useMemo` only when useful. Mount after status banner and before `.review-kpi-row`. Do not add context mutations, controls, route, storage, animation library, or new design tokens.

**Step 3: Add minimal responsive CSS**

Reuse Review panel typography and colors. Default to one column; at the existing desktop breakpoint use a two-column grid with left stack and right Latest wins. Add `min-width: 0` and wrapping guards.

**Step 4: Verify**

```bash
npm test
npm run lint
npm run build
npm run build:pages
git diff --check
```

Then run real Chromium checks at 320×844, 390×844, and desktop:

- no horizontal overflow;
- digest appears once before KPI row;
- links focus visibly;
- all three sections readable.

**Step 5: Commit**

```bash
git add src/components/WeeklyDigest.tsx src/pages/Review.tsx src/index.css <actual-test-file>
git commit -m "feat: add weekly digest brief"
```

---

### Task 3: Add CLI mutation previews

**Objective:** Support `--dry-run` and `--format text|json` for mutations while guaranteeing no PUT.

**Files:**
- Modify: `scripts/project-board.mjs`
- Modify: `scripts/project-board.test.mjs`

**Step 1: Add RED real-server integration tests**

Extend the existing temporary API/SQLite harness. Cover:

- `--dry-run` default text for representative commands from each mutation family: add project, set status, add/complete step, blocker/milestone/next action;
- each preview leaves live workspace and ETag byte-for-byte unchanged;
- aliases are recognized as mutations;
- text output contains no credentials/header/cookie values;
- `--dry-run --format json` emits exactly one envelope with `dryRun`, source `etag`, canonical command name, result, and full simulated workspace;
- generated preview ids/timestamps exist only in simulated output;
- invalid/missing project, note overflow, oversized text, and no unfinished step retain existing errors and do not PUT;
- dry-run on `list`/`inspect` is rejected;
- `--format` without dry-run, invalid format, missing format value, and duplicate flags are rejected;
- subsequent real mutation performs fresh GET+PUT and conflict still exits `2` preserving winner.

Run:

```bash
npm run test:cli
```

Expected: RED on unknown `--dry-run`/`--format`.

**Step 2: Extend parsing minimally**

- Add `dry-run` as a boolean global option.
- Add `format` as a valued global option accepting only `text|json`.
- Preserve duplicate/unknown option protection.
- Derive a canonical command descriptor from existing aliases; do not build a generic command framework.
- Validate read/mutation compatibility before GET where possible.

**Step 3: Reuse the mutation path without PUT**

For dry-run:

1. GET workspace + ETag;
2. `structuredClone` the validated workspace;
3. capture only the small command-aware before state needed for text output;
4. execute the existing mutation on clone;
5. return a preview object and skip `putWorkspace`.

Real command flow remains unchanged.

**Step 4: Format output**

Refactor `main` only enough to print either:

- existing JSON result for normal commands;
- concise deterministic text for default dry-run;
- exact JSON envelope for `--format json`.

No generic recursive diff, replay token, or reservation.

**Step 5: Verify**

```bash
npm run test:cli
npm run test:server
npm test
npm run lint
npm run build
npm run build:pages
git diff --check
```

Expected: all pass, conflict remains exit `2`, no PUT in previews.

**Step 6: Commit**

```bash
git add scripts/project-board.mjs scripts/project-board.test.mjs
git commit -m "feat: preview CLI mutations"
```

---

### Task 4: Synchronize v0.14.0 metadata and docs

**Objective:** Release both features honestly while keeping schema `1`.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_BOARD_FEATURE_SPEC.md`

**Step 1: Make version test RED**

Set expected version to `0.14.0`, run focused version test, and observe mismatch with `0.13.0`.

**Step 2: Synchronize versions**

```bash
npm version 0.14.0 --no-git-tag-version
```

Update `src/version.ts`.

**Step 3: Document shipped behavior**

- Top changelog entry for Guided Brief and CLI dry-run.
- README examples for default text and `--format json`.
- Explicitly state preview is no-write, based on one ETag revision, and not a reservation.
- Update portable spec current/shipped/checklist/end references and add v0.14 section.
- Preserve v0.13/v0.12 history.
- State schema remains `1` and no dependency was added.

**Step 4: Full verification**

```bash
npm test
npm run test:server
npm run test:cli
npm run lint
npm run build
npm run build:pages
bash deploy/check.sh
npm audit
git diff --check
node -e "const p=require('./package.json'),l=require('./package-lock.json'); if(p.version!=='0.14.0'||l.version!=='0.14.0'||l.packages[''].version!=='0.14.0') process.exit(1)"
```

**Step 5: Commit**

```bash
git add package.json package-lock.json src/version.ts src/version.test.ts README.md CHANGELOG.md docs/PROJECT_BOARD_FEATURE_SPEC.md
git commit -m "chore: release project board v0.14.0"
```

---

### Task 5: Review, deploy, and verify production

**Objective:** Release v0.14.0 without data loss and prove both features against production.

**Step 1: Independent reviews**

Run spec-compliance then quality/security review for every implementation task. Fix all Critical/Important findings with RED-first regressions and re-review. Finish with one full-range integration review.

**Step 2: Fresh exact-HEAD gates**

Run all frontend/server/CLI/lint/build/Pages/deploy/audit/diff checks and require a clean worktree.

**Step 3: Consistent backup and atomic deploy**

Create a SQLite snapshot using the deployed service-owned backup command. Verify integrity, record exact path, then use existing `deploy/install.sh`. Verify service health and version `0.14.0`.

**Step 4: Production Weekly Digest QA**

Using authenticated workspace data:

- verify Guided Brief appears once before KPIs;
- verify three focus projects and factual attention/win content;
- verify 320px/390px no overflow and desktop two-column layout;
- verify keyboard focus and project links;
- do not mutate live project state for visual QA.

**Step 5: Production dry-run smoke**

Run text and JSON previews against the real Project Board project. Before/after each preview, prove:

- ETag unchanged;
- workspace JSON unchanged;
- inventory stays 31 and status distribution stays 3/7/21;
- simulated output contains the expected mutation and activity;
- no secret/header/cookie output.

Then perform one factual real mutation (v0.14 milestone) through the normal CLI, prove ETag changes once, and read it back.

**Step 6: Recovery and publication**

Run encrypted offsite backup; record latest Restic snapshot id. Confirm Cloudflare Access redirect and loopback-only origin. Push `main`; verify local and remote SHA match.

**Step 7: Final report**

Report production URL/version, exact test counts, project counts, backup path, Restic snapshot id, commit SHA alignment, and only genuine unresolved warnings.
