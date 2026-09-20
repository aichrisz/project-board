import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { describe, it } from 'node:test';

import { createApp } from './app.mjs';

const IDENTITY = 'Cf-Access-Authenticated-User-Email';

async function withApp(callback) {
  const root = await mkdtemp(join(tmpdir(), 'project-board-server-'));
  const distDir = join(root, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Project Board</title>');
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.log("app");');
  const app = createApp({ databasePath: join(root, 'data', 'board.db'), distDir });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();
  try {
    return await callback(`http://127.0.0.1:${port}`, root);
  } finally {
    app.close();
    await once(app, 'close');
    await rm(root, { recursive: true, force: true });
  }
}

function project(overrides = {}) {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

function workspace(overrides = {}) {
  return {
    version: 1,
    projects: [],
    settings: {
      showCompleted: false,
      idleDays: 14,
      theme: 'system',
      lastExportAt: null,
    },
    focus: { active: null, history: [] },
    activity: [],
    ...overrides,
  };
}

async function request(base, path, options = {}) {
  return fetch(`${base}${path}`, options);
}

function identity(email) {
  return { [IDENTITY]: email };
}

describe('authenticated workspace server', () => {
  it('rejects missing and malformed identity headers', async () => {
    await withApp(async (base) => {
      const missing = await request(base, '/api/workspace');
      assert.equal(missing.status, 401);

      const malformed = await request(base, '/api/workspace', {
        headers: identity('not-an-email'),
      });
      assert.equal(malformed.status, 401);

      const repeatedDomainDot = await request(base, '/api/workspace', {
        headers: identity('a@b..c'),
      });
      assert.equal(repeatedDomainDot.status, 401);
    });
  });

  it('returns 204 when an authenticated owner has no workspace', async () => {
    await withApp(async (base) => {
      const response = await request(base, '/api/workspace', {
        headers: identity('Owner@Example.com'),
      });
      assert.equal(response.status, 204);
    });
  });

  it('round-trips a workspace document for its normalized owner', async () => {
    await withApp(async (base) => {
      const document = workspace({
        projects: [project()],
        settings: { ...workspace().settings, theme: 'dark' },
        activity: [{
          id: 'a1',
          at: '2026-01-03T00:00:00.000Z',
          type: 'project_created',
          projectId: 'p1',
          message: 'created',
        }],
      });
      const saved = await request(base, '/api/workspace', {
        method: 'PUT',
        headers: { ...identity('Owner@Example.com'), 'content-type': 'application/json' },
        body: JSON.stringify(document),
      });
      assert.equal(saved.status, 204);

      const loaded = await request(base, '/api/workspace', {
        headers: identity(' owner@example.com '),
      });
      assert.equal(loaded.status, 200);
      assert.deepEqual(await loaded.json(), document);
    });
  });

  it('isolates workspaces by authenticated email', async () => {
    await withApp(async (base) => {
      const first = workspace({ projects: [project({ id: 'first' })] });
      const second = workspace({ projects: [project({ id: 'second' })] });
      for (const [email, document] of [['first@example.com', first], ['second@example.com', second]]) {
        const response = await request(base, '/api/workspace', {
          method: 'PUT',
          headers: { ...identity(email), 'content-type': 'application/json' },
          body: JSON.stringify(document),
        });
        assert.equal(response.status, 204);
      }

      const firstRead = await request(base, '/api/workspace', { headers: identity('first@example.com') });
      const secondRead = await request(base, '/api/workspace', { headers: identity('second@example.com') });
      assert.deepEqual((await firstRead.json()).projects, first.projects);
      assert.deepEqual((await secondRead.json()).projects, second.projects);
    });
  });

  it('rejects malformed nested project, settings, focus, and activity data before persistence', async () => {
    await withApp(async (base) => {
      const cases = [
        workspace({ projects: [{}] }),
        workspace({ settings: {} }),
        workspace({ focus: { active: null, history: [{}] } }),
        workspace({ activity: [{}] }),
      ];
      for (const document of cases) {
        const response = await request(base, '/api/workspace', {
          method: 'PUT',
          headers: { ...identity('owner@example.com'), 'content-type': 'application/json' },
          body: JSON.stringify(document),
        });
        assert.equal(response.status, 400);
      }

      const loaded = await request(base, '/api/workspace', {
        headers: identity('owner@example.com'),
      });
      assert.equal(loaded.status, 204);
    });
  });

  it('rejects invalid schema versions, missing arrays, and excessive counts', async () => {
    await withApp(async (base) => {
      const cases = [
        workspace({ version: 2 }),
        { version: 1, settings: {}, activity: [] },
        workspace({ activity: undefined }),
        workspace({ projects: Array.from({ length: 5001 }, () => ({})) }),
        workspace({ activity: Array.from({ length: 101 }, () => ({})) }),
      ];
      for (const document of cases) {
        const response = await request(base, '/api/workspace', {
          method: 'PUT',
          headers: { ...identity('owner@example.com'), 'content-type': 'application/json' },
          body: JSON.stringify(document),
        });
        assert.equal(response.status, 400);
      }
    });
  });

  it('rejects request bodies over 5 MB', async () => {
    await withApp(async (base) => {
      const body = JSON.stringify(workspace({ projects: [{ notes_md: 'x'.repeat(5 * 1024 * 1024) }] }));
      assert.ok(Buffer.byteLength(body) > 5 * 1024 * 1024);
      const response = await request(base, '/api/workspace', {
        method: 'PUT',
        headers: { ...identity('owner@example.com'), 'content-type': 'application/json' },
        body,
      });
      assert.equal(response.status, 413);
    });
  });

  it('serves the SPA while keeping assets inside dist', async () => {
    await withApp(async (base, root) => {
      await writeFile(join(root, 'secret.txt'), 'outside dist');

      const spa = await request(base, '/board');
      assert.equal(spa.status, 200);
      assert.match(await spa.text(), /Project Board/);

      const asset = await request(base, '/assets/app.js');
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.match(await asset.text(), /console\.log/);

      const missingAsset = await request(base, '/assets/missing.js');
      assert.equal(missingAsset.status, 404);

      const traversal = await request(base, '/%2e%2e/secret.txt');
      assert.equal(traversal.status, 404);
      assert.doesNotMatch(await traversal.text(), /outside dist/);
    });
  });
});
