# Project Board VPS Persistence and Access Design

## Goal

Deploy Project Board on the current VPS at `https://projects.aichrisz.com` with durable server-side storage and access restricted to `aichriszme@gmail.com`. Keep the current UI and import/export format intact. Structure storage so additional authenticated users can be added later without sharing data.

## Chosen approach

Use the current React app, a minimal Node HTTP server, Node's built-in SQLite support, Cloudflare Tunnel, and Cloudflare Access.

Alternatives rejected:

- A single global workspace is slightly smaller but would require a data migration before adding another user.
- PostgreSQL and a full account/role system add operational and application complexity that one current user does not need.

## Architecture

```text
Browser
  -> Cloudflare Access (allow only aichriszme@gmail.com)
  -> Cloudflare Tunnel
  -> 127.0.0.1:8780
  -> Node server
       - serves the built React app
       - exposes /api/workspace and /api/health
       - stores one workspace per authenticated email in SQLite
```

The application port binds only to loopback. No VPS firewall port is added. Requests without a valid Cloudflare Access identity header are rejected. Because the origin is reachable only through the local tunnel, outside clients cannot bypass Access and inject that header directly.

## Identity and future separation

Cloudflare Access initially has one Allow policy containing the exact email `aichriszme@gmail.com`; all other identities are denied.

The server normalizes the authenticated email to lowercase and uses it as the workspace owner key. Each authenticated email receives a separate row and never reads or writes another owner's data. Adding a person later requires only adding their identity to the Cloudflare Access policy; it does not expose Abel's workspace.

There are no roles, invitations, sharing, or admin UI in this release. Those should be added only if shared projects become a real requirement.

## Data model

SQLite database: `/var/lib/project-board/project-board.db`

```sql
CREATE TABLE workspaces (
  owner_email TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`data_json` stores the existing versioned project state plus the capped activity list as one validated workspace document. This preserves the current domain model and avoids duplicating projects, steps, focus history, and settings across a premature relational schema.

SQLite runs in WAL mode. The service user owns the data directory. The database survives builds, service restarts, and source updates.

## Client data flow

1. On startup, the client requests `GET /api/workspace`.
2. If a server workspace exists, it is normalized with the current migration helpers and becomes the UI state.
3. If no server workspace exists, the client uses any same-origin local state and uploads it once; otherwise it starts empty.
4. State changes continue to update the local cache and are saved to the server as one workspace document.
5. Server saves are serialized so an older response cannot overwrite a newer browser state.
6. Import, reset, focus history, activity, projects, and settings all use the same persistence path.

Data on the old GitHub Pages origin cannot be read automatically because browser storage is origin-scoped. Existing Export JSON -> Import JSON remains the migration path.

## API boundary

- `GET /api/health`: process/database readiness; no private workspace data.
- `GET /api/workspace`: returns the authenticated owner's workspace or `204` when absent.
- `PUT /api/workspace`: validates body size, JSON shape, schema version, project/activity bounds, and writes atomically for the authenticated owner.

The API rejects missing identity, malformed email, unsupported schema versions, oversized bodies, and invalid workspace documents. Error responses contain no database paths or stack traces.

## Deployment and operations

- Source: `/opt/project-board`
- Runtime user: dedicated unprivileged `project-board` system user
- Unit: `project-board.service`, enabled at boot with restart-on-failure and systemd hardening
- App listener: `127.0.0.1:8780`
- Data: `/var/lib/project-board`
- Backups: daily SQLite online backup into `/var/backups/project-board`, retained for 14 days
- Tunnel: remotely managed Cloudflare Tunnel public hostname `projects.aichrisz.com` -> `http://127.0.0.1:8780`
- Access: self-hosted Access application with exact-email Allow policy and default deny

## Verification

Automated checks cover:

- missing identity is rejected;
- two authenticated emails receive isolated workspaces;
- invalid/oversized payloads are rejected;
- a valid workspace survives server restart;
- existing frontend tests, lint, and production build remain green.

Deployment checks cover:

- direct loopback health succeeds;
- the service is active after restart;
- the SQLite file exists under the persistent path;
- unauthenticated public requests redirect to Cloudflare Access;
- `aichriszme@gmail.com` can authenticate and persist a test workspace;
- a backup is created and passes SQLite integrity checking.

## Rollback

Before replacing the service, create a database backup. Rollback restores the previous application build and service definition without deleting the persistent database. If a schema change is ever needed, it must be backward compatible or include a tested restore step.
