# Project Board v0.13.0 Automation CLI Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add four conflict-safe API-backed commands so Kei can update blockers, milestones, and next actions without direct database access.

**Architecture:** Reuse the existing dependency-free CLI's GET → mutate → conditional PUT path and validation helpers. Add one activity enum value across the shared TypeScript/server contract, keep workspace schema `1`, and preserve note history by appending canonical lines. No new route, dependency, daemon, database field, or automatic conflict merge.

**Tech Stack:** Node.js ESM, native `fetch`, `node:test`, React/TypeScript, SQLite test server, existing shell deployment tooling.

**Design source:** `docs/superpowers/specs/2026-09-22-automation-cli-v013-design.md`

---

### Task 1: Make cleared blockers resolve to no current blocker

**Objective:** Preserve blocker history while allowing `Blocker: none.` to clear the Focus Dashboard signal.

**Files:**
- Modify: `src/lib/projectSignals.ts:28-36`
- Test: `src/lib/projectSignals.test.ts` (`getBlocker` cases)

**Step 1: Write the failing test**

Add a test proving the newest non-empty blocker sentinel wins instead of falling through to an older blocker:

```ts
it('treats the newest none sentinel as a cleared blocker', () => {
  const project = makeProject({
    notes_md: 'Blocker: Waiting for API\nBlocker: none.',
  });

  assert.equal(getBlocker(project), null);
});
```

Also assert case-insensitive `NONE` and `none.` behavior without changing existing empty-line behavior.

**Step 2: Run the focused test to verify RED**

Run:

```bash
npm test -- --test-name-pattern='getBlocker'
```

Expected: FAIL — current helper returns `none.`.

**Step 3: Implement the minimum sentinel handling**

In `getBlocker`, after trimming a matched value, normalize only for comparison:

```ts
const normalized = value?.toLowerCase().replace(/\.$/, '');
if (normalized === 'none') return null;
if (value) return value;
```

Keep reverse scanning and all prior behavior unchanged.

**Step 4: Verify GREEN**

Run:

```bash
npm test -- --test-name-pattern='getBlocker'
npm test
npm run lint
npm run build
```

Expected: focused and full suites pass; lint has only the pre-existing Fast Refresh warning.

**Step 5: Commit**

```bash
git add src/lib/projectSignals.ts src/lib/projectSignals.test.ts
git commit -m "fix: support cleared project blockers"
```

---

### Task 2: Extend the activity contract with `project_updated`

**Objective:** Accept and render a truthful activity type for CLI metadata updates without changing workspace schema.

**Files:**
- Modify: `src/types.ts:21-29`
- Modify: `server/app.mjs:24-33`
- Modify: `src/pages/Activity.tsx:7-16`
- Test: `server/app.test.mjs`
- Test: the smallest existing Activity render/contract test under `src/**/*.test.ts`; if no suitable test exists, add one assertion to the nearest existing render test rather than creating a new harness.

**Step 1: Write failing contract tests**

Extend the existing valid-workspace server test with an activity event:

```js
{
  id: 'act_update',
  at: '2026-09-22T12:00:00.000Z',
  type: 'project_updated',
  projectId: 'project-board',
  message: 'Updated blocker',
}
```

Assert PUT succeeds. Add a frontend compile/render assertion that the label is `Updated`.

**Step 2: Verify RED**

Run:

```bash
npm run test:server
npm test
```

Expected: server rejects the unknown activity type and TypeScript/label coverage fails until the enum/mapping is extended.

**Step 3: Add the enum value in exactly three production locations**

- Add `'project_updated'` to `ActivityType` in `src/types.ts`.
- Add `'project_updated'` to `ACTIVITY_TYPES` in `server/app.mjs`.
- Add `project_updated: 'Updated'` to `TYPE_LABELS` in `src/pages/Activity.tsx`.

Do not add a schema version, CSS class, icon system, migration, or generic registry.

**Step 4: Verify GREEN**

Run:

```bash
npm run test:server
npm test
npm run lint
npm run build
```

Expected: all pass; existing workspaces and activity types remain valid.

**Step 5: Commit**

```bash
git add src/types.ts server/app.mjs server/app.test.mjs src/pages/Activity.tsx src/**/*.test.ts
git commit -m "feat: record project update activity"
```

Stage only files actually changed; avoid a broad glob if it would include unrelated files.

---

### Task 3: Add the four automation commands through the existing mutation path

**Objective:** Implement `set-blocker`, `clear-blocker`, `add-milestone`, and `set-next` with bounded validation, one activity event, and ETag conflict safety.

**Files:**
- Modify: `scripts/project-board.mjs`
- Test: `scripts/project-board.test.mjs`

**Step 1: Add RED integration tests against the real temporary server**

In `scripts/project-board.test.mjs`, seed a project and verify:

1. `set-blocker PROJECT_ID "Waiting for API"` appends `Blocker: Waiting for API`, preserves prior notes, updates `updated_at`, and adds exactly one newest `project_updated` event.
2. `clear-blocker PROJECT_ID` appends `Blocker: none.` and preserves the prior blocker line.
3. `add-milestone PROJECT_ID "CLI automation approved"` appends a line matching `^Milestone \d{4}-\d{2}-\d{2}: CLI automation approved$` and one activity event.
4. `set-next PROJECT_ID "Deploy v0.13.0"` renames the unfinished step with the smallest `order`, preserves step id/order/done state, recomputes progress, and adds one event.
5. `set-next` with no unfinished step exits nonzero, mentions `add-step`, and leaves ETag/workspace unchanged.
6. Blank or 2001-character blocker/milestone text and 401-character next-step text fail before PUT and leave ETag/workspace unchanged.
7. Unknown project ids fail before PUT.
8. Route one new command through the existing conflict proxy and assert exit code `2`, exact bounded conflict message, and winner data preserved.

Prefer one table-driven mutation test plus focused no-write/conflict tests; do not duplicate the server harness.

**Step 2: Verify RED**

Run:

```bash
npm run test:cli
```

Expected: FAIL — commands are unknown.

**Step 3: Extend help and command dispatch**

Add these usage lines:

```text
  set-blocker PROJECT_ID TEXT
  clear-blocker PROJECT_ID
  add-milestone PROJECT_ID TEXT
  set-next PROJECT_ID TEXT
```

Dispatch each command from `executeCommand` using the existing positional pattern. Require exact arity where a command has no free-text tail; free text is `positionals.slice(2).join(' ')` so quoted and unquoted words behave like `add-step`.

**Step 4: Add one append helper and four minimum mutation functions**

Reuse `requireBoundedId`, `requireText`, `findProject`, `nowIso`, `progress`, and `addActivity`. Add only a small note append helper:

```js
function appendNote(project, line) {
  project.notes_md = `${project.notes_md.trimEnd()}${project.notes_md.trimEnd() ? '\n' : ''}${line}`;
}
```

Use the server-compatible limits already declared:

- blocker and milestone text: `MAX_SUMMARY_CHARS` (`2000`);
- next-step title: `MAX_TITLE_CHARS` (`400`).

Mutation rules:

```js
// set-blocker
appendNote(project, `Blocker: ${text}`);

// clear-blocker
appendNote(project, 'Blocker: none.');

// add-milestone
appendNote(project, `Milestone ${nowIso().slice(0, 10)}: ${text}`);

// set-next
const step = [...project.steps]
  .filter((entry) => !entry.done)
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
if (!step) throw new CliError('no unfinished step; use add-step first');
step.title = title;
project.progress_pct = progress(project.steps);
```

For each successful function, set one timestamp on `project.updated_at`, add exactly one `project_updated` activity, and return the changed project or step. Messages must be plain, bounded, and must not include credentials.

Do not add automatic retries, direct SQLite access, a generic command framework, or note editing.

**Step 5: Verify GREEN and regression safety**

Run:

```bash
npm run test:cli
npm run test:server
npm test
npm run lint
npm run build
git diff --check
```

Expected: CLI count increases and all suites pass; conflict test remains exit code `2`.

**Step 6: Commit**

```bash
git add scripts/project-board.mjs scripts/project-board.test.mjs
git commit -m "feat: automate project signal updates"
```

---

### Task 4: Release v0.13.0 with synchronized metadata and documentation

**Objective:** Publish honest version metadata and command documentation while retaining workspace schema `1`.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/version.ts`
- Modify: `src/version.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/PROJECT_BOARD_FEATURE_SPEC.md`

**Step 1: Make the version synchronization test RED**

Change only the expected version in `src/version.test.ts`:

```ts
assert.equal(APP_VERSION, '0.13.0');
```

Run:

```bash
npm test -- --test-name-pattern='application version'
```

Expected: FAIL — runtime/package metadata still reports `0.12.0`.

**Step 2: Synchronize package and runtime metadata**

Run:

```bash
npm version 0.13.0 --no-git-tag-version
```

Update `src/version.ts` to `0.13.0`.

**Step 3: Document only shipped behavior**

- Add a top `0.13.0` changelog entry describing the four commands, ETag safety, `project_updated`, and unchanged schema.
- Add concise CLI examples to README using `--owner aichriszme@gmail.com` and the default loopback URL; include no secret/token.
- Update current-version references and add a v0.13 capability section in `docs/PROJECT_BOARD_FEATURE_SPEC.md`.
- Preserve all historical v0.12/v0.11 wording as historical text.

**Step 4: Verify GREEN**

Run:

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
```

Expected: all tests/build/checks pass; `npm audit` reports zero vulnerabilities; only the known Fast Refresh warning may remain.

Verify synchronized values programmatically:

```bash
node -e "const p=require('./package.json'),l=require('./package-lock.json'); if(p.version!=='0.13.0'||l.version!=='0.13.0'||l.packages[''].version!=='0.13.0') process.exit(1)"
```

**Step 5: Commit**

```bash
git add package.json package-lock.json src/version.ts src/version.test.ts README.md CHANGELOG.md docs/PROJECT_BOARD_FEATURE_SPEC.md
git commit -m "chore: release project board v0.13.0"
```

---

### Task 5: Review, deploy atomically, and verify production

**Objective:** Release v0.13.0 without losing workspace data and prove the real API/CLI/backup path works.

**Files:**
- No planned source changes. Any review fix requires its own minimal tested commit and, because it changes the application after the release commit, a corresponding semantic version decision before deployment.

**Step 1: Two-stage review**

Dispatch independent read-only reviewers:

1. Spec compliance against `docs/superpowers/specs/2026-09-22-automation-cli-v013-design.md` and this plan.
2. Code quality/security review focused on validation-before-write, note bounds, activity validation, ETag conflict behavior, schema stability, and accidental secrets.

Expected: no Critical or Important findings before deployment.

**Step 2: Re-run final gates at exact HEAD**

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
test -z "$(git status --short)"
```

Expected: all pass and worktree is clean.

**Step 3: Create a consistent production backup**

Use the deployed backup script as service user against:

- database: `/var/lib/project-board/project-board.db`
- backup directory: `/var/backups/project-board`

Record the exact created snapshot path. Do not copy live DB/WAL/SHM files directly.

**Step 4: Deploy with the existing atomic installer**

Run the repository's documented `deploy/install.sh` path only after backup and checks. Verify:

```bash
systemctl is-active project-board.service
curl -fsS http://127.0.0.1:8780/api/health
```

Expected: `active` and `{"ok":true}`.

**Step 5: Production-smoke all four commands without fabricating project progress**

Use the real Project Board project and reversible test values:

1. Inspect and save its current notes, steps, ETag, and project count.
2. `set-blocker project-board "v0.13 production smoke"`; verify the line and one `project_updated` event.
3. `clear-blocker project-board`; verify Focus semantics resolve to no blocker and history remains.
4. `add-milestone project-board "v0.13 production smoke"`; verify the dated line.
5. For `set-next`, use a deliberately added temporary unfinished step via existing `add-step`, rename that exact first unfinished step, verify, then mark/remove or supersede it according to existing supported commands. Do not alter another project's real next action.
6. Confirm every successful mutation changes ETag and total inventory remains exactly 31.

If reversible cleanup cannot be expressed through supported commands without history damage, keep a clearly labeled verified smoke milestone/activity rather than editing SQLite or replaying an old workspace over concurrent writes.

**Step 6: Record the real release state through the new CLI**

After smoke verification, use the new commands to record the factual v0.13.0 milestone and next action/blocker state for Project Board. Read back through `inspect`, and verify:

- Project Board remains `done` at 100%;
- three active projects remain unchanged;
- status totals remain 3 `in_progress`, 7 `paused`, 21 `done`;
- activity is newest-first and capped at 100;
- workspace schema remains `1`.

**Step 7: Verify offsite backup and public protection**

Start the existing offsite backup service, verify successful completion, and record the latest Restic snapshot id without exposing credentials. Confirm public `https://projects.aichrisz.com` still redirects unauthenticated requests through Cloudflare Access and origin remains loopback-only.

**Step 8: Push and prove SHA alignment**

```bash
git push origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git ls-remote origin refs/heads/main | cut -f1)
test "$LOCAL" = "$REMOTE"
```

Also verify the deployed release identifies v0.13.0 and the local health endpoint remains healthy.

**Step 9: Final report**

Report only:

- production URL and version;
- exact test counts and non-blocking warnings;
- production project/status counts;
- backup path and Restic snapshot id;
- deployed/local/remote SHA;
- anything genuinely left unresolved.
