import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { describe, it } from 'node:test';

const CLI = join(process.cwd(), 'scripts', 'project-board.mjs');
const OWNER = 'kei@example.com';
const IDENTITY = 'Cf-Access-Authenticated-User-Email';
const CREATION_ETAG = '"workspace-missing"';

async function withApp(callback) {
  const root = await mkdtemp(join(tmpdir(), 'project-board-cli-'));
  const distDir = join(root, 'dist');
  await mkdir(distDir, { recursive: true });
  const app = createApp({ databasePath: join(root, 'board.db'), distDir });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    app.close();
    await once(app, 'close');
    await rm(root, { recursive: true, force: true });
  }
}

function runCli(args, url, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PROJECT_BOARD_URL: url,
        PROJECT_BOARD_OWNER: OWNER,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function json(result) {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function identity(email = OWNER) {
  return { [IDENTITY]: email };
}

async function loadWorkspace(url) {
  const response = await fetch(`${url}/api/workspace`, { headers: identity() });
  assert.ok(response.status === 200 || response.status === 204);
  return {
    etag: response.headers.get('etag'),
    workspace: response.status === 204 ? null : await response.json(),
  };
}

async function putWorkspace(url, workspace, etag) {
  return fetch(`${url}/api/workspace`, {
    method: 'PUT',
    headers: { ...identity(), 'content-type': 'application/json', 'if-match': etag },
    body: JSON.stringify(workspace),
  });
}

describe('Kei project board CLI', () => {
  it('lists and inspects projects through the workspace API', async () => {
    await withApp(async (url) => {
      assert.deepEqual(json(await runCli(['list'], url)), []);
      const added = json(await runCli([
        'add-project',
        '--title', 'CLI Project',
        '--type', 'tool',
        '--status', 'planned',
        '--summary', 'Created from Kei',
      ], url));
      assert.equal(added.title, 'CLI Project');
      assert.equal(added.type, 'tool');
      assert.equal(added.status, 'planned');

      const listed = json(await runCli(['list', 'projects'], url));
      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, added.id);
      assert.deepEqual(json(await runCli(['inspect', 'project', added.id], url)), added);
    });
  });

  it('adds a step and completes it after changing project status', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Work item'], url));
      const changed = json(await runCli(['set', 'project', 'status', project.id, 'in_progress'], url));
      assert.equal(changed.status, 'in_progress');
      const step = json(await runCli(['add', 'step', project.id, 'Ship the CLI'], url));
      assert.equal(step.title, 'Ship the CLI');
      assert.equal(step.done, false);
      assert.equal(step.order, 1);
      const completed = json(await runCli(['complete-step', project.id, step.id], url));
      assert.equal(completed.done, true);

      const inspected = json(await runCli(['inspect', project.id], url));
      assert.equal(inspected.status, 'in_progress');
      assert.deepEqual(inspected.steps, [{ ...step, done: true }]);
    });
  });

  it('rejects invalid bounded input before writing', async () => {
    await withApp(async (url) => {
      const result = await runCli(['add-project', '--title', 'x'.repeat(401)], url);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /title/i);
      assert.match(result.stderr, /400/);
      assert.deepEqual((await loadWorkspace(url)).workspace, null);
    });
  });

  it('reports a bounded conflict and leaves the winning workspace intact', async () => {
    await withApp(async (baseUrl) => {
      const project = json(await runCli(['add-project', '--title', 'Conflict target'], baseUrl));
      const proxy = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        if (request.method === 'PUT') {
          const current = await loadWorkspace(baseUrl);
          const winning = structuredClone(current.workspace);
          winning.projects[0].summary = 'winner';
          const winningResponse = await putWorkspace(baseUrl, winning, current.etag);
          assert.equal(winningResponse.status, 204);
        }
        const upstream = await fetch(`${baseUrl}${request.url}`, {
          method: request.method,
          headers: {
            [IDENTITY]: OWNER,
            'content-type': request.headers['content-type'] ?? 'application/json',
            ...(request.headers['if-match'] ? { 'if-match': request.headers['if-match'] } : {}),
          },
          body: chunks.length === 0 ? undefined : Buffer.concat(chunks),
        });
        response.statusCode = upstream.status;
        for (const [name, value] of upstream.headers) response.setHeader(name, value);
        response.end(Buffer.from(await upstream.arrayBuffer()));
      });
      proxy.listen(0, '127.0.0.1');
      await once(proxy, 'listening');
      const { port } = proxy.address();
      try {
        const result = await runCli(['set-status', project.id, 'done'], `http://127.0.0.1:${port}`);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /^conflict: workspace changed elsewhere; reload required\n$/);

        const loaded = await loadWorkspace(baseUrl);
        assert.equal(loaded.workspace.projects[0].summary, 'winner');
        assert.equal(loaded.workspace.projects[0].status, 'idea');
      } finally {
        proxy.close();
        await once(proxy, 'close');
      }
    });
  });

  it('requires an explicit owner and does not use an implicit credential', async () => {
    await withApp(async (url) => {
      const result = await runCli(['list'], url, { PROJECT_BOARD_OWNER: '' });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /--owner|PROJECT_BOARD_OWNER/);
      assert.equal((await loadWorkspace(url)).etag, CREATION_ETAG);
    });
  });
});
