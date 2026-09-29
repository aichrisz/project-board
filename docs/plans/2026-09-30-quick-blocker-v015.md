# Project Board v0.15.0 Quick Blocker Updates Implementation Plan

> **For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.**

**Goal:** Add append-only blocker editing to Dashboard project cards and correct `complete-step` dry-run project ownership, then release Project Board v0.15.0.

**Architecture:** Reuse `getBlocker`, project notes, the existing project store refs and workspace save queue, existing card and Dashboard components, and the current CLI simulation path. Add one pure blocker validation/note helper, one current-store blocker mutation, a compact card editor, and preview-only explicit project resolution for duplicate step IDs. Keep workspace/export schema at `version: 1`; add no dependency, route, stored field, background worker, or production code path.

**Tech Stack:** React 19, TypeScript 6, `react-router` 8.3.0, Node.js ESM, native `node:test`, oxlint, Vite, existing SQLite test server, CSS, existing isolated Chromium workflow.

**Design source:** `docs/superpowers/specs/2026-09-30-quick-blocker-v015-design.md`

**Execution boundary:** This document is an implementation plan only. All application and release work below is future work. Do not deploy, mutate production data, publish, or push while writing or reviewing this plan.

## Design contracts

- Reuse `getBlocker(project)` as current-blocker parser. Display blocker text in `.card-signals`, including when next action and freshness are absent.
- Keep editor state inside `ProjectCard`. `Blocker` opens labeled single-line input; input starts with current blocker or blank. `Save`, `Cancel`, and conditional `Clear` actions wrap safely. Blocker and step-add editors never render together.
- Validate trimmed text before mutation: nonblank, no `\r`/`\n`, not `none` or `none.` in any case, and no more than the CLI's 2,000-character blocker limit. Enforce existing 200,000-character notes limit after append. Invalid input keeps focus/editor open and exposes an accessible error.
- Append `Blocker: <text>` or exactly `Blocker: none`; never remove prior blocker or note lines and never change project status. Keep existing append-note trailing-whitespace behavior where it preserves older note content.
- Compare with the current parsed blocker before append. Unchanged Save and Clear without a blocker produce no project update, no activity event, and no remote write.
- Resolve project by ID from `projectsRef.current` inside the store mutation. Build appended notes from that current project, not the `ProjectCard` prop captured when editing opened. A successful set or clear updates `updated_at` and emits exactly one factual `project_updated` event.
- Reuse `queueRemoteWorkspaceSave` and its ETag behavior. A 412 blocks later writes pending reload; never retry or overwrite. Do not show a “saved” success claim before server acknowledgment. Keep `Layout`'s existing save/conflict banners as the sync error surface.
- Open focuses input; Cancel, Escape, accepted Save, and Clear return focus to the Blocker opener. Enter submits. Stop editor key events from reaching global shortcuts; existing shortcut behavior outside the editor stays unchanged.
- Keep each blocker action at least 44px high, with wrapping and no horizontal overflow at 320px, 390px, or desktop.
- CLI fix changes preview project selection only. Keep `completeStep` mutation lookup, both `complete-step` and `complete step` aliases, terminal-safe text, raw JSON, ETag simulation, and dry-run zero-PUT behavior unchanged.
- Do not touch runtime version or release docs until all feature slices, reviews, test gates, and browser checks pass.

## Task 1: Define append-only blocker policy

**Objective:** Add testable blocker input and note rules using existing `getBlocker` semantics and CLI limits.

**Files:**
- Create: `src/lib/blocker.ts`
- Create: `src/lib/blocker.test.ts`
- Reuse: `src/lib/projectSignals.ts` (`getBlocker`)
- Reuse as reference: `scripts/project-board.mjs` (`MAX_SUMMARY_CHARS`, `MAX_NOTES_CHARS`, `appendNote`)

**Step 1 — RED tests:** Cover trim behavior, blank input, CR/LF rejection, case-insensitive `none` and `none.` rejection, 2,000 accepted / 2,001 rejected, appending after existing notes, historical blocker preservation, `Blocker: none` clearing, unchanged Save, Clear without a current blocker, and note overflow at 200,000 characters. Test append against a newer project notes value to establish that callers must provide current notes, not editor-open notes. Verify status preservation at store/UI integration, not in a notes-only helper test.

Run:

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='blocker note policy' "src/**/*.test.ts"
```

Expected: RED because the helper module and tests do not exist yet.

**Step 2 — Minimal GREEN implementation:** Export a small validator and append helper. Keep parsing in `getBlocker`; helper accepts the current notes/current blocker and requested value or clear operation. Return a no-op result for unchanged set / missing blocker clear, and a validation error before producing changed notes when bounds fail.

Example contract:

```ts
const validation = validateBlockerText(draft);
if (!validation.ok) return validation;
const nextNotes = appendBlockerNote(currentProject.notes_md, getBlocker(currentProject), validation.value);
```

The helper must not mutate its input project or notes and must preserve all prior note lines.

**Step 3 — Verify GREEN:**

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='blocker note policy' "src/**/*.test.ts"
npm run lint
npm run build
git diff --check
```

Expected: focused tests and checks pass; no new package or schema change.

**Step 4 — Independent reviews:** First obtain an independent spec review against the approved design; then obtain a separate quality/security review of limits, sentinel parsing, no-op behavior, history retention, and mutation-free helpers. Fix Critical/Important findings test-first and rerun focused checks before Task 2.

## Task 2: Add current-store blocker mutation

**Objective:** Write notes from the live project ref and produce exactly one activity event per accepted change.

**Files:**
- Modify: `src/store/ProjectContext.tsx`
- Reuse: `src/lib/blocker.ts`, `src/lib/projectSignals.ts`, `src/lib/activity.ts`, `src/lib/remoteWorkspace.ts`
- Reuse: `src/components/Layout.tsx` existing `remotePersistenceError` and `reloadRequired` banners

**Step 1 — RED tests:** Extend blocker policy tests for current notes being appended, missing project/no-op results, unchanged set, clear without a current blocker, and note-limit rejection. Assert the pure helper distinguishes changed/no-op/rejected outcomes. Verify one `project_updated` event and no status event through Task 3 isolated browser integration; do not claim a helper test covers React store wiring. Keep tests on native `node:test`; add no React test dependency.

Run:

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='blocker note policy|blocker mutation' "src/**/*.test.ts"
```

Expected: RED for missing store mutation/result contract.

**Step 2 — Implement store API:** Add one blocker-specific context action that accepts project ID plus set/clear intent. Resolve the project from `projectsRef.current` at invocation, derive current blocker from its latest `notes_md`, invoke the pure helper, and return without commit/activity on no-op or rejection. On accepted change, commit the updated project and call `pushActivity(makeActivity('project_updated', ...))` exactly once. Do not call generic `updateProject` plus a second event; do not alter status. Let existing workspace effect enqueue the combined projects/activity snapshot and preserve existing failure/conflict behavior.

**Step 3 — Verify GREEN:**

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='blocker note policy|blocker mutation' "src/**/*.test.ts"
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='remote workspace API bridge' "src/**/*.test.ts"
npm run lint
npm run build
git diff --check
```

Expected: no-op/rejected operations create no change; accepted set/clear emits one factual event; existing 412 tests continue to prove conflict blocks future writes without retry.

**Step 4 — Independent reviews:** Run independent spec review first, quality/security review second. Focus review on current-ref resolution, max note bounds, exactly-one activity event, conflict blocking, and the absence of success claims before acknowledgment. Resolve Critical/Important findings and rerun focused tests before Task 3.

## Task 3: Wire accessible Dashboard card editor

**Objective:** Add blocker display and focused, keyboard-safe editing without changing card or Board behavior.

**Files:**
- Modify: `src/components/ProjectCard.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/index.css`
- Modify: `src/components/projectSignalsRender.test.ts`
- Reuse: `src/lib/projectSignals.ts` (`getBlocker`)
- Reuse: `src/hooks/useDialogFocus.ts` only if its modal/trap behavior fits; do not turn the inline editor into a modal

**Step 1 — RED render checks:** Extend current Vite SSR render test for visible blocker text, labeled Blocker control, and unchanged default card rendering. Add the callback to the ProjectCard test type and the dashboard mock context; use TypeScript build to verify Dashboard wiring. Add helper tests for invalid-message cases where appropriate; existing SSR harness has no DOM interaction library, so do not add dependencies or pretend SSR covers keystrokes.

Run:

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='ProjectCard.*blocker|project signal component rendering' "src/**/*.test.ts"
```

Expected: RED because ProjectCard has no blocker prop, signal, editor, or Dashboard wiring.

**Step 2 — Implement editor lifecycle:** Add a blocker action callback to `ProjectCard` and pass store action from Dashboard. Keep blocker form mutually exclusive with step-add form. On open capture opener and focus the single-line input initialized from `getBlocker(project)`. Validate on submit; invalid input remains open with an associated `aria-describedby` message and alert/status semantics. Enter submits; Escape and Cancel discard draft with no write. Render Clear only when current blocker exists. Clear uses current project ID and clear intent, not a captured `notes_md` value. Return focus to opener after each close. Prevent form keydown bubbling so global shortcuts do not navigate while editor/action buttons own focus. Do not announce remote success; retain Layout's existing sync/conflict messages.

Example submit flow:

```tsx
<form onSubmit={saveBlocker} onKeyDown={(event) => event.stopPropagation()}>
  <label htmlFor={blockerInputId}>Blocker</label>
  <input ref={blockerInputRef} id={blockerInputId} value={draft} />
  <button type="submit">Save</button>
</form>
```

**Step 3 — Add minimal responsive styling:** Reuse existing card signal, card quick, button, input, focus-ring, and spacing tokens. Give all blocker controls `min-height: 44px`; use `min-width: 0`, flex wrapping, and safe text wrapping. Avoid global button/input changes.

**Step 4 — Verify automated checks:**

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='ProjectCard.*blocker|project signal component rendering' "src/**/*.test.ts"
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='blocker note policy|blocker mutation' "src/**/*.test.ts"
npm run lint
npm run build
git diff --check
```

Expected: signal SSR and pure policy checks pass; existing components/tests remain unchanged outside requested integration.

**Step 5 — Isolated Chromium interaction checks:** Run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4178 --strictPort`. Open the local preview in a fresh isolated `agent-browser`/Chromium profile, visit Settings, and load realistic inventory through the existing merge control; never open production or an existing personal browser profile. At **320px**, **390px**, and **1440px** desktop, verify: current blocker visible; one editor only; input focus and prefill; Enter saves trimmed text; invalid blank/newline/sentinel/oversize input stays open and exposes its error; unchanged Save and absent Clear create no activity; Clear appears only with a blocker and appends exactly `Blocker: none`; Cancel/Escape discard; focus returns to opener; one `project_updated` event per accepted set/clear; old notes remain and no status changes; Focus/Review reflect latest `getBlocker`; action targets remain ≥44px; controls wrap without horizontal overflow; pressing global shortcut letters while input or editor buttons own focus does not navigate; tabbing and mobile bottom navigation remain usable. The static preview may show the existing remote-unavailable banner; do not treat local state as server acknowledgment. Verify 412/no-retry behavior in existing remote workspace tests, not against production.

**Step 6 — Independent reviews:** After browser check, run independent spec review then independent quality/accessibility/security review. Inspect labels, error announcement, focus restoration, shortcut suppression, 320/390 wrap, no success claim before server acknowledgment, live ref lookup, and one-event semantics. Fix Critical/Important findings and rerun browser plus focused checks before Task 4.

## Task 4: Fix duplicate-step CLI preview ownership

**Objective:** Resolve dry-run project display from explicit target for `complete-step` only, without changing mutation lookup or output contracts.

**Files:**
- Modify: `scripts/project-board.mjs`
- Modify: `scripts/project-board.test.mjs`
- Reuse: existing `executeCommand`, `describeCommand`, `simulateCommand`, preview text/JSON, test SQLite server, `withProxy`, and workspace/ETag helpers

**Step 1 — RED regression fixture:** Create two projects with a shared step ID; order first-project first and target second-project. Exercise canonical `complete-step` in text format and alias `complete step` in JSON format. Assert text names second project. Assert JSON simulated workspace marks only second project's matching step done and records `step_toggled` against second project. Capture source ETag/workspace and proxy PUT count. Assert `putCount() === 0`, then reload and assert ETag equality and deep workspace equality.

Run:

```bash
node --test --test-name-pattern='duplicate step preview ownership' scripts/project-board.test.mjs
```

Expected: RED because `previewProject` currently finds first step owner by returned step ID.

**Step 2 — Minimal preview-only fix:** Resolve canonical/alias project positional for `complete-step` before selecting preview owner. Pass explicit target to preview-project formatting for this command, preferring project ID lookup in before/after simulated workspaces. Leave `completeStep(workspace, positionals)` and its project-scoped mutation lookup unchanged. Keep `previewText` sanitization and JSON envelope values raw.

Example boundary:

```js
const targetProjectId = command === 'complete-step'
  ? projectIdFromCompleteStep(positionals)
  : undefined;
const project = previewProject(beforeWorkspace, afterWorkspace, result, targetProjectId);
```

**Step 3 — Verify GREEN:**

```bash
node --test --test-name-pattern='duplicate step preview ownership' scripts/project-board.test.mjs
npm run test:cli
```

Expected: focused and full CLI tests pass; dry run sends exactly zero PUTs, leaves ETag and workspace unchanged, aliases still work, text stays terminal-safe, and JSON preserves raw values.

**Step 4 — Independent reviews:** Run independent spec review then independent quality/security review. Confirm target extraction covers canonical and alias forms, preview-only code uses explicit project ID, mutation ownership is untouched, zero-PUT assertion is explicit, and sanitized text/raw JSON tests still pass. Resolve Critical/Important findings before Task 5.

## Task 5: Release metadata and user documentation

**Objective:** Synchronize v0.15.0 metadata only after all feature tasks and reviews pass; preserve workspace schema `1`.

**Files:**
- Modify only at this final release stage: `package.json`, `package-lock.json`, `src/version.ts`, `src/version.test.ts`, `README.md`, `CHANGELOG.md`, `docs/PROJECT_BOARD_FEATURE_SPEC.md`
- Do not modify deployment scripts, runtime credentials, server schema, or export version.

**Step 1 — Version test RED:** Update expected runtime release version to `0.15.0`; run focused version test before synchronizing package metadata.

```bash
node --import ./scripts/test-resolve-hook.mjs --test --test-name-pattern='application version' "src/**/*.test.ts"
```

Expected: RED until package and lockfile metadata advance from `0.14.0`.

**Step 2 — Synchronize release metadata:** Set package, lockfile root/package versions, and `APP_VERSION` to `0.15.0`. Add changelog and README entry for append-only Dashboard blocker updates and duplicate-step preview ownership. Update current version/capability/checklist/end references in portable feature spec while preserving historical sections. State workspace/export schema remains `version: 1` and no dependency was added. Do not change version metadata earlier in implementation.

**Step 3 — Verify full release gates:**

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
node -e "const p=require('./package.json'),l=require('./package-lock.json'); if(p.version!=='0.15.0'||l.version!=='0.15.0'||l.packages[''].version!=='0.15.0') process.exit(1)"
```

Expected: all frontend, server, CLI, lint, production/Pages builds, deployment checks, audit, synchronized-version check, and whitespace checks pass. Do not hide unrelated existing failures; stop and report them without unrelated fixes.

## Task 6: Adversarial integration review and release gates

**Objective:** Challenge cross-slice invariants, deploy only after all gates pass, and verify backup/readback/offsite/push chain.

**Step 1 — Adversarial integration review:** Independent reviewer reads the entire change against approved spec and this plan, with adversarial focus on note history loss, notes over-limit, stale card props, repeated/no-op activity, status mutation, unacknowledged sync success, blind 412 retry, editor/step-editor overlap, hidden/unclear errors, focus theft, shortcut leakage, 320px overflow, duplicate IDs, positional alias parsing, preview mutation contamination, terminal escapes, raw JSON changes, and accidental release/deployment scope. Resolve Critical/Important findings with focused RED-first regressions; rerun every affected gate and both independent reviews for that slice.

**Step 2 — Fresh exact-HEAD gates:** Re-run all commands from Task 5 plus isolated Chromium checks after review fixes. Require clean worktree and prove changed files are exactly planned application/release files. Confirm no secret values, auth headers, cookies, production workspace payloads, or local browser data entered source, docs, logs, or commits.

**Step 3 — Consistent pre-deploy backup:** Only after release approval, create a fresh SQLite online backup using existing `deploy/backup.mjs` / service-owned backup path. Record backup file path and verify `PRAGMA integrity_check`; never copy active DB/WAL/SHM files directly. Keep backup outside Git.

**Step 4 — Atomic deployment:** Use existing `deploy/install.sh` only after backup and gates. It validates configuration, backs up before staging, swaps staged release atomically, and restores prior release on failure. Do not edit or bypass deployment scripts. Verify service and backup/offsite/restore-drill timers remain active.

**Step 5 — Production readback:** Verify loopback health and deployed version `0.15.0`; read back authenticated workspace through existing owner session and confirm existing project inventory, statuses, notes, and schema remain unchanged by release. If running production CLI smoke, use read-only inspection or `--dry-run` only; prove ETag and workspace are unchanged and output contains no credentials. Do not create test blockers or duplicate projects in production.

**Step 6 — Offsite verification and publication:** Run existing encrypted offsite backup, repository check, and restore drill; verify restored SQLite integrity and expected project inventory without exposing secrets. Push the verified release commit through the existing `main` workflow only after production and offsite readback pass; verify remote `main` SHA exactly matches deployed commit SHA. This is a future release gate, not an action in this plan-writing task.

**Step 7 — Release report:** Record commit SHA, exact automated check results, browser viewport outcomes, pre-deploy backup path/integrity result, deployed version/health, workspace readback result, offsite snapshot/restore result, and remote SHA alignment. Exclude credential values, tokens, cookies, and workspace contents.
