import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);

type PackageJson = {
  version?: string;
  dependencies?: Record<string, string>;
};

const rootPkg = require('../../package.json') as PackageJson;

function parseSemver(version: string): [number, number, number] {
  const [core] = version.split('-');
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  assert.ok(
    parts.length === 3 && parts.every((n) => Number.isInteger(n)),
    `unparseable version: ${version}`,
  );
  return [parts[0], parts[1], parts[2]];
}

function compare(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Router advisory regression guard.
 *
 * GHSA-h5cw-625j-3rxh  affects react-router >= 7.0.0, < 7.12.0
 * GHSA-qwww-vcr4-c8h2  affects react-router >= 7.12.0, < 8.3.0
 *
 * The two ranges are contiguous, so every 7.x release is affected by one of
 * them. 8.3.0 is the first version outside both ranges.
 */
describe('react-router advisory remediation', () => {
  const installed = (
    require('react-router/package.json') as PackageJson
  ).version;

  it('resolves an installed react-router version', () => {
    assert.ok(installed, 'react-router must be installed');
  });

  it('is not affected by GHSA-h5cw-625j-3rxh (< 7.12.0)', () => {
    assert.ok(
      compare(installed as string, '7.12.0') >= 0,
      `react-router ${installed} is affected by GHSA-h5cw-625j-3rxh`,
    );
  });

  it('is not affected by GHSA-qwww-vcr4-c8h2 (>= 7.12.0, < 8.3.0)', () => {
    assert.ok(
      compare(installed as string, '8.3.0') >= 0,
      `react-router ${installed} is affected by GHSA-qwww-vcr4-c8h2`,
    );
  });

  it('does not depend on react-router-dom, removed upstream in v8', () => {
    assert.equal(rootPkg.dependencies?.['react-router-dom'], undefined);
  });

  it('exposes every router API this app imports', async () => {
    const rr = (await import('react-router')) as Record<string, unknown>;
    const used = [
      'BrowserRouter',
      'Link',
      'NavLink',
      'Navigate',
      'Outlet',
      'Route',
      'Routes',
      'useLocation',
      'useNavigate',
      'useParams',
      'useSearchParams',
    ];
    assert.deepEqual(
      used.filter((name) => !(name in rr)),
      [],
    );
  });
});
