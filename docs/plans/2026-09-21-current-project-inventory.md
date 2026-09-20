# Current Project Inventory Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the stale seed with Abel's current curated products/tools/games and initialize the persistent production workspace.

**Architecture:** Keep the existing static `SEED_PROJECTS` and version-1 SQLite workspace schema. Curate one deduplicated inventory from GitHub plus local checkouts, test its membership and structural invariants, deploy through the existing installer, then initialize the single authorized owner's workspace after taking a backup.

**Tech Stack:** React, TypeScript, Node test runner, Node SQLite, systemd, Cloudflare Tunnel/Access.

---

### Task 1: Establish the curated inventory contract

**Objective:** Make the expected inclusion, exclusion, uniqueness, and schema rules executable before changing seed data.

**Files:**
- Create: `src/data/seed.test.ts`
- Inspect: `src/data/seed.ts`

**Step 1: Write failing test**

Import `SEED_PROJECTS`; assert the approved current project IDs are present, known backup/vault/artifact/demo/duplicate IDs are absent, IDs/slugs are unique, project links use `https:` or absolute local paths, and existing type/status allow-lists are respected.

**Step 2: Run test to verify failure**

Run: `npm test -- src/data/seed.test.ts`
Expected: FAIL because the old eight-project seed omits current projects and contains retired inventory entries.

**Step 3: Commit the RED test**

```bash
git add src/data/seed.test.ts
git commit -m "test: define current project inventory"
```

### Task 2: Replace the stale seed

**Objective:** Populate the tested inventory with factual project metadata and no speculative roadmap.

**Files:**
- Modify: `src/data/seed.ts`

**Step 1: Replace seed entries**

Use stable slug IDs. Derive titles, summaries, repository links, type, stack, and dates from GitHub/local evidence. Use conservative statuses and milestone steps only when verifiable. Exclude backup, vault, artifact/demo, and duplicate repositories.

**Step 2: Run focused test**

Run: `npm test -- src/data/seed.test.ts`
Expected: PASS.

**Step 3: Run full local verification**

```bash
npm test
npm run test:server
npm run lint
npm run build
```

Expected: all commands exit 0.

**Step 4: Commit**

```bash
git add src/data/seed.ts
git commit -m "feat: refresh current project inventory"
```

### Task 3: Deploy the updated application

**Objective:** Install the verified build without changing service architecture.

**Files:**
- Use: `deploy/check.sh`
- Use: `deploy/install.sh`

**Step 1: Run deployment checks**

Run: `bash deploy/check.sh`
Expected: `deployment checks passed`.

**Step 2: Install**

Run: `bash deploy/install.sh`
Expected: systemd service active and origin health endpoint returns `{"ok":true}`.

### Task 4: Initialize persistent production data

**Objective:** Replace the currently empty Abel workspace with the validated curated workspace safely.

**Files:**
- Database: `/var/lib/project-board/project-board.db`
- Backups: `/var/backups/project-board/`

**Step 1: Create a fresh SQLite backup**

Run the existing `project-board-backup.service`, verify the new file exists, and run `PRAGMA integrity_check` on it.

**Step 2: Build the version-1 workspace document**

Use the built seed data with default settings, `{ "active": null, "history": [] }` focus state, and one `seed` activity event. Validate it through the live server's existing `PUT /api/workspace` path with the authorized owner header from loopback.

**Step 3: Verify database readback**

Read `/api/workspace` through loopback and assert owner, count, exact sorted IDs, unique IDs/slugs, and expected activity event.

**Step 4: Verify restart persistence**

Restart `project-board`, read the workspace again, and assert its digest matches the pre-restart response.

### Task 5: Publish and verify externally

**Objective:** Confirm source, services, backup, origin, and access boundary all match the deployment.

**Step 1: Push `main`**

Run: `git push origin main`, then verify local `HEAD` equals `origin/main`.

**Step 2: Verify runtime**

Check:
- `project-board`, `cloudflared`, and `project-board-backup.timer` are active;
- `http://127.0.0.1:8780/api/health` returns 200;
- `https://projects.aichrisz.com` redirects to Cloudflare Access;
- the workspace digest and project count survive another read;
- a fresh backup passes SQLite integrity checking.

**Step 3: Report**

Report the deployed URL, project count, commit, verification commands, and any deliberately excluded categories.
