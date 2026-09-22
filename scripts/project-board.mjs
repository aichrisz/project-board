#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'http://127.0.0.1:8780';
const CREATION_ETAG = '"workspace-missing"';
const MAX_ID_CHARS = 200;
const MAX_TITLE_CHARS = 400;
const MAX_SUMMARY_CHARS = 2000;
const MAX_NOTES_CHARS = 200_000;
const MAX_PROJECTS = 5000;
const MAX_STEPS = 500;
const PROJECT_TYPES = new Set(['game', 'web', 'tool', 'learning', 'infra', 'other']);
const PROJECT_STATUSES = new Set(['idea', 'planned', 'in_progress', 'paused', 'done', 'archived']);
const COMMAND_OPTIONS = new Set(['title', 'type', 'status', 'summary', 'url', 'owner']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

class ConflictError extends CliError {
  constructor() {
    super('conflict: workspace changed elsewhere; reload required', 2);
    this.name = 'ConflictError';
  }
}

function usage() {
  return [
    'Usage: project-board [--url URL] [--owner EMAIL] COMMAND',
    '',
    'Commands:',
    '  list [projects]',
    '  inspect [project] PROJECT_ID',
    '  add-project --title TITLE [--type TYPE] [--status STATUS] [--summary TEXT]',
    '  set-status PROJECT_ID STATUS',
    '  add-step PROJECT_ID TITLE',
    '  complete-step PROJECT_ID STEP_ID',
    '  set-blocker PROJECT_ID TEXT',
    '  clear-blocker PROJECT_ID',
    '  add-milestone PROJECT_ID TEXT',
    '  set-next PROJECT_ID TEXT',
  ].join('\n');
}

function createId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'project';
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, name, max) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CliError(`${name} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new CliError(`${name} exceeds ${max} characters`);
  return trimmed;
}

function optionalText(value, name, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new CliError(`${name} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new CliError(`${name} exceeds ${max} characters`);
  return trimmed;
}

function requireBoundedId(value, name) {
  return requireText(value, name, MAX_ID_CHARS);
}

function parseArgs(argv) {
  const options = new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.set('help', 'true');
      continue;
    }
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf('=');
    const key = argument.slice(2, equals === -1 ? undefined : equals);
    if (!COMMAND_OPTIONS.has(key)) throw new CliError(`unknown option --${key}`);
    if (options.has(key)) throw new CliError(`duplicate option --${key}`);
    const value = equals === -1 ? argv[++index] : argument.slice(equals + 1);
    if (value === undefined || value.startsWith('--')) throw new CliError(`value required for --${key}`);
    options.set(key, value);
  }
  return { options, positionals };
}

function option(options, key) {
  return options.get(key);
}

function resolveConfig(options, env) {
  const rawUrl = option(options, 'url') ?? env.PROJECT_BOARD_URL ?? DEFAULT_URL;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CliError('url must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || rawUrl.length > 2048) {
    throw new CliError('url must be an absolute http(s) URL without credentials');
  }
  const baseUrl = url.toString().replace(/\/+$/, '');

  const ownerValue = option(options, 'owner') ?? env.PROJECT_BOARD_OWNER;
  if (ownerValue === undefined || ownerValue === '') {
    throw new CliError('owner is required; use --owner or PROJECT_BOARD_OWNER');
  }
  const owner = requireText(ownerValue, 'owner', 254).toLowerCase();
  if (!EMAIL_PATTERN.test(owner) || owner.split('@').length !== 2) {
    throw new CliError('owner must be a valid email address');
  }
  return { url: baseUrl, owner };
}

function defaultWorkspace() {
  return {
    version: 1,
    projects: [],
    settings: { showCompleted: false, idleDays: 14, theme: 'system', lastExportAt: null },
    focus: { active: null, history: [] },
    activity: [],
  };
}

function assertWorkspace(workspace) {
  if (!isRecord(workspace) || workspace.version !== 1 || !Array.isArray(workspace.projects) || !Array.isArray(workspace.activity)) {
    throw new CliError('server returned an invalid workspace');
  }
  if (workspace.projects.length > MAX_PROJECTS || workspace.activity.length > 100) {
    throw new CliError('server returned an oversized workspace');
  }
  return workspace;
}

async function getWorkspace(config, fetcher) {
  const response = await fetcher(`${config.url}/api/workspace`, {
    headers: { 'Cf-Access-Authenticated-User-Email': config.owner },
  });
  const etag = response.headers.get('etag');
  if (!etag) throw new CliError('workspace response missing ETag');
  if (response.status === 204) return { workspace: defaultWorkspace(), etag: CREATION_ETAG };
  if (!response.ok) throw new CliError(`workspace GET failed: ${response.status}`);
  let workspace;
  try {
    workspace = await response.json();
  } catch {
    throw new CliError('workspace response was not JSON');
  }
  return { workspace: assertWorkspace(workspace), etag };
}

async function putWorkspace(config, workspace, etag, fetcher) {
  const response = await fetcher(`${config.url}/api/workspace`, {
    method: 'PUT',
    headers: {
      'Cf-Access-Authenticated-User-Email': config.owner,
      'content-type': 'application/json',
      'if-match': etag,
    },
    body: JSON.stringify(workspace),
  });
  if (response.status === 412) throw new ConflictError();
  if (!response.ok) throw new CliError(`workspace PUT failed: ${response.status}`);
  return response.headers.get('etag');
}

function addActivity(workspace, type, message, projectId) {
  workspace.activity = [
    { id: createId('act'), at: nowIso(), type, projectId, message },
    ...workspace.activity,
  ].slice(0, 100);
}

function findProject(workspace, id) {
  const project = workspace.projects.find((entry) => entry.id === id);
  if (!project) throw new CliError(`project not found: ${id}`);
  return project;
}

function appendNote(project, note) {
  const previous = project.notes_md.trimEnd();
  const next = previous ? `${previous}\n${note}` : note;
  if (next.length > MAX_NOTES_CHARS) throw new CliError(`notes exceed ${MAX_NOTES_CHARS} characters`);
  project.notes_md = next;
}

function requireStatus(value) {
  const status = requireText(value, 'status', 32);
  if (!PROJECT_STATUSES.has(status)) throw new CliError(`status must be one of: ${[...PROJECT_STATUSES].join(', ')}`);
  return status;
}

function requireType(value) {
  const type = requireText(value, 'type', 32);
  if (!PROJECT_TYPES.has(type)) throw new CliError(`type must be one of: ${[...PROJECT_TYPES].join(', ')}`);
  return type;
}

function progress(steps) {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((step) => step.done).length / steps.length) * 100);
}

function addProject(workspace, options, positionals) {
  if (workspace.projects.length >= MAX_PROJECTS) throw new CliError('workspace already has 5000 projects');
  const title = requireText(option(options, 'title') ?? positionals[0], 'title', MAX_TITLE_CHARS);
  const type = requireType(option(options, 'type') ?? positionals[1] ?? 'other');
  const status = requireStatus(option(options, 'status') ?? positionals[2] ?? 'idea');
  const summary = optionalText(option(options, 'summary'), 'summary', MAX_SUMMARY_CHARS);
  const timestamp = nowIso();
  const project = {
    id: createId('proj'),
    title,
    slug: slugify(title),
    type,
    status,
    summary,
    progress_pct: 0,
    steps: [],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: timestamp,
    updated_at: timestamp,
    started_at: status === 'in_progress' ? timestamp : null,
    starred: false,
  };
  workspace.projects = [project, ...workspace.projects];
  addActivity(workspace, 'project_created', `Created project “${title}”`, project.id);
  return project;
}

function setStatus(workspace, positionals, options) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const status = requireStatus(option(options, 'status') ?? positionals[1]);
  const project = findProject(workspace, projectId);
  const timestamp = nowIso();
  project.status = status;
  project.updated_at = timestamp;
  if (status === 'in_progress' && !project.started_at) project.started_at = timestamp;
  addActivity(workspace, 'status_changed', `“${project.title}” → ${status}`, project.id);
  return project;
}

function addStep(workspace, positionals, options) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const title = requireText(option(options, 'title') ?? positionals.slice(1).join(' '), 'step title', MAX_TITLE_CHARS);
  const project = findProject(workspace, projectId);
  if (project.steps.length >= MAX_STEPS) throw new CliError('project already has 500 steps');
  const order = project.steps.length === 0 ? 1 : Math.max(...project.steps.map((step) => step.order)) + 1;
  const step = { id: createId('step'), title, done: false, order };
  project.steps = [...project.steps, step];
  project.progress_pct = progress(project.steps);
  project.updated_at = nowIso();
  return step;
}

function completeStep(workspace, positionals) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const stepId = requireBoundedId(positionals[1], 'step id');
  const project = findProject(workspace, projectId);
  const step = project.steps.find((entry) => entry.id === stepId);
  if (!step) throw new CliError(`step not found: ${stepId}`);
  step.done = true;
  project.progress_pct = progress(project.steps);
  project.updated_at = nowIso();
  addActivity(workspace, 'step_toggled', `Completed step “${step.title}” on “${project.title}”`, project.id);
  return step;
}

function setBlocker(workspace, positionals) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const text = requireText(positionals.slice(1).join(' '), 'blocker text', MAX_SUMMARY_CHARS);
  const project = findProject(workspace, projectId);
  const timestamp = nowIso();
  appendNote(project, `Blocker: ${text}`);
  project.updated_at = timestamp;
  addActivity(workspace, 'project_updated', `Updated blocker for “${project.title}”`, project.id);
  return project;
}

function clearBlocker(workspace, positionals) {
  if (positionals.length !== 1) throw new CliError('usage: clear-blocker PROJECT_ID');
  const projectId = requireBoundedId(positionals[0], 'project id');
  const project = findProject(workspace, projectId);
  const timestamp = nowIso();
  appendNote(project, 'Blocker: none.');
  project.updated_at = timestamp;
  addActivity(workspace, 'project_updated', `Cleared blocker for “${project.title}”`, project.id);
  return project;
}

function addMilestone(workspace, positionals) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const text = requireText(positionals.slice(1).join(' '), 'milestone text', MAX_SUMMARY_CHARS);
  const project = findProject(workspace, projectId);
  const timestamp = nowIso();
  appendNote(project, `Milestone ${timestamp.slice(0, 10)}: ${text}`);
  project.updated_at = timestamp;
  addActivity(workspace, 'project_updated', `Added milestone for “${project.title}”`, project.id);
  return project;
}

function setNext(workspace, positionals) {
  const projectId = requireBoundedId(positionals[0], 'project id');
  const title = requireText(positionals.slice(1).join(' '), 'step title', MAX_TITLE_CHARS);
  const project = findProject(workspace, projectId);
  const step = project.steps
    .filter((entry) => !entry.done)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0];
  if (!step) throw new CliError('no unfinished step; use add-step first');

  const timestamp = nowIso();
  project.steps = project.steps.map((entry) => (
    entry.id === step.id ? { ...entry, title } : entry
  ));
  project.progress_pct = progress(project.steps);
  project.updated_at = timestamp;
  addActivity(workspace, 'project_updated', `Updated next step for “${project.title}”`, project.id);
  return project;
}

function commandName(positionals) {
  if (positionals.length === 0) throw new CliError(usage());
  return positionals[0];
}

function executeCommand(workspace, positionals, options) {
  const command = commandName(positionals);
  if (command === 'list') {
    if (positionals.length > 2 || (positionals[1] && positionals[1] !== 'projects')) throw new CliError('usage: list [projects]');
    return workspace.projects;
  }
  if (command === 'inspect') {
    const id = positionals[1] === 'project' ? positionals[2] : positionals[1];
    if (positionals.length !== (positionals[1] === 'project' ? 3 : 2)) throw new CliError('usage: inspect [project] PROJECT_ID');
    return findProject(workspace, requireBoundedId(id, 'project id'));
  }
  if (command === 'add-project' || (command === 'add' && positionals[1] === 'project')) {
    const args = command === 'add-project' ? positionals.slice(1) : positionals.slice(2);
    return addProject(workspace, options, args);
  }
  if (command === 'set-status' || (command === 'set' && positionals[1] === 'project' && positionals[2] === 'status')) {
    const args = command === 'set-status' ? positionals.slice(1) : positionals.slice(3);
    return setStatus(workspace, args, options);
  }
  if (command === 'add-step' || (command === 'add' && positionals[1] === 'step')) {
    const args = command === 'add-step' ? positionals.slice(1) : positionals.slice(2);
    return addStep(workspace, args, options);
  }
  if (command === 'complete-step' || (command === 'complete' && positionals[1] === 'step')) {
    const args = command === 'complete-step' ? positionals.slice(1) : positionals.slice(2);
    return completeStep(workspace, args);
  }
  if (command === 'set-blocker') return setBlocker(workspace, positionals.slice(1));
  if (command === 'clear-blocker') return clearBlocker(workspace, positionals.slice(1));
  if (command === 'add-milestone') return addMilestone(workspace, positionals.slice(1));
  if (command === 'set-next') return setNext(workspace, positionals.slice(1));
  throw new CliError(`unknown command: ${command}`);
}

export async function run(argv, { env = process.env, fetcher = fetch } = {}) {
  const { options, positionals } = parseArgs(argv);
  if (option(options, 'help') === 'true') return { help: usage() };
  const config = resolveConfig(options, env);
  const { workspace, etag } = await getWorkspace(config, fetcher);
  const result = executeCommand(workspace, positionals, options);
  const mutation = !['list', 'inspect'].includes(positionals[0]);
  if (mutation) await putWorkspace(config, workspace, etag, fetcher);
  return result;
}

async function main() {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'command failed';
    process.stderr.write(`${message.slice(0, 240)}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
