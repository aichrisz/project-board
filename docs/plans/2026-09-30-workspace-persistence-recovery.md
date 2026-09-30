# Workspace persistence recovery

## Confirmed scope

- A workspace mutation updates browser state before the remote `PUT` completes. A refresh aborts that request; hydration then applies the older remote snapshot over the locally saved mutation.
- A failed `PUT` leaves current local state intact and displays an error, but retries only after another workspace mutation. Waiting alone never retries.
- An acknowledged `204` write survives refresh in the synthetic browser reproduction. A `412` blocks further automatic writes. Keep that no-blind-retry behavior.
- Auth, malformed responses, and network errors fail hydration or save and show existing status banners. No production log or workspace content is needed to reproduce the confirmed loss.

## Design

1. Add isolated browser tests for delayed-refresh loss, acknowledged refresh, failed-write recovery, and star/step/blocker/status mutations using the real preview and synthetic API fixtures.
2. Keep bounded, schema-1 pending-write recovery tied to its captured ETag and owner. Persist synchronously before sending; compare canonical JSON synchronously when reconciling an uncertain commit. Retry only when current remote ETag still equals captured base. Preserve local candidate and surface conflict on any other revision; never blind-retry `412`.
3. Scope ETags by authenticated owner so a journal from another account cannot
   match, and mark API responses `no-store`. Validate and size-bound journal
   data before use. Keep canonical workspace schema/storage key and project
   inventory unchanged; add only a small auxiliary journal key and
   `workspace_owner_scopes` protocol metadata table. Back up production DB
   before deployment.
4. Verify with focused unit/browser tests, full test suites, and build. No production writes, deploy, push, version bump, or unrelated edits.

## Reconciliation boundary

- Do not await digest work between selecting local/remote snapshots and returning reconciliation. Exact canonical JSON comparison suffices; hashes do not authenticate owners or requests.
- Detect owner/cache/journal changes across delayed GET and again synchronously before `ProjectContext` applies hydration. Abort adoption when observed state changed.
- Give each bounded journal intent a synchronous unique operation ID so clearing an acknowledged journal cannot remove a newer intent with identical payload and base ETag.

## Explicit exclusions

- No offline queue framework, keepalive-only mitigation, automatic merge, or ETag conflict overwrite.
- No workspace data/schema migration, auth, or global configuration changes;
  additive owner-scope protocol metadata is in scope.
