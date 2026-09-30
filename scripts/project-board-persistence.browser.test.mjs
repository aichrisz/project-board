import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PROJECT_BOARD_PREVIEW_PORT ?? 4178);
const origin = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
let playwrightModule = process.env.PROJECT_BOARD_PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  try {
    playwrightModule = require.resolve('playwright');
  } catch {
    const siblingModule = resolve(repo, '../workout-compass/node_modules/playwright/index.mjs');
    if (existsSync(siblingModule)) playwrightModule = siblingModule;
  }
}
if (!playwrightModule) {
  throw new Error('Playwright unavailable; install it or set PROJECT_BOARD_PLAYWRIGHT_MODULE to module path.');
}
const playwrightUrl = pathToFileURL(resolve(playwrightModule)).href;
const { chromium } = await import(playwrightUrl);
const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] },
);
let previewOutput = '';
preview.stdout.setEncoding('utf8').on('data', (chunk) => { previewOutput += chunk; });
preview.stderr.setEncoding('utf8').on('data', (chunk) => { previewOutput += chunk; });
let browser;
const counters = { scenarios: 0, gets: 0, puts: 0, failedAssertions: 0 };
const OWNER_SCOPE_A = 'A'.repeat(43);
const OWNER_SCOPE_B = 'B'.repeat(43);

function makeFixture({ firstPut = 'acknowledge', getFailure = false } = {}) {
  const project = {
    id: 'target',
    title: 'Synthetic Workout Compass',
    slug: 'synthetic-workout-compass',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [{ id: 'step-1', title: 'Prepare outline', done: false, order: 0 }],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    started_at: null,
    starred: false,
  };
  return {
    workspace: {
      version: 1,
      projects: [project],
      settings: { showCompleted: false, idleDays: 14, theme: 'light', lastExportAt: null },
      focus: { active: null, history: [] },
      activity: [],
    },
    etag: '"fixture-v1"',
    ownerScopeToken: OWNER_SCOPE_A,
    firstPut,
    getFailure,
    puts: [],
    gets: 0,
    hold: null,
  };
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (preview.exitCode !== null) {
      await delay(100);
      throw new Error(`Preview exited: ${previewOutput}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      await delay(125);
    }
  }
  throw new Error(`Preview did not start: ${previewOutput}`);
}

async function openScenario(options) {
  const { awaitProject = true, initialStorage = [], ...fixtureOptions } = options;
  const fixture = makeFixture(fixtureOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, initialStorage);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      await route.abort();
      return;
    }
    if (url.pathname !== '/api/workspace') {
      await route.continue();
      return;
    }
    if (route.request().method() === 'GET') {
      fixture.gets += 1;
      counters.gets += 1;
      if (fixture.getFailure) {
        await route.fulfill({ status: 503 });
        return;
      }
      if (!fixture.workspace) {
        await route.fulfill({
          status: 204,
          headers: { etag: fixture.etag, 'x-workspace-owner-scope': fixture.ownerScopeToken },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { etag: fixture.etag, 'x-workspace-owner-scope': fixture.ownerScopeToken },
        body: JSON.stringify(fixture.workspace),
      });
      return;
    }
    if (route.request().method() !== 'PUT') {
      await route.fulfill({ status: 405 });
      return;
    }

    const payload = JSON.parse(route.request().postData() ?? 'null');
    const call = { payload, ifMatch: route.request().headers()['if-match'] };
    fixture.puts.push(call);
    counters.puts += 1;
    if (fixture.puts.length === 1 && fixture.firstPut === 'hold') {
      await new Promise((resolve) => { fixture.hold = { resolve, route }; });
      if (fixture.hold.aborted) {
        await route.abort();
        return;
      }
    }
    if (fixture.puts.length === 1 && fixture.firstPut === 'fail') {
      await route.fulfill({ status: 503 });
      return;
    }
    if (fixture.puts.length === 1 && fixture.firstPut === 'conflict') {
      fixture.workspace = {
        ...fixture.workspace,
        activity: [{
          id: 'external-update',
          at: '2026-01-03T00:00:00.000Z',
          type: 'project_updated',
          message: 'External update',
        }],
      };
      fixture.etag = '"fixture-external-v2"';
      await route.fulfill({ status: 412 });
      return;
    }
    fixture.workspace = payload;
    fixture.etag = `"fixture-v${fixture.puts.length + 1}"`;
    await route.fulfill({
      status: 204,
      headers: { etag: fixture.etag, 'x-workspace-owner-scope': fixture.ownerScopeToken },
    });
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  if (awaitProject) {
    await page.locator('.project-card').filter({
      has: page.getByRole('heading', { name: 'Synthetic Workout Compass' }),
    }).waitFor();
  } else {
    await page.getByRole('status').filter({ hasText: 'Remote workspace could not be loaded' }).waitFor();
  }
  return { context, page, fixture };
}

async function readLocal(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('project-board-v1') ?? 'null'));
}

function waitForWorkspacePut(page) {
  const response = page.waitForResponse((item) =>
    item.url().endsWith('/api/workspace') && item.request().method() === 'PUT',
  );
  response.catch(() => {});
  return response;
}

async function assertStarMutation({ firstPut = 'acknowledge', refresh = false } = {}) {
  const { context, page, fixture } = await openScenario({ firstPut });
  const starButton = page.getByRole('button', { name: 'Star project' });
  if (firstPut === 'hold') {
    const captured = page.waitForRequest((request) =>
      request.url().endsWith('/api/workspace') && request.method() === 'PUT',
    );
    await starButton.click();
    await captured;
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('project-board-v1') ?? 'null')?.projects?.[0]?.starred === true);
    const held = fixture.hold;
    assert.ok(held, 'fixture holds first PUT');
    const reload = page.reload({ waitUntil: 'networkidle' });
    held.aborted = true;
    held.resolve();
    await reload;
  } else {
    const response = waitForWorkspacePut(page);
    await starButton.click();
    const putResponse = await response;
    assert.equal(putResponse.status(), firstPut === 'fail' ? 503 : 204);
    if (firstPut === 'fail') {
      await page.getByRole('status').filter({ hasText: 'Remote save failed' }).waitFor();
      if (refresh) {
        await delay(750);
        assert.equal(fixture.puts.length, 1, 'failed write does not retry just because time passes');
        await page.reload({ waitUntil: 'networkidle' });
      }
      else {
        await delay(250);
        assert.equal(fixture.puts.length, 1, 'failed write does not retry without another mutation');
        await page.getByRole('button', { name: 'Unstar project' }).click();
        await page.getByRole('button', { name: 'Star project' }).click();
      }
    } else if (refresh) {
      await page.reload({ waitUntil: 'networkidle' });
    }
  }

  const visibleStarred = await page.getByRole('button', { name: 'Unstar project' }).isVisible().catch(() => false);
  const localStarred = (await readLocal(page))?.projects?.[0]?.starred ?? false;
  const remoteStarred = fixture.workspace.projects[0]?.starred ?? false;
  await context.close();
  assert.equal(visibleStarred && localStarred && remoteStarred, true, `${firstPut} star survives recovery`);
  counters.scenarios += 1;
}

async function assertMutationSurvivesReload(kind) {
  const { context, page, fixture } = await openScenario({});
  const card = page.locator('.project-card').filter({
    has: page.getByRole('heading', { name: 'Synthetic Workout Compass' }),
  });
  const responsePromise = waitForWorkspacePut(page);
  try {
    if (kind === 'checkbox') {
      await card.getByRole('link', { name: 'Synthetic Workout Compass' }).click();
      await page.getByRole('checkbox', { name: 'Prepare outline' }).check();
    } else if (kind === 'blocker') {
      await card.getByRole('button', { name: 'Blocker' }).click();
      await page.getByRole('textbox', { name: 'Blocker' }).fill('Waiting for review');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
    } else if (kind === 'status') {
      await card.getByRole('link', { name: 'Synthetic Workout Compass' }).click();
      await page.locator('.detail-actions').getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Status').selectOption('paused');
      await page.getByRole('button', { name: 'Save changes' }).click();
    }
    const response = await responsePromise;
    assert.equal(response.status(), 204);
    await page.reload({ waitUntil: 'networkidle' });
    const remoteProject = fixture.workspace.projects[0];
    if (kind === 'checkbox') assert.equal(remoteProject.steps[0].done, true);
    if (kind === 'blocker') assert.match(remoteProject.notes_md, /Waiting for review/);
    if (kind === 'status') assert.equal(remoteProject.status, 'paused');
    counters.scenarios += 1;
  } finally {
    await context.close();
  }
}

async function assertConflictDoesNotRetry() {
  const { context, page, fixture } = await openScenario({ firstPut: 'conflict' });
  const responsePromise = waitForWorkspacePut(page);
  await page.getByRole('button', { name: 'Star project' }).click();
  assert.equal((await responsePromise).status(), 412);
  await page.getByRole('status').filter({ hasText: 'changed elsewhere' }).waitFor();
  await delay(500);
  assert.equal(fixture.puts.length, 1, '412 conflict never triggers an automatic retry');
  assert.equal((await readLocal(page)).projects[0].starred, true);
  assert.equal(fixture.workspace.projects[0].starred, false);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('status').filter({ hasText: 'could not be reconciled' }).waitFor();
  await page.getByRole('button', { name: 'Unstar project' }).waitFor();
  assert.equal(fixture.puts.length, 1, 'reload does not overwrite the newer remote revision');
  assert.equal((await readLocal(page)).projects[0].starred, true);
  assert.equal(fixture.workspace.projects[0].starred, false, 'stale remote workspace remains unchanged');
  assert.equal(fixture.workspace.activity[0].id, 'external-update', 'newer remote update remains intact');
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), `project-board-v1-pending-remote:${OWNER_SCOPE_A}`));
  await context.close();
  counters.scenarios += 1;
}

async function assertAccountSwitchToEmptyDoesNotExposeCache() {
  const { context, page, fixture } = await openScenario({});
  const cached = await page.evaluate(() => localStorage.getItem('project-board-v1'));
  assert.ok(cached);
  fixture.workspace = null;
  fixture.ownerScopeToken = OWNER_SCOPE_B;
  fixture.etag = '"owner-b-empty"';
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('status').filter({ hasText: 'not available in this account’s export' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Synthetic Workout Compass' }).count(), 0);
  assert.equal(fixture.puts.length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('project-board-v1')), cached);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('project-board-v1-orphan-'))));
  assert.equal(await page.getByRole('button', { name: 'Export preserved local data' }).count(), 0);
  await context.close();
  counters.scenarios += 1;
}

async function assertFailedGetPreservesUnboundCache() {
  const fixtureWorkspace = makeFixture().workspace;
  const canonicalWorkspace = { ...fixtureWorkspace };
  delete canonicalWorkspace.activity;
  const initialStorage = [
    ['project-board-v1', JSON.stringify(canonicalWorkspace)],
    ['project-board-activity-v1', '[ { "id":"offline-event", "at":"2026-01-03T00:00:00.000Z", "type":"project_updated", "message":"Keep exact activity bytes" } ]'],
    ['project-board-v1-pending-remote', '{ "legacy": "keep journal bytes" }'],
    [`project-board-v1-pending-remote:${'A'.repeat(43)}`, '{"version":1,"preserve":"scoped journal"}'],
    ['project-board-v1-orphan-unbound', '{ "workspace":"keep orphan bytes" }'],
  ];
  const { context, page, fixture } = await openScenario({
    getFailure: true,
    awaitProject: false,
    initialStorage,
  });
  assert.equal(await page.getByRole('heading', { name: 'Synthetic Workout Compass' }).count(), 0);
  const actualStorage = await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith('project-board'))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  ));
  assert.deepEqual(actualStorage, Object.fromEntries([...initialStorage].sort(([left], [right]) => left.localeCompare(right))));
  assert.equal(fixture.puts.length, 0);
  await context.close();
  counters.scenarios += 1;
}

async function assertPendingSaveStaysWithOriginalOwner() {
  const { context, page, fixture } = await openScenario({ firstPut: 'fail' });
  const pendingResponse = waitForWorkspacePut(page);
  await page.getByRole('button', { name: 'Star project' }).click();
  assert.equal((await pendingResponse).status(), 503);
  const ownerJournal = `project-board-v1-pending-remote:${OWNER_SCOPE_A}`;
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), ownerJournal));
  fixture.workspace = fixture.puts[0].payload;
  fixture.ownerScopeToken = OWNER_SCOPE_B;
  fixture.etag = '"owner-b-identical-content"';
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Unstar project' }).waitFor();
  assert.equal(fixture.puts.length, 1);
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), ownerJournal));
  assert.equal(await page.evaluate(() => localStorage.getItem('project-board-v1-owner-scope')), OWNER_SCOPE_B);
  await context.close();
  counters.scenarios += 1;
}

const failures = [];
async function run(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    counters.failedAssertions += 1;
    failures.push({ name, message: error instanceof Error ? error.message : String(error) });
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  await waitForPreview();
  const executablePath = process.env.PROJECT_BOARD_CHROMIUM_EXECUTABLE || chromium.executablePath();
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox'],
  });
  await run('delayed PUT refresh recovery', () => assertStarMutation({ firstPut: 'hold', refresh: true }));
  await run('acknowledged star survives refresh', () => assertStarMutation({ refresh: true }));
  await run('failed PUT recovers after refresh', () => assertStarMutation({ firstPut: 'fail', refresh: true }));
  await run('step checkbox shares remote persistence', () => assertMutationSurvivesReload('checkbox'));
  await run('blocker shares remote persistence', () => assertMutationSurvivesReload('blocker'));
  await run('status shares remote persistence', () => assertMutationSurvivesReload('status'));
  await run('stale ETag conflict never retries or overwrites', assertConflictDoesNotRetry);
  await run('account switch to empty owner keeps cache private', assertAccountSwitchToEmptyDoesNotExposeCache);
  await run('offline GET failure preserves unbound cache bytes', assertFailedGetPreservesUnboundCache);
  await run('identical pending save remains bound to original owner', assertPendingSaveStaysWithOriginalOwner);
  console.log(JSON.stringify({ counters, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  counters.failedAssertions += 1;
  failures.push({
    name: 'browser test harness',
    message: error instanceof Error ? error.message : String(error),
  });
  console.log(JSON.stringify({ counters, failures }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
