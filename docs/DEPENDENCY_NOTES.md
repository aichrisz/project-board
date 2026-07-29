# Dependency Notes — v0.8.1

Evidence trail for the runtime dependency remediation in v0.8.1. Recorded so the
decision can be re-checked without repeating the investigation.

## React Router CSRF advisories

Two advisories cover **contiguous** version ranges of `react-router`:

| Advisory | Affected | Fixed in |
|----------|----------|----------|
| [GHSA-h5cw-625j-3rxh](https://github.com/advisories/GHSA-h5cw-625j-3rxh) (CVE-2026-22030) | `>= 7.0.0, < 7.12.0` | 7.12.0 |
| [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | `>= 7.12.0, < 8.3.0` | 8.3.0 |

Ranges confirmed against the OSV API (`api.osv.dev/v1/vulns/<id>`), not just the
`npm audit` summary.

Because the ranges are contiguous with no gap, **every** 7.x release is affected
by one of the two. The first non-vulnerable version is **8.3.0**.

### Why the audit's suggested fix was rejected

`npm audit` on the 0.8.0 tree reported:

```
fix available via `npm audit fix --force`
Will install react-router-dom@7.11.0, which is a breaking change
```

Downgrading to 7.11.0 escapes GHSA-qwww-vcr4-c8h2 but lands inside
GHSA-h5cw-625j-3rxh, which affects the **stable** action request path rather
than the unstable RSC paths. That trades a narrower exposure for a broader one,
so it is a net regression, not a fix. `npm audit fix --force` was not used.

### Chosen remediation

Upgraded to `react-router@8.3.0`, pinned exactly.

Compatibility checked before the upgrade:

- **Peer requirements.** 8.3.0 needs `react >= 19.2.7` and `react-dom >= 19.2.7`.
  This app already ran 19.2.7. Vite 7+ required; this app is on Vite 8.1.4.
- **`react-router-dom` removed upstream in v8.** The v7 compatibility package no
  longer exists, so the 15 import sites were swapped from `react-router-dom` to
  `react-router`. This app uses only the DOM router and hooks re-exported from
  the root entry, so no `react-router/dom` imports were needed.
- **API surface verified.** All 11 APIs this app imports resolve on 8.3.0:
  `BrowserRouter`, `Navigate`, `Route`, `Routes`, `Link`, `NavLink`, `Outlet`,
  `useLocation`, `useNavigate`, `useParams`, `useSearchParams`.
- **Breaking changes reviewed** from the upstream v8.0.0 release notes. All of
  them concern Framework Mode, SSR, RSC, middleware, adapters, and future flags.
  This app is a client-only SPA using `BrowserRouter` with no loaders, actions,
  or server entries, so none apply.

`src/lib/dependencies.test.ts` encodes both advisory ranges as assertions, so a
future downgrade into either range fails the test suite rather than passing
silently.

### Runtime dependency review

`react-router@8.3.0` replaces the `cookie` and `set-cookie-parser` dependencies
with `cookie-es@3.1.1` (MIT, `unjs/cookie-es`). Net effect is a smaller runtime
tree:

```
project-board@0.8.1
├─┬ react-dom@19.2.7
│ └── scheduler@0.27.0
├─┬ react-router@8.3.0
│ └── cookie-es@3.1.1
└── react@19.2.7
```

The cookie code is not reachable from this app; it ships for server session
helpers that a client-only SPA never invokes.

## PostCSS (dev only)

[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849),
`postcss <= 8.5.17`, reached only as a transitive dependency of `vite`. Resolved
with a plain `npm audit fix` (8.5.17 → 8.5.25). No breaking change, no `--force`.

## Audit status

```
npm audit --omit=dev --audit-level=high   # found 0 vulnerabilities
npm audit                                 # found 0 vulnerabilities
```

No exceptions or suppressions are in place. Nothing was silenced; no audit
config, `--force`, or override entries were added.

## Test runner dependency

None added. `npm test` uses Node's built-in `node:test` and `node:assert`.
`scripts/test-resolve-hook.mjs` is a ~20-line local `registerHooks` shim that
appends `.ts` to extensionless relative specifiers so Node's native TypeScript
support can load the app's bundler-style imports. Adding a full test framework
would have pulled in a large dependency tree for a dependency-light local app.
