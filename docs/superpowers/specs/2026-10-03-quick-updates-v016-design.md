# Project Board v0.16 — Quick updates

Approved in Telegram: all three features, then the concrete design approved with “oke”.

## Scope
- Global accessible save indicator: Saving… while latest local snapshot has outstanding remote work; Saved only when that latest snapshot is acknowledged. Hydration failure, save failure and conflict never show Saved. Loading has neutral copy. Static deployment without remote API must not claim server persistence.
- Dashboard card Next step editor: edit the displayed first unfinished step using existing deterministic ordering. Capture step identity and original title on open; validate against freshest project on submit. Reject if step completed, removed, changed title or is no longer first unfinished; keep draft. Blank/over-400-character and multiline titles rejected. Unchanged save is a no-op. Preserve step id/order/done, progress, focus link, other notes/status. One accepted update produces one activity event.
- Project Detail quick milestone: append `Milestone YYYY-MM-DD: <trimmed text>` using UTC date exactly as existing CLI. Nonblank single-line text max 2,000 characters; reject CR/LF/U+2028/U+2029 before trim, including raw paste. Notes cap 200,000. Preserve earlier notes, project status/steps; one accepted append produces one activity event.

## Architecture and UX
Reuse ProjectContext shared mutation/cache/queue path, getNextAction, blocker editor lifecycle, existing UTC milestone format and current CSS. No dependency, schema, route, server protocol or persistence retry changes. One card editor open at a time. Native labeled inputs, Save/Cancel/Escape, inline errors and focus restoration via live refs/useId. Global indicator distinguishes accepted local changes from server acknowledgment; older queue callbacks cannot mark newer pending changes Saved or clear newer errors.

## Verification and release
Small behavioral regressions for latest-save acknowledgment and stale editor guards, no-op and validation. One isolated populated browser gate for all three features, reload persistence, 320/390/desktop overflow and focus. One combined read-only review. Broad release checks once, targeted corrections only. Bump 0.16.0 and align release docs including outdated digest wording. Backup before deploy; bounded health retries, short read-only production smoke, offsite backup/restore, push verified commit. Never mutate production for test fixtures.
