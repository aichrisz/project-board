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
const MAX_NOTES_CHARS = 200_000;

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

async function withProxy(baseUrl, beforePut, callback) {
  let putCount = 0;
  const proxy = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.method === 'PUT') {
      putCount += 1;
      if (beforePut) await beforePut();
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
    return await callback(`http://127.0.0.1:${port}`, () => putCount);
  } finally {
    proxy.close();
    await once(proxy, 'close');
  }
}

describe('Kei project board CLI', () => {
  it('accepts all project signal commands', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Signal target'], url));
      const step = json(await runCli(['add-step', project.id, 'Initial step'], url));
      for (const args of [
        ['set-blocker', project.id, 'Waiting', 'on', 'API'],
        ['clear-blocker', project.id],
        ['add-milestone', project.id, 'Ship', 'it'],
        ['set-next', project.id, step.title],
      ]) {
        const result = await runCli(args, url);
        assert.equal(result.code, 0, result.stderr);
      }
      const help = json(await runCli(['--help'], url)).help;
      for (const command of ['set-blocker', 'clear-blocker', 'add-milestone', 'set-next']) {
        assert.match(help, new RegExp(command));
      }
    });
  });

  it('updates project signals while preserving notes and recording one activity each', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Signal history'], url));
      const current = await loadWorkspace(url);
      const seeded = current.workspace.projects[0];
      seeded.notes_md = 'Prior note';
      seeded.steps = [
        { id: 'z-step', title: 'Later', done: false, order: 2 },
        { id: 'b-step', title: 'First tie', done: false, order: 1 },
        { id: 'a-step', title: 'First tie other', done: false, order: 1 },
        { id: 'done-step', title: 'Done', done: true, order: 0 },
      ];
      seeded.progress_pct = 25;
      assert.equal((await putWorkspace(url, current.workspace, current.etag)).status, 204);

      let expectedNotes = ['Prior note'];
      const actions = [
        { args: ['set-blocker', project.id, 'Waiting', 'for', 'API'], note: 'Blocker: Waiting for API' },
        { args: ['clear-blocker', project.id], note: 'Blocker: none.' },
        { args: ['add-milestone', project.id, 'Release', 'candidate'], note: null },
        { args: ['set-next', project.id, 'Do', 'it', 'now'], note: null },
      ];

      for (const action of actions) {
        const before = await loadWorkspace(url);
        const beforeProject = before.workspace.projects[0];
        const result = json(await runCli(action.args, url));
        const after = await loadWorkspace(url);
        const afterProject = after.workspace.projects[0];
        assert.equal(result.id, project.id);
        assert.notEqual(afterProject.updated_at, beforeProject.updated_at);
        assert.equal(after.workspace.activity.length, before.workspace.activity.length + 1);
        assert.deepEqual(after.workspace.activity.slice(1), before.workspace.activity);
        assert.equal(after.workspace.activity[0].type, 'project_updated');
        assert.equal(after.workspace.activity[0].projectId, project.id);
        assert.ok(after.workspace.activity[0].message.length <= 2000);
        assert.doesNotMatch(after.workspace.activity[0].message, /[\r\n]/);

        if (action.note) expectedNotes.push(action.note);
        if (action.args[0] === 'add-milestone') {
          const milestone = afterProject.notes_md.split('\n').at(-1);
          assert.match(milestone, /^Milestone \d{4}-\d{2}-\d{2}: Release candidate$/);
          expectedNotes.push(milestone);
        }
        if (action.note || action.args[0] === 'add-milestone') {
          assert.equal(afterProject.notes_md, expectedNotes.join('\n'));
        }
        if (action.args[0] === 'set-next') {
          assert.deepEqual(afterProject.steps, [
            { id: 'z-step', title: 'Later', done: false, order: 2 },
            { id: 'b-step', title: 'First tie', done: false, order: 1 },
            { id: 'a-step', title: 'Do it now', done: false, order: 1 },
            { id: 'done-step', title: 'Done', done: true, order: 0 },
          ]);
          assert.equal(afterProject.progress_pct, 25);
        }
      }
    });
  });

  it('rejects set-next without an unfinished step before any PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Finished target'], url));
      const current = await loadWorkspace(url);
      current.workspace.projects[0].steps = [{ id: 'done-step', title: 'Done', done: true, order: 1 }];
      current.workspace.projects[0].progress_pct = 100;
      assert.equal((await putWorkspace(url, current.workspace, current.etag)).status, 204);
      const before = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['set-next', project.id, 'Replacement'], proxyUrl);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /add-step/i);
        assert.equal(putCount(), 0);
      });

      const after = await loadWorkspace(url);
      assert.equal(after.etag, before.etag);
      assert.deepEqual(after.workspace, before.workspace);
    });
  });

  it('rejects clear-blocker trailing positional arguments before any PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Clear validation'], url));
      const before = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['clear-blocker', project.id, 'unexpected'], proxyUrl);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /usage: clear-blocker PROJECT_ID/i);
        assert.equal(putCount(), 0);
      });

      const after = await loadWorkspace(url);
      assert.equal(after.etag, before.etag);
      assert.deepEqual(after.workspace, before.workspace);
    });
  });

  it('bounds appended notes locally at the server limit before any overflow PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Notes limit'], url));
      const suffix = '\nBlocker: x';
      const current = await loadWorkspace(url);
      current.workspace.projects[0].notes_md = 'x'.repeat(MAX_NOTES_CHARS - suffix.length);
      assert.equal((await putWorkspace(url, current.workspace, current.etag)).status, 204);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['set-blocker', project.id, 'x'], proxyUrl);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(putCount(), 1);
      });
      const atLimit = await loadWorkspace(url);
      assert.equal(atLimit.workspace.projects[0].notes_md.length, MAX_NOTES_CHARS);
      assert.equal(atLimit.workspace.projects[0].notes_md.endsWith('\nBlocker: x'), true);

      const overflow = await loadWorkspace(url);
      overflow.workspace.projects[0].notes_md = 'x'.repeat(199_999);
      assert.equal((await putWorkspace(url, overflow.workspace, overflow.etag)).status, 204);
      const before = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['set-blocker', project.id, 'x'], proxyUrl);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /notes.*200000/i);
        assert.equal(putCount(), 0);
      });

      const after = await loadWorkspace(url);
      assert.equal(after.etag, before.etag);
      assert.deepEqual(after.workspace, before.workspace);
    });
  });

  it('trims trailing note whitespace before appending while preserving content', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Trim notes'], url));
      const current = await loadWorkspace(url);
      current.workspace.projects[0].notes_md = 'Meaningful prior note \n\n\t';
      assert.equal((await putWorkspace(url, current.workspace, current.etag)).status, 204);

      const result = json(await runCli(['clear-blocker', project.id], url));
      assert.equal(result.notes_md, 'Meaningful prior note\nBlocker: none.');
    });
  });

  it('rejects blank and oversized signal text before any PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Validation target'], url));
      const before = await loadWorkspace(url);
      const cases = [
        { args: ['set-blocker', project.id, '   '], pattern: /blocker text is required/i },
        { args: ['set-blocker', project.id, 'x'.repeat(2001)], pattern: /blocker text.*2000/i },
        { args: ['add-milestone', project.id, '   '], pattern: /milestone text is required/i },
        { args: ['add-milestone', project.id, 'x'.repeat(2001)], pattern: /milestone text.*2000/i },
        { args: ['set-next', project.id, '   '], pattern: /step title is required/i },
        { args: ['set-next', project.id, 'x'.repeat(401)], pattern: /step title.*400/i },
      ];

      for (const { args, pattern } of cases) {
        await withProxy(url, null, async (proxyUrl, putCount) => {
          const result = await runCli(args, proxyUrl);
          assert.notEqual(result.code, 0);
          assert.match(result.stderr, pattern);
          assert.equal(putCount(), 0);
        });
        const after = await loadWorkspace(url);
        assert.equal(after.etag, before.etag);
        assert.deepEqual(after.workspace, before.workspace);
      }
    });
  });

  it('requires an existing project for every project signal command', async () => {
    await withApp(async (url) => {
      const commands = [
        ['set-blocker', 'missing-project', 'reason'],
        ['clear-blocker', 'missing-project'],
        ['add-milestone', 'missing-project', 'milestone'],
        ['set-next', 'missing-project', 'next'],
      ];
      for (const args of commands) {
        const result = await runCli(args, url);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /project not found: missing-project/);
      }
      assert.equal((await loadWorkspace(url)).etag, CREATION_ETAG);
    });
  });

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
        const result = await runCli(['set-blocker', project.id, 'losing'], `http://127.0.0.1:${port}`);
        assert.equal(result.code, 2);
        assert.match(result.stderr, /^conflict: workspace changed elsewhere; reload required\n$/);

        const loaded = await loadWorkspace(baseUrl);
        assert.equal(loaded.workspace.projects[0].summary, 'winner');
        assert.equal(loaded.workspace.projects[0].status, 'idea');
        assert.equal(loaded.workspace.projects[0].notes_md, '');
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
