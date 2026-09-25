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

function assertNoTerminalControls(output, label) {
  assert.equal(/[\u001B\u009B]/.test(output), false, `${label}: escape/CSI byte`);
  assert.equal(/[\p{Cc}]/u.test(output.replace(/[\n\t]/g, '')), false, `${label}: control byte`);
  assert.equal(/[\u2028\u2029]/.test(output), false, `${label}: line separator`);
  assert.equal(output.includes('\r'), false, `${label}: carriage return`);
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

  it('previews every mutation family as text without writing', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Preview target'], url));
      const step = json(await runCli(['add-step', project.id, 'Initial step'], url));
      const baseline = await loadWorkspace(url);

      const cases = [
        { args: ['add-project', '--title', 'Preview new'], pattern: /Project: Preview new\nAdded project: "Preview new"/ },
        { args: ['set-status', project.id, 'in_progress'], pattern: /Status: "idea" → "in_progress"/ },
        { args: ['add-step', project.id, 'Second step'], pattern: /Added step: "Second step"/ },
        { args: ['complete-step', project.id, step.id], pattern: /Step: "Initial step" → done/ },
        { args: ['set-blocker', project.id, 'Waiting on API'], pattern: /Blocker: none → "Waiting on API"/ },
        { args: ['clear-blocker', project.id], pattern: /Blocker: none → none/ },
        { args: ['add-milestone', project.id, 'Preview ship'], pattern: /Added milestone: "Preview ship"/ },
        { args: ['set-next', project.id, 'Renamed next'], pattern: /Next action: "Initial step" → "Renamed next"/ },
      ];

      for (const { args, pattern } of cases) {
        await withProxy(url, null, async (proxyUrl, putCount) => {
          const result = await runCli(['--dry-run', ...args], proxyUrl);
          assert.equal(result.code, 0, result.stderr);
          assert.match(result.stdout, /^Dry run — no changes written\n/);
          assert.match(result.stdout, pattern);
          assert.ok(result.stdout.includes(`ETag: ${baseline.etag}`));
          assert.equal(putCount(), 0);
        });
        const after = await loadWorkspace(url);
        assert.equal(after.etag, baseline.etag);
        assert.deepEqual(after.workspace, baseline.workspace);
      }
    });
  });

  it('recognizes mutation aliases in dry-run without writing', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Alias target'], url));
      const step = json(await runCli(['add-step', project.id, 'Alias step'], url));
      const baseline = await loadWorkspace(url);
      const commands = [
        ['--dry-run', 'add', 'project', '--title', 'Alias new'],
        ['--dry-run', 'set', 'project', 'status', project.id, 'planned'],
        ['--dry-run', 'add', 'step', project.id, 'Alias second'],
        ['--dry-run', 'complete', 'step', project.id, step.id],
      ];

      for (const args of commands) {
        await withProxy(url, null, async (proxyUrl, putCount) => {
          const result = await runCli(args, proxyUrl);
          assert.equal(result.code, 0, result.stderr);
          assert.match(result.stdout, /^Dry run — no changes written\n/);
          assert.equal(putCount(), 0);
        });
      }

      const canonical = await runCli(['--dry-run', '--format', 'json', 'add', 'project', '--title', 'Alias envelope'], url);
      assert.equal(canonical.code, 0, canonical.stderr);
      assert.equal(JSON.parse(canonical.stdout).command, 'add-project');

      const after = await loadWorkspace(url);
      assert.equal(after.etag, baseline.etag);
      assert.deepEqual(after.workspace, baseline.workspace);
    });
  });

  it('emits exactly one JSON envelope with the full simulated workspace', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'JSON preview'], url));
      const step = json(await runCli(['add-step', project.id, 'JSON step'], url));
      const baseline = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['--dry-run', '--format', 'json', 'set-next', project.id, 'JSON next'], proxyUrl);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(putCount(), 0);
        const envelope = JSON.parse(result.stdout);
        assert.deepEqual(Object.keys(envelope).sort(), ['command', 'dryRun', 'etag', 'result', 'workspace']);
        assert.equal(envelope.dryRun, true);
        assert.equal(envelope.etag, baseline.etag);
        assert.equal(envelope.command, 'set-next');
        assert.equal(envelope.result.id, project.id);
        const simulated = envelope.workspace.projects.find((entry) => entry.id === project.id);
        assert.equal(simulated.steps.find((entry) => entry.id === step.id).title, 'JSON next');
      });

      const after = await loadWorkspace(url);
      assert.equal(after.etag, baseline.etag);
      assert.deepEqual(after.workspace, baseline.workspace);
      assert.equal(after.workspace.projects.find((entry) => entry.id === project.id).steps[0].title, 'JSON step');
    });
  });

  it('keeps generated preview ids and timestamps out of the live workspace', async () => {
    await withApp(async (url) => {
      const seed = json(await runCli(['add-project', '--title', 'Stable project'], url));
      const baseline = await loadWorkspace(url);

      const first = JSON.parse((await runCli(['--dry-run', '--format', 'json', 'add-project', '--title', 'Ephemeral'], url)).stdout);
      const second = JSON.parse((await runCli(['--dry-run', '--format', 'json', 'add-project', '--title', 'Ephemeral'], url)).stdout);
      const simulated = first.workspace.projects.find((entry) => entry.title === 'Ephemeral');
      assert.match(simulated.id, /^proj_[0-9a-f]{8}$/);
      assert.notEqual(simulated.id, second.workspace.projects.find((entry) => entry.title === 'Ephemeral').id);

      const live = await loadWorkspace(url);
      assert.equal(live.etag, baseline.etag);
      assert.deepEqual(live.workspace, baseline.workspace);
      assert.equal(live.workspace.projects.some((entry) => entry.id === simulated.id), false);
      assert.equal(live.workspace.projects.some((entry) => entry.title === 'Ephemeral'), false);
      assert.equal(live.workspace.projects.some((entry) => entry.id === seed.id), true);
    });
  });

  it('does not leak credentials or headers in preview output', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Secret target'], url));
      const result = await runCli(['--dry-run', 'set-blocker', project.id, 'Waiting'], url);
      assert.equal(result.code, 0, result.stderr);
      const secrets = [OWNER, IDENTITY, 'if-match', 'authorization', 'cookie', 'cf-access'];
      for (const secret of secrets) {
        assert.equal(result.stdout.toLowerCase().includes(secret.toLowerCase()), false, secret);
        assert.equal(result.stderr.toLowerCase().includes(secret.toLowerCase()), false, secret);
      }
    });
  });

  it('rejects dry-run reads and invalid format combinations before any PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Guard target'], url));
      const before = await loadWorkspace(url);
      const cases = [
        { args: ['--dry-run', 'list'], pattern: /only valid for mutation/i },
        { args: ['--dry-run', 'inspect', project.id], pattern: /only valid for mutation/i },
        { args: ['--format', 'text', 'list'], pattern: /requires --dry-run/i },
        { args: ['--format', 'text', 'set-blocker', project.id, 'x'], pattern: /requires --dry-run/i },
        { args: ['--dry-run', '--format', 'yaml', 'set-blocker', project.id, 'x'], pattern: /format must be one of: text, json/i },
        { args: ['--dry-run', '--format'], pattern: /value required for --format/i },
        { args: ['--dry-run', '--dry-run', 'set-blocker', project.id, 'x'], pattern: /duplicate option --dry-run/i },
        { args: ['--dry-run', '--format', 'text', '--format', 'json', 'set-blocker', project.id, 'x'], pattern: /duplicate option --format/i },
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

  it('retains mutation validation errors in dry-run without PUT', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Validate preview'], url));
      const cases = [
        { args: ['--dry-run', 'set-blocker', 'missing-project', 'x'], pattern: /project not found: missing-project/ },
        { args: ['--dry-run', 'set-blocker', project.id, '   '], pattern: /blocker text is required/i },
        { args: ['--dry-run', 'set-blocker', project.id, 'x'.repeat(2001)], pattern: /blocker text.*2000/i },
        { args: ['--dry-run', 'add-milestone', project.id, 'x'.repeat(2001)], pattern: /milestone text.*2000/i },
        { args: ['--dry-run', 'set-next', project.id, 'x'], pattern: /add-step/i },
      ];

      for (const { args, pattern } of cases) {
        const baseline = await loadWorkspace(url);
        await withProxy(url, null, async (proxyUrl, putCount) => {
          const result = await runCli(args, proxyUrl);
          assert.notEqual(result.code, 0);
          assert.match(result.stderr, pattern);
          assert.equal(putCount(), 0);
        });
        const after = await loadWorkspace(url);
        assert.equal(after.etag, baseline.etag);
        assert.deepEqual(after.workspace, baseline.workspace);
      }

      const overflow = await loadWorkspace(url);
      overflow.workspace.projects[0].notes_md = 'x'.repeat(199_999);
      assert.equal((await putWorkspace(url, overflow.workspace, overflow.etag)).status, 204);
      const overflowBaseline = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['--dry-run', 'set-blocker', project.id, 'x'], proxyUrl);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /notes.*200000/i);
        assert.equal(putCount(), 0);
      });

      const final = await loadWorkspace(url);
      assert.equal(final.etag, overflowBaseline.etag);
      assert.deepEqual(final.workspace, overflowBaseline.workspace);
    });
  });

  it('performs a fresh real mutation after a dry run and keeps conflict exit 2', async () => {
    await withApp(async (baseUrl) => {
      const project = json(await runCli(['add-project', '--title', 'Fresh target'], baseUrl));
      const dry = await runCli(['--dry-run', 'set-blocker', project.id, 'Not written'], baseUrl);
      assert.equal(dry.code, 0, dry.stderr);

      const unchanged = await loadWorkspace(baseUrl);
      assert.equal(unchanged.workspace.projects[0].notes_md, '');

      json(await runCli(['set-blocker', project.id, 'Written'], baseUrl));
      const changed = await loadWorkspace(baseUrl);
      assert.match(changed.workspace.projects[0].notes_md, /Blocker: Written/);
      assert.notEqual(changed.etag, unchanged.etag);

      await withProxy(baseUrl, async () => {
        const current = await loadWorkspace(baseUrl);
        const winning = structuredClone(current.workspace);
        winning.projects[0].summary = 'winner';
        assert.equal((await putWorkspace(baseUrl, winning, current.etag)).status, 204);
      }, async (proxyUrl, putCount) => {
        const result = await runCli(['set-blocker', project.id, 'losing'], proxyUrl);
        assert.equal(result.code, 2);
        assert.match(result.stderr, /^conflict: workspace changed elsewhere; reload required\n$/);
        assert.equal(putCount(), 1);
      });

      const loaded = await loadWorkspace(baseUrl);
      assert.equal(loaded.workspace.projects[0].summary, 'winner');
      assert.equal(loaded.workspace.projects[0].notes_md, 'Blocker: Written');
    });
  });

  it('names the existing target project in add-step text preview', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Existing target project'], url));
      const baseline = await loadWorkspace(url);

      await withProxy(url, null, async (proxyUrl, putCount) => {
        const result = await runCli(['--dry-run', 'add-step', project.id, 'Brand new step'], proxyUrl);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(putCount(), 0);
        assert.match(result.stdout, /^Project: Existing target project$/m);
        assert.doesNotMatch(result.stdout, /^Project: Brand new step$/m);
        assert.match(result.stdout, /Added step: "Brand new step"/);
        assert.ok(result.stdout.includes(`ETag: ${baseline.etag}`));
      });

      const after = await loadWorkspace(url);
      assert.equal(after.etag, baseline.etag);
      assert.deepEqual(after.workspace, baseline.workspace);
    });
  });

  it('sanitizes every text preview field and preserves raw JSON values', async () => {
    await withApp(async (url) => {
      const project = json(await runCli(['add-project', '--title', 'Hostile seed'], url));
      const current = await loadWorkspace(url);
      const seed = current.workspace.projects[0];
      const hostileTitle = 'Evil\u001B[31m\r\nProject"quote"';
      const hostileStepTitle = 'Do\u001B[2Jit\nnow\u0007\u007F';
      const hostileNotes = 'Blocker: wait\u001B]0;owned\u0007\r\nMilestone 2024-01-01: ship\n"quoted"';
      seed.title = hostileTitle;
      seed.notes_md = hostileNotes;
      seed.steps = [{ id: 'hostile-step', title: hostileStepTitle, done: false, order: 1 }];
      seed.progress_pct = 0;
      assert.equal((await putWorkspace(url, current.workspace, current.etag)).status, 204);
      const baseline = await loadWorkspace(url);

      const commands = [
        ['set-status', project.id, 'planned'],
        ['add-step', project.id, 'New\u001B[31mstep"'],
        ['complete-step', project.id, 'hostile-step'],
        ['set-blocker', project.id, 'wait\u001B[31m now'],
        ['clear-blocker', project.id],
        ['add-milestone', project.id, 'ship\u001B[31m"it"'],
        ['set-next', project.id, 'next\u001B[31m"step"'],
      ];

      for (const args of commands) {
        await withProxy(url, null, async (proxyUrl, putCount) => {
          const result = await runCli(['--dry-run', ...args], proxyUrl);
          assert.equal(result.code, 0, result.stderr);
          assert.equal(putCount(), 0);
          assertNoTerminalControls(result.stdout, args[0]);
          assert.equal(result.stdout.trimEnd().split('\n').length, 4, `${args[0]}: one line per field`);
          assert.match(result.stdout, /^Project: /m);
          assert.ok(result.stdout.includes(`ETag: ${baseline.etag}`));
        });
        const after = await loadWorkspace(url);
        assert.equal(after.etag, baseline.etag);
        assert.deepEqual(after.workspace, baseline.workspace);
      }

      const status = await runCli(['--dry-run', 'set-status', project.id, 'planned'], url);
      assert.match(status.stdout, /^Project: Evil Project'quote'$/m);
      assert.doesNotMatch(status.stdout, /Project"quote"/);
      assert.doesNotMatch(status.stdout, /Evil\[31m/);

      const envelope = JSON.parse((await runCli(['--dry-run', '--format', 'json', 'set-status', project.id, 'planned'], url)).stdout);
      const simulated = envelope.workspace.projects.find((entry) => entry.id === project.id);
      assert.equal(simulated.title, hostileTitle);
      assert.equal(simulated.notes_md, hostileNotes);
      assert.equal(simulated.steps[0].title, hostileStepTitle);
      assert.equal(envelope.result.title, hostileTitle);

      const final = await loadWorkspace(url);
      assert.equal(final.etag, baseline.etag);
      assert.deepEqual(final.workspace, baseline.workspace);
    });
  });
});
