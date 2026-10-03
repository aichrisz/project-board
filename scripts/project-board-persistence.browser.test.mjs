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
const quickUpdatesOnly = process.argv.includes('--quick-updates');
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

function makeFixture({
  firstPut = 'acknowledge',
  getFailure = false,
  holdPuts = [],
  failPuts = [],
  extraProject = false,
  notes = 'Earlier notes',
} = {}) {
  const project = {
    id: 'target',
    title: 'Synthetic Workout Compass',
    slug: 'synthetic-workout-compass',
    type: 'tool',
    status: 'in_progress',
    summary: 'A populated synthetic project for isolated responsive and persistence checks.',
    progress_pct: 50,
    steps: [
      { id: 'step-1', title: 'Prepare outline', done: false, order: 0 },
      { id: 'step-2', title: 'Review outline', done: true, order: 1 },
    ],
    notes_md: notes,
    links: [{ id: 'link-1', label: 'Project notes', url: 'https://example.test/project-notes' }],
    tags: ['browser', 'fixture'],
    deadline: null,
    stack: ['React', 'Vite'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    started_at: null,
    starred: false,
  };
  const secondaryProject = extraProject
    ? {
        ...project,
        id: 'secondary',
        title: 'Concurrent fixture project',
        slug: 'concurrent-fixture-project',
        summary: 'A second populated project used to prove inline editor exclusivity.',
        progress_pct: 0,
        steps: [],
        notes_md: '',
        updated_at: new Date(Date.now() - 60_000).toISOString(),
      }
    : null;
  return {
    workspace: {
      version: 1,
      projects: secondaryProject ? [project, secondaryProject] : [project],
      settings: { showCompleted: false, idleDays: 14, theme: 'light', lastExportAt: null },
      focus: { active: null, history: [] },
      activity: [],
    },
    etag: '"fixture-v1"',
    ownerScopeToken: OWNER_SCOPE_A,
    firstPut,
    getFailure,
    holdPuts,
    failPuts,
    puts: [],
    gets: 0,
    hold: null,
    holds: new Map(),
    holdWaiters: new Map(),
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
    const heldPut = fixture.firstPut === 'hold' && fixture.puts.length === 1
      || fixture.holdPuts.includes(fixture.puts.length);
    if (heldPut) {
      const held = await new Promise((resolve) => {
        const putNumber = fixture.puts.length;
        const pending = {
          route,
          aborted: false,
          released: false,
          resolve: () => {
            if (pending.released) return;
            pending.released = true;
            resolve(pending);
          },
        };
        fixture.holds.set(putNumber, pending);
        if (putNumber === 1) fixture.hold = pending;
        fixture.holdWaiters.get(putNumber)?.(pending);
        fixture.holdWaiters.delete(putNumber);
      });
      if (held.aborted) {
        await route.abort();
        return;
      }
    }
    if (fixture.failPuts.includes(fixture.puts.length) || (fixture.puts.length === 1 && fixture.firstPut === 'fail')) {
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

function waitForWorkspaceRequest(page) {
  const request = page.waitForRequest((item) =>
    item.url().endsWith('/api/workspace') && item.method() === 'PUT',
  );
  request.catch(() => {});
  return request;
}

function waitForHeldPut(fixture, putNumber) {
  const held = fixture.holds.get(putNumber);
  if (held) return Promise.resolve(held);
  return new Promise((resolve) => fixture.holdWaiters.set(putNumber, resolve));
}

async function closeScenario(context, fixture) {
  for (const held of fixture.holds.values()) {
    if (held.released) continue;
    held.aborted = true;
    held.resolve();
  }
  await context.close();
}

function saveIndicator(page) {
  return page.locator('.remote-save-status');
}

async function waitForSaveStatus(page, expected) {
  await page.waitForFunction((status) =>
    document.querySelector('.remote-save-status')?.textContent?.trim() === `Remote save: ${status}`,
  expected);
}

async function assertPageFits(page, width, label) {
  await page.setViewportSize({ width, height: 1000 });
  const measurements = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overwideElements: [...document.querySelectorAll(
      '.project-card, .card-next-step-editor, .milestone-editor, .detail-main-panel, .panel-title-row',
    )]
      .map((element) => ({
        name: element.className.toString(),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }))
      .filter((element) => element.left < -1 || element.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1),
  }));
  assert.equal(measurements.viewport, width, `${label} viewport is set to ${width}px`);
  assert.ok(measurements.document <= width, `${label} document overflowed ${width}px: ${JSON.stringify(measurements)}`);
  assert.ok(measurements.body <= width, `${label} body overflowed ${width}px: ${JSON.stringify(measurements)}`);
  assert.deepEqual(measurements.overwideElements, [], `${label} component overflowed ${width}px`);
}

async function assertLabeledInput(input, labelText) {
  const association = await input.evaluate((element, expectedLabel) => {
    const id = element.id;
    return {
      id,
      labelMatches: [...document.querySelectorAll('label')]
        .some((label) => label.htmlFor === id && label.textContent.includes(expectedLabel)),
      focused: document.activeElement === element,
    };
  }, labelText);
  assert.ok(association.id, `${labelText} input has an id`);
  assert.equal(association.labelMatches, true, `${labelText} has a matching label`);
  assert.equal(association.focused, true, `${labelText} input receives initial focus`);
}

async function rejectRawPaste(input, text) {
  return input.evaluate((element, value) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', value);
    const event = new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, text);
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
  await waitForSaveStatus(page, 'Reload required');
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
  await waitForSaveStatus(page, 'Unavailable');
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

function projectCard(page, title) {
  return page.locator('.project-card').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  });
}

async function assertLatestSnapshotAcknowledgmentAndErrorRecovery() {
  const { context, page, fixture } = await openScenario({
    extraProject: true,
    holdPuts: [1, 2],
    failPuts: [2],
  });
  try {
    await waitForSaveStatus(page, 'Saved');
    const target = projectCard(page, 'Synthetic Workout Compass');
    const startingOrder = await page.locator('.project-card .card-title').allTextContents();
    assert.ok(startingOrder.indexOf('Synthetic Workout Compass') > startingOrder.indexOf('Concurrent fixture project'));

    const firstResponse = waitForWorkspacePut(page);
    const firstRequest = waitForWorkspaceRequest(page);
    await page.getByRole('button', { name: 'Theme: Light. Click to cycle.' }).click();
    await firstRequest;
    const firstHold = await waitForHeldPut(fixture, 1);
    await waitForSaveStatus(page, 'Saving…');

    const secondRequest = waitForWorkspaceRequest(page);
    await target.getByRole('button', { name: 'Edit next step' }).click();
    const nextStep = target.getByRole('textbox', { name: 'Next step' });
    await nextStep.fill('Revised after the earlier save began');
    await target.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await page.locator('.project-card .card-title').first().textContent(), 'Synthetic Workout Compass');
    assert.equal(
      await page.evaluate((name) => {
        const card = [...document.querySelectorAll('.project-card')]
          .find((element) => element.querySelector('.card-title')?.textContent === name);
        return document.activeElement === card?.querySelector('.card-next-action-edit');
      }, 'Synthetic Workout Compass'),
      true,
      'focus returns to the live opener after the edited card reorders',
    );
    assert.equal(await saveIndicator(page).textContent(), 'Remote save: Saving…');

    firstHold.resolve();
    assert.equal((await firstResponse).status(), 204);
    await secondRequest;
    const secondHold = await waitForHeldPut(fixture, 2);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await saveIndicator(page).textContent(), 'Remote save: Saving…');
    assert.equal(fixture.workspace.projects.find((project) => project.id === 'target').steps[0].title, 'Prepare outline');

    const pendingSecondResponse = waitForWorkspacePut(page);
    secondHold.resolve();
    assert.equal((await pendingSecondResponse).status(), 503);
    await waitForSaveStatus(page, 'Save failed');
    assert.equal(fixture.puts.length, 2, 'failed latest save does not retry without a new action');
    assert.equal(fixture.workspace.settings.theme, 'system');
    assert.equal(fixture.workspace.projects.find((project) => project.id === 'target').steps[0].title, 'Prepare outline');
    const local = await readLocal(page);
    assert.equal(local.projects.find((project) => project.id === 'target').steps[0].title, 'Revised after the earlier save began');
    assert.equal(local.settings.theme, 'system');

    const recoveryResponse = waitForWorkspacePut(page);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await recoveryResponse).status(), 204);
    await waitForSaveStatus(page, 'Saved');
    const recovered = fixture.workspace.projects.find((project) => project.id === 'target');
    assert.equal(recovered.steps[0].title, 'Revised after the earlier save began');
    assert.equal(recovered.progress_pct, 50);
    assert.equal(recovered.notes_md, 'Earlier notes');
    assert.equal(recovered.status, 'in_progress');
    assert.equal(fixture.workspace.activity.length, 1);
    assert.equal(fixture.workspace.activity[0].type, 'project_updated');
    assert.equal(fixture.workspace.activity[0].projectId, 'target');
    assert.equal(fixture.workspace.settings.theme, 'system');
    assert.equal(await page.getByRole('textbox', { name: 'Next step' }).count(), 0);
    assert.equal(fixture.puts.length, 3, 'reload reconciles the failed latest snapshot exactly once');
    counters.scenarios += 1;
  } finally {
    await closeScenario(context, fixture);
  }
}

async function assertNextActionNoopStaleDraftAndResponsiveFocus() {
  const { context, page, fixture } = await openScenario({});
  try {
    await waitForSaveStatus(page, 'Saved');
    const card = projectCard(page, 'Synthetic Workout Compass');
    const open = card.getByRole('button', { name: 'Edit next step' });
    assert.ok(await open.evaluate((element) => element.getBoundingClientRect().height >= 44));
    await open.click();
    const input = card.getByRole('textbox', { name: 'Next step' });
    await assertLabeledInput(input, 'Next step');
    assert.equal(await input.getAttribute('maxlength'), '400');
    const originalDraft = await input.inputValue();
    assert.equal(await rejectRawPaste(input, 'first\u2028second'), true);
    const lineError = card.getByRole('alert');
    await lineError.waitFor();
    assert.equal(await input.inputValue(), originalDraft, 'rejected raw paste does not transform the draft');
    assert.equal(
      await input.evaluate((element) => document.getElementById(element.getAttribute('aria-describedby'))?.getAttribute('role')),
      'alert',
      'editor error is connected with aria-describedby',
    );

    for (const width of [320, 390, 1440]) {
      await assertPageFits(page, width, 'Dashboard next-step editor');
    }
    await input.fill('Prepare outline');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await input.waitFor({ state: 'detached' });
    assert.equal(fixture.puts.length, 0, 'unchanged title creates no remote write');
    assert.equal(fixture.workspace.activity.length, 0, 'unchanged title creates no activity');
    assert.equal(
      await open.evaluate((element) => document.activeElement === element),
      true,
      'no-op close restores focus to the current opener',
    );

    await open.click();
    const staleInput = card.getByRole('textbox', { name: 'Next step' });
    await staleInput.fill('Draft must survive stale rejection');
    const changedOrder = await page.evaluate(() => {
      const cardElement = [...document.querySelectorAll('.project-card')]
        .find((element) => element.querySelector('.card-title')?.textContent === 'Synthetic Workout Compass');
      const fiberKey = Object.keys(cardElement ?? {}).find((key) => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? cardElement[fiberKey] : null;
      while (fiber && fiber.memoizedProps?.project?.id !== 'target') fiber = fiber.return;
      const project = fiber?.memoizedProps?.project;
      const step = project?.steps.find((item) => item.id === 'step-1');
      if (!step) throw new Error('Could not locate the live ProjectCard store snapshot');
      const originalOrder = step.order;
      step.order = originalOrder + 10;
      return { originalOrder, updatedOrder: step.order };
    });
    assert.notEqual(changedOrder.updatedOrder, changedOrder.originalOrder);
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await card.getByRole('alert').filter({ hasText: 'Next step changed while editing' }).waitFor();
    assert.equal(await staleInput.inputValue(), 'Draft must survive stale rejection');
    assert.equal(fixture.puts.length, 0, 'stale captured order is rejected without a write');
    assert.equal(fixture.workspace.activity.length, 0, 'stale rejection creates no activity');
    assert.equal(fixture.workspace.projects[0].steps[0].title, 'Prepare outline');
    await staleInput.press('Escape');
    await staleInput.waitFor({ state: 'detached' });
    const liveOpener = card.getByRole('button', { name: 'Edit next step' });
    assert.equal(
      await liveOpener.evaluate((element) => document.activeElement === element),
      true,
      'Escape restores focus to the live opener',
    );
    assert.equal(await saveIndicator(page).textContent(), 'Remote save: Saved');
    counters.scenarios += 1;
  } finally {
    await closeScenario(context, fixture);
  }
}

async function assertOnlyOneDashboardCardEditor() {
  const { context, page, fixture } = await openScenario({ extraProject: true });
  try {
    const target = projectCard(page, 'Synthetic Workout Compass');
    const secondary = projectCard(page, 'Concurrent fixture project');
    await target.getByRole('button', { name: 'Edit next step' }).click();
    await target.getByRole('textbox', { name: 'Next step' }).waitFor();
    await secondary.getByRole('button', { name: 'Blocker' }).click();
    await target.locator('.card-next-step-editor').waitFor({ state: 'detached' });
    await secondary.getByRole('textbox', { name: 'Blocker' }).waitFor();
    assert.equal(await page.locator('.card-quick form').count(), 1);
    assert.equal(await page.locator('.card-next-step-editor').count(), 0);
    await secondary.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(
      await secondary.getByRole('button', { name: 'Blocker' }).evaluate((element) => document.activeElement === element),
      true,
    );
    assert.equal(fixture.puts.length, 0);
    counters.scenarios += 1;
  } finally {
    await closeScenario(context, fixture);
  }
}

async function assertMilestoneAppendReloadAndResponsiveFocus() {
  const { context, page, fixture } = await openScenario({});
  try {
    await waitForSaveStatus(page, 'Saved');
    const card = projectCard(page, 'Synthetic Workout Compass');
    await card.getByRole('link', { name: 'Synthetic Workout Compass' }).first().click();
    await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
    const opener = page.getByRole('button', { name: 'Add milestone' });
    assert.ok(await opener.evaluate((element) => element.getBoundingClientRect().height >= 44));
    await opener.click();
    const input = page.getByRole('textbox', { name: 'Milestone' });
    await assertLabeledInput(input, 'Milestone');
    assert.equal(await input.getAttribute('maxlength'), '2000');
    assert.equal(await rejectRawPaste(input, 'first\u2029second'), true);
    const error = page.getByRole('alert');
    await error.waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(
      await input.evaluate((element) => document.getElementById(element.getAttribute('aria-describedby'))?.getAttribute('role')),
      'alert',
    );

    for (const width of [320, 390, 1440]) {
      await assertPageFits(page, width, 'Project Detail milestone editor');
    }
    const text = `Release review ${'evidence '.repeat(160)}`;
    await input.fill(text);
    const before = fixture.workspace.projects[0];
    const expectedDate = new Date().toISOString().slice(0, 10);
    const responsePromise = waitForWorkspacePut(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await responsePromise).status(), 204);
    await waitForSaveStatus(page, 'Saved');
    const saved = fixture.workspace.projects.find((project) => project.id === 'target');
    assert.equal(saved.notes_md, `Earlier notes\nMilestone ${expectedDate}: ${text.trim()}`);
    assert.equal(saved.status, before.status);
    assert.equal(saved.progress_pct, before.progress_pct);
    assert.deepEqual(saved.steps, before.steps);
    assert.equal(fixture.workspace.activity.length, 1);
    assert.equal(fixture.workspace.activity[0].type, 'project_updated');
    assert.equal(fixture.workspace.activity[0].projectId, 'target');
    assert.equal(fixture.workspace.activity[0].message, 'Added milestone for “Synthetic Workout Compass”');
    assert.equal(await opener.evaluate((element) => document.activeElement === element), true);

    const putCount = fixture.puts.length;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
    await waitForSaveStatus(page, 'Saved');
    assert.equal(fixture.puts.length, putCount, 'acknowledged milestone reload does not write again');
    assert.equal(await page.locator('.notes-area').inputValue(), saved.notes_md);
    assert.equal((await readLocal(page)).projects.find((project) => project.id === 'target').notes_md, saved.notes_md);
    await page.getByRole('button', { name: 'Add milestone' }).click();
    await page.getByRole('textbox', { name: 'Milestone' }).press('Escape');
    assert.equal(
      await page.getByRole('button', { name: 'Add milestone' }).evaluate((element) => document.activeElement === element),
      true,
      'Escape restores milestone opener focus',
    );
    counters.scenarios += 1;
  } finally {
    await closeScenario(context, fixture);
  }
}

async function assertMilestoneNotesCapKeepsDraft() {
  const { context, page, fixture } = await openScenario({ notes: 'x'.repeat(199_999) });
  try {
    await waitForSaveStatus(page, 'Saved');
    await projectCard(page, 'Synthetic Workout Compass')
      .getByRole('link', { name: 'Synthetic Workout Compass' }).first().click();
    await page.getByRole('button', { name: 'Add milestone' }).click();
    const input = page.getByRole('textbox', { name: 'Milestone' });
    await input.fill('One more note');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '200,000-character limit' }).waitFor();
    assert.equal(await input.inputValue(), 'One more note', 'notes-cap rejection retains the draft');
    assert.equal(fixture.puts.length, 0);
    assert.equal(fixture.workspace.activity.length, 0);
    assert.equal(fixture.workspace.projects[0].notes_md.length, 199_999);
    assert.equal(await saveIndicator(page).textContent(), 'Remote save: Saved');
    counters.scenarios += 1;
  } finally {
    await closeScenario(context, fixture);
  }
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
  if (quickUpdatesOnly) {
    await run('latest snapshot stays Saving across held A/B, then reports failure and recovers on reload', assertLatestSnapshotAcknowledgmentAndErrorRecovery);
    await run('next-step no-op, stale-order draft retention, accessible focus and responsive layout', assertNextActionNoopStaleDraftAndResponsiveFocus);
    await run('only one dashboard card editor is open at a time', assertOnlyOneDashboardCardEditor);
    await run('milestone append, single activity, reload persistence, focus and responsive layout', assertMilestoneAppendReloadAndResponsiveFocus);
    await run('milestone notes cap rejects without losing draft or writing', assertMilestoneNotesCapKeepsDraft);
    await run('conflict is explicit and never retries', assertConflictDoesNotRetry);
  } else {
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
  }
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
