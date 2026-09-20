# Authenticated Persistent VPS Deployment Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Run Project Board on the current VPS with Cloudflare Access authentication and an owner-isolated persistent SQLite workspace.

**Architecture:** A dependency-free Node server uses `node:http` and `node:sqlite`, serves the Vite build, and exposes an owner-scoped workspace API. The React client keeps its current local cache while loading from and serially saving to the API. A loopback-only systemd service is published through Cloudflare Tunnel and protected by an exact-email Access policy.

**Tech Stack:** React 19, TypeScript, Vite, Node 24 built-ins, SQLite, systemd, Cloudflare Tunnel, Cloudflare Access.

---

### Task 1: Build the owner-isolated workspace server

**Objective:** Add a tested loopback HTTP server that validates Cloudflare identity and persists one JSON workspace per email in SQLite.

**Files:**
- Create: `server/app.mjs`
- Create: `server/app.test.mjs`
- Modify: `package.json`

**Step 1: Write failing tests**

Use `node:test` with a temporary SQLite file. Cover:

- `GET /api/workspace` without `Cf-Access-Authenticated-User-Email` returns `401`.
- A malformed email returns `401`.
- A missing owner workspace returns `204`.
- `PUT` followed by `GET` returns the same valid document.
- Two emails cannot read each other's workspace.
- unsupported version, missing arrays, excessive project/activity counts, and bodies over 5 MB return `400` or `413`.
- SPA routes serve `dist/index.html`, while traversal and missing asset requests do not escape `dist`.

Export `createApp({ databasePath, distDir })` so tests can listen on an ephemeral port.

**Step 2: Verify RED**

Run: `node --test server/app.test.mjs`

Expected: FAIL because `server/app.mjs` does not exist.

**Step 3: Implement the minimum server**

Use only Node built-ins:

```js
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
```

Create the `workspaces(owner_email TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)` table and enable WAL. Normalize identity with `trim().toLowerCase()`. Accept only syntactically valid email headers. Limit request bodies to 5 MB. Validate `{ version: 1, projects: [], settings: {}, focus?: {}, activity: [] }`, with at most 5000 projects and 100 activity entries. Upsert atomically. Serve immutable assets and SPA fallback from `dist`; do not expose dotfiles or filesystem paths.

When run directly, read:

- `HOST` default `127.0.0.1`
- `PORT` default `8780`
- `DATABASE_PATH` required in production, default `./data/project-board.db` for development
- `DIST_DIR` default `./dist`

Add scripts:

```json
"test:server": "node --test server/app.test.mjs",
"start": "node server/app.mjs"
```

**Step 4: Verify GREEN**

Run: `node --test server/app.test.mjs`

Expected: all server tests pass.

**Step 5: Commit**

```bash
git add server package.json package-lock.json
git commit -m "feat: add owner-isolated SQLite workspace server"
```

---

### Task 2: Synchronize the existing client with the workspace API

**Objective:** Load the authenticated owner's server workspace at startup and persist every project/settings/focus/activity change without removing local fallback or import/export.

**Files:**
- Create: `src/lib/remoteWorkspace.ts`
- Create: `src/lib/remoteWorkspace.test.ts`
- Modify: `src/store/ProjectContext.tsx`
- Modify: `src/lib/activity.ts` only if a public normalizer is needed

**Step 1: Write failing tests**

Test a small API module with injected `fetch`:

- `loadRemoteWorkspace` maps `204` to `null` and parses a valid response.
- non-OK responses reject without discarding local state.
- `queueRemoteWorkspaceSave` serializes requests in call order.
- failed saves do not permanently break the queue; a later save still runs.

Add the combined type:

```ts
export type RemoteWorkspace = StorageBlob & { activity: ActivityEvent[] };
```

**Step 2: Verify RED**

Run: `npm test -- --test-name-pattern="remote workspace"`

Expected: FAIL because the module does not exist.

**Step 3: Implement the minimum client bridge**

- `GET /api/workspace` with `credentials: 'same-origin'`.
- `PUT /api/workspace` with JSON and `Content-Type: application/json`.
- Keep one module-level promise chain for ordered writes.
- On provider startup, read local state first, then request the server.
- If the server has data, normalize it with existing migration/focus helpers and use it.
- If the server returns `204`, use local state and immediately queue it to the server.
- If loading fails, keep local data and expose the app; do not overwrite the server until a later user mutation.
- Replace separate server writes with one effect depending on `projects`, `settings`, `focus`, and `activity`; retain current localStorage saves as an offline cache.

**Step 4: Verify GREEN and regressions**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, lint exits 0, production build exits 0.

**Step 5: Commit**

```bash
git add src/lib/remoteWorkspace.ts src/lib/remoteWorkspace.test.ts src/store/ProjectContext.tsx src/lib/activity.ts
git commit -m "feat: sync project workspace to authenticated API"
```

---

### Task 3: Add minimal deployment assets

**Objective:** Provide reproducible systemd service and SQLite backup definitions without embedding account secrets or tokens in Git.

**Files:**
- Create: `deploy/project-board.service`
- Create: `deploy/project-board-backup.service`
- Create: `deploy/project-board-backup.timer`
- Create: `deploy/backup.mjs`
- Create: `deploy/install.sh`
- Modify: `.gitignore`
- Modify: `README.md`

**Step 1: Write the deployment check first**

Create `deploy/check.sh` that fails unless:

- unit files pass `systemd-analyze verify` after placeholder expansion;
- shell scripts pass `bash -n`;
- the backup script rejects a missing database and successfully creates an integrity-checked backup from a temporary SQLite database.

Run: `bash deploy/check.sh`

Expected: FAIL because deployment assets do not exist yet.

**Step 2: Implement deployment assets**

`project-board.service` must:

- run as unprivileged `project-board`;
- bind `127.0.0.1:8780`;
- use `/var/lib/project-board/project-board.db`;
- restart on failure;
- include `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`, and explicit write access only to `/var/lib/project-board`.

The backup service uses Node SQLite's online backup API, writes to `/var/backups/project-board`, runs `PRAGMA integrity_check`, and removes backups older than 14 days. The timer runs daily with randomized delay and `Persistent=true`.

`install.sh` builds into `/opt/project-board`, creates the service account/directories, installs units, reloads systemd, and starts the app and timer. It must not configure Cloudflare or accept tokens.

**Step 3: Verify deployment assets**

Run:

```bash
bash deploy/check.sh
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

**Step 4: Commit**

```bash
git add deploy .gitignore README.md
git commit -m "ops: add systemd deployment and SQLite backups"
```

---

### Task 4: Deploy and verify the local VPS service

**Objective:** Install the committed build and prove that data survives a service restart.

**Files:**
- Install source/build under `/opt/project-board`
- Install units under `/etc/systemd/system`
- Persist data under `/var/lib/project-board`
- Persist backups under `/var/backups/project-board`

**Step 1: Install**

Run `sudo bash deploy/install.sh` from the verified repository.

**Step 2: Verify service and identity boundary**

Run:

```bash
systemctl is-active project-board
curl -fsS http://127.0.0.1:8780/api/health
curl -i http://127.0.0.1:8780/api/workspace
```

Expected: service active, health `200`, missing identity `401`.

**Step 3: Verify persistence and isolation**

Use local curl requests with test identity headers to write separate test documents, restart `project-board.service`, and confirm each identity reads only its own document. Remove test rows afterward with SQLite, leaving the database intact.

**Step 4: Verify backup**

Start `project-board-backup.service`, confirm a new backup exists, and run `PRAGMA integrity_check` against it. Confirm `project-board-backup.timer` is enabled.

---

### Task 5: Publish through Cloudflare Access

**Objective:** Expose the loopback app at `projects.aichrisz.com` while allowing only Abel's exact email.

**Cloudflare resources:**
- Remotely managed tunnel or an existing suitable tunnel connector on this VPS
- Public hostname: `projects.aichrisz.com` -> `http://127.0.0.1:8780`
- Self-hosted Access application for `projects.aichrisz.com`
- Allow policy: Emails equals `aichriszme@gmail.com`
- No bypass policy

**Step 1: Inspect before mutation**

Read the Cloudflare account, zone, existing tunnels, Access applications, policies, identity providers, and DNS record. Reuse an existing healthy tunnel only if it is intended for this host; otherwise create one connector.

**Step 2: Create the tunnel hostname and exact Access policy**

Use current Cloudflare API schemas or Dashboard fields. Store connector credentials root-only; never commit or print them.

**Step 3: Verify externally**

- `https://projects.aichrisz.com` without a session redirects to Cloudflare Access.
- Authenticate as `aichriszme@gmail.com` and confirm the board loads.
- Verify another identity is denied (policy/log evidence if a second login is unavailable).
- Create a disposable project, reload, restart the service, and confirm it persists; then delete it.
- Confirm the origin service still listens only on `127.0.0.1:8780`.

**Step 4: Final integration verification**

Run:

```bash
npm test
npm run lint
npm run build
systemctl is-active project-board project-board-backup.timer
curl -fsS http://127.0.0.1:8780/api/health
ss -lntp
```

Record the deployed commit, service status, database path, latest backup, Access application/policy identifiers, and public URL.
