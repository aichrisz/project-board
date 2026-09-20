# Current Project Inventory Design

## Goal

Replace the outdated Project Board seed with a curated inventory of Abel's current products, tools, and games, then load that inventory into the persistent production workspace for `aichriszme@gmail.com`.

## Scope

Include active product, tool, and game repositories found across Abel's GitHub account and `/root/projects`. Exclude backup repositories, Obsidian or agent vaults, generated artifact-only repositories, public demo mirrors, abandoned scaffolds, and duplicate local/remote representations of the same product.

GitHub is the canonical source for repository identity and links. Local checkouts supply additional evidence such as README descriptions, deployment state, and work that has not been mirrored under a distinct repository name.

## Data model

Reuse the existing `Project[]` seed and version-1 workspace schema. Each curated project has:

- a stable slug-based ID;
- a short factual summary;
- a project type from the existing allow-list;
- a conservative status based on current evidence;
- only verifiable milestones as steps;
- GitHub and public deployment links when available;
- stack and tags derived from repository metadata;
- repository timestamps as supporting dates where appropriate.

No new tables, APIs, GitHub tokens, scheduled sync, or schema migrations are introduced.

## Loading behavior

The existing onboarding and Settings seed actions continue to use `SEED_PROJECTS`. Production is initialized directly through the authenticated workspace API semantics by writing the validated version-1 document for `aichriszme@gmail.com` into SQLite. Existing non-empty production data must be backed up before replacement.

The production workspace contains the curated projects, default settings, no active focus session, and a single seed activity event. Subsequent edits continue to persist through the existing `/api/workspace` endpoint.

## Validation and testing

Add one focused test that asserts the curated inventory:

- contains the required current project IDs;
- excludes known backup, vault, artifact/demo, and duplicate IDs;
- has unique IDs and slugs;
- uses valid links and allowed project types/statuses.

Follow RED → GREEN: the test must fail against the old seed before the seed is replaced.

Run the full unit suite, server tests, lint, build, and deployment checks. After deployment, verify:

1. service and Cloudflare tunnel are active;
2. the authenticated workspace record exists for `aichriszme@gmail.com`;
3. its project count and IDs match the curated seed;
4. the SQLite record survives a service restart;
5. a fresh backup can be created;
6. the public URL redirects to Cloudflare Access and the origin health check passes.

## Deployment

Commit and push the seed and test to `main`, reinstall the existing systemd deployment using its current deployment script, initialize the production SQLite workspace, restart the service, and perform the verification above.

## Non-goals

- Runtime GitHub synchronization.
- Tracking backup/vault repositories as projects.
- Inventing progress or roadmap items not supported by repository evidence.
- Changing Project Board UI, authentication, or storage architecture.
