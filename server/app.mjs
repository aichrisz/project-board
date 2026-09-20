import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { access, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_PROJECTS = 5000;
const MAX_ACTIVITY = 100;
const MAX_ID_CHARS = 200;
const MAX_TITLE_CHARS = 400;
const MAX_SHORT_TEXT_CHARS = 2000;
const MAX_NOTES_CHARS = 200_000;
const MAX_URL_CHARS = 4000;
const MAX_ITEMS_PER_PROJECT = 500;
const MAX_TAGS_PER_PROJECT = 50;
const MAX_FOCUS_HISTORY = 250;
const MAX_FOCUS_NOTE_CHARS = 200;
const PROJECT_TYPES = new Set(['game', 'web', 'tool', 'learning', 'infra', 'other']);
const PROJECT_STATUSES = new Set(['idea', 'planned', 'in_progress', 'paused', 'done', 'archived']);
const ACTIVITY_TYPES = new Set([
  'project_created',
  'status_changed',
  'step_toggled',
  'focus_session',
  'project_deleted',
  'import',
  'seed',
  'reset',
]);
const THEMES = new Set(['dark', 'light', 'system']);
const FOCUS_PRESETS = new Set([15, 25, 45, 60]);
const FOCUS_OUTCOMES = new Set(['completed', 'stopped', 'expired']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const CANONICAL_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidEmail(value) {
  if (!EMAIL_PATTERN.test(value)) return false;
  const [local, domain] = value.split('@');
  return Boolean(
    local &&
      domain &&
      !local.startsWith('.') &&
      !local.endsWith('.') &&
      !local.includes('..') &&
      !domain.startsWith('.') &&
      !domain.endsWith('.') &&
      !domain.includes('..') &&
      domain.split('.').every((label) => label.length > 0),
  );
}

function normalizeOwner(request) {
  const value = request.headers['cf-access-authenticated-user-email'];
  if (typeof value !== 'string') return null;
  const owner = value.trim().toLowerCase();
  return isValidEmail(owner) ? owner : null;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(payload));
  response.end(payload);
}

function sendEmpty(response, status) {
  response.statusCode = status;
  response.end();
}

function isValidString(value, max, allowBlank = false) {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    (allowBlank || value.trim().length > 0)
  );
}

function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number.isFinite(Date.parse(value));
}

function isValidCanonicalInstant(value) {
  return (
    typeof value === 'string' &&
    CANONICAL_INSTANT_PATTERN.test(value) &&
    isValidCalendarDate(value)
  );
}

function isValidStringArray(value, maxEntries) {
  return (
    Array.isArray(value) &&
    value.length <= maxEntries &&
    value.every((entry) => isValidString(entry, MAX_SHORT_TEXT_CHARS, true))
  );
}

function isValidSteps(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS_PER_PROJECT) return false;
  const ids = new Set();
  return value.every((step) => {
    if (!isRecord(step) || !isValidString(step.id, MAX_ID_CHARS)) return false;
    if (ids.has(step.id) || !isValidString(step.title, MAX_TITLE_CHARS, true)) return false;
    if (typeof step.done !== 'boolean' || typeof step.order !== 'number' || !Number.isFinite(step.order)) return false;
    ids.add(step.id);
    return true;
  });
}

function isValidLinks(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS_PER_PROJECT) return false;
  const ids = new Set();
  return value.every((link) => {
    if (!isRecord(link) || !isValidString(link.id, MAX_ID_CHARS)) return false;
    if (ids.has(link.id)) return false;
    if (!isValidString(link.label, MAX_TITLE_CHARS, true)) return false;
    if (!isValidString(link.url, MAX_URL_CHARS)) return false;
    ids.add(link.id);
    return true;
  });
}

function isValidProject(project) {
  return (
    isRecord(project) &&
    isValidString(project.id, MAX_ID_CHARS) &&
    isValidString(project.title, MAX_TITLE_CHARS) &&
    isValidString(project.slug, MAX_TITLE_CHARS, true) &&
    PROJECT_TYPES.has(project.type) &&
    PROJECT_STATUSES.has(project.status) &&
    isValidString(project.summary, MAX_SHORT_TEXT_CHARS, true) &&
    typeof project.progress_pct === 'number' &&
    Number.isFinite(project.progress_pct) &&
    project.progress_pct >= 0 &&
    project.progress_pct <= 100 &&
    isValidSteps(project.steps) &&
    isValidString(project.notes_md, MAX_NOTES_CHARS, true) &&
    isValidLinks(project.links) &&
    isValidStringArray(project.tags, MAX_TAGS_PER_PROJECT) &&
    isValidStringArray(project.stack, MAX_TAGS_PER_PROJECT) &&
    (project.deadline === null || isValidCalendarDate(project.deadline)) &&
    isValidCalendarDate(project.created_at) &&
    isValidCalendarDate(project.updated_at) &&
    (project.started_at === null || project.started_at === undefined || isValidCalendarDate(project.started_at)) &&
    (project.starred === undefined || typeof project.starred === 'boolean')
  );
}

function isValidSettings(settings) {
  return (
    isRecord(settings) &&
    typeof settings.showCompleted === 'boolean' &&
    Number.isInteger(settings.idleDays) &&
    settings.idleDays >= 1 &&
    settings.idleDays <= 365 &&
    THEMES.has(settings.theme) &&
    (settings.lastExportAt === null || isValidCalendarDate(settings.lastExportAt))
  );
}

function projectReferences(projects) {
  const byId = new Map();
  for (const project of projects) {
    const steps = new Map(project.steps.map((step) => [step.id, step.done]));
    if (byId.has(project.id)) return null;
    byId.set(project.id, steps);
  }
  return byId;
}

function isValidFocusRecord(record, projects) {
  if (!isRecord(record)) return false;
  const steps = projects.get(record.projectId);
  if (!isValidString(record.id, MAX_ID_CHARS) || !steps || !isValidString(record.projectId, MAX_ID_CHARS)) return false;
  if (record.stepId !== undefined && (!isValidString(record.stepId, MAX_ID_CHARS) || !steps.has(record.stepId))) return false;
  if (!FOCUS_PRESETS.has(record.plannedMinutes) || !FOCUS_OUTCOMES.has(record.outcome)) return false;
  if (!isValidCanonicalInstant(record.startedAt) || !isValidCanonicalInstant(record.endedAt)) return false;
  const startedAt = Date.parse(record.startedAt);
  const endedAt = Date.parse(record.endedAt);
  const elapsed = (endedAt - startedAt) / 1000;
  if (endedAt < startedAt || !Number.isInteger(record.elapsedSeconds) || record.elapsedSeconds < 0 || record.elapsedSeconds > record.plannedMinutes * 60) return false;
  if (record.elapsedSeconds !== Math.floor(Math.min(Math.max(elapsed, 0), record.plannedMinutes * 60))) return false;
  if (record.outcome === 'expired' && (record.elapsedSeconds !== record.plannedMinutes * 60 || endedAt !== startedAt + record.plannedMinutes * 60_000)) return false;
  return record.note === undefined || (typeof record.note === 'string' && record.note.trim().length <= MAX_FOCUS_NOTE_CHARS);
}

function isValidActiveFocus(active, projects) {
  if (active === null) return true;
  if (!isRecord(active)) return false;
  const steps = projects.get(active.projectId);
  if (!isValidString(active.id, MAX_ID_CHARS) || !steps || !isValidString(active.projectId, MAX_ID_CHARS)) return false;
  if (active.stepId !== undefined && (!isValidString(active.stepId, MAX_ID_CHARS) || steps.get(active.stepId) !== false)) return false;
  if (!FOCUS_PRESETS.has(active.plannedMinutes) || !isValidCanonicalInstant(active.startedAt) || !isValidCanonicalInstant(active.endsAt)) return false;
  const startedAt = Date.parse(active.startedAt);
  const endsAt = Date.parse(active.endsAt);
  if (endsAt <= startedAt) return false;
  if (active.stoppedAt !== undefined) {
    if (!isValidCanonicalInstant(active.stoppedAt)) return false;
    const stoppedAt = Date.parse(active.stoppedAt);
    if (stoppedAt < startedAt || stoppedAt > endsAt) return false;
  }
  return true;
}

function isValidFocus(focus, projects) {
  if (focus === undefined || focus === null) return true;
  if (!isRecord(focus) || !Array.isArray(focus.history) || focus.history.length > MAX_FOCUS_HISTORY) return false;
  return isValidActiveFocus(focus.active, projects) && focus.history.every((record) => isValidFocusRecord(record, projects));
}

function isValidActivityEvent(event) {
  return (
    isRecord(event) &&
    isValidString(event.id, MAX_ID_CHARS) &&
    isValidCalendarDate(event.at) &&
    ACTIVITY_TYPES.has(event.type) &&
    isValidString(event.message, MAX_SHORT_TEXT_CHARS, true) &&
    (event.projectId === undefined || isValidString(event.projectId, MAX_ID_CHARS))
  );
}

function validateWorkspace(document) {
  if (!isRecord(document) || document.version !== 1) return false;
  if (!Array.isArray(document.projects) || document.projects.length > MAX_PROJECTS) return false;
  if (!isValidSettings(document.settings)) return false;
  if (!Array.isArray(document.activity) || document.activity.length > MAX_ACTIVITY) return false;
  if (!document.projects.every(isValidProject) || !document.activity.every(isValidActivityEvent)) return false;
  const projects = projectReferences(document.projects);
  return projects !== null && isValidFocus(document.focus, projects);
}

async function readBody(request) {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    request.resume();
    return null;
  }

  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        resolveBody(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!settled) resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function mimeType(pathname) {
  switch (extname(pathname).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.ico': return 'image/x-icon';
    case '.webmanifest': return 'application/manifest+json';
    default: return 'application/octet-stream';
  }
}

async function safeFile(root, candidate) {
  try {
    const [rootPath, filePath] = await Promise.all([realpath(root), realpath(candidate)]);
    if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) return null;
    return filePath;
  } catch {
    return null;
  }
}

async function serveFile(response, request, root, filePath, immutable) {
  const safePath = await safeFile(root, filePath);
  if (!safePath) {
    sendEmpty(response, 404);
    return;
  }
  try {
    const body = await readFile(safePath);
    response.statusCode = 200;
    response.setHeader('content-type', mimeType(safePath));
    response.setHeader('content-length', body.byteLength);
    if (immutable) response.setHeader('cache-control', 'public, max-age=31536000, immutable');
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    sendEmpty(response, 404);
  }
}

export function createApp({ databasePath, distDir = resolve('dist') }) {
  const resolvedDatabasePath = databasePath ?? resolve('data/project-board.db');
  if (resolvedDatabasePath !== ':memory:') mkdirSync(dirname(resolvedDatabasePath), { recursive: true });
  const database = new DatabaseSync(resolvedDatabasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspaces (
      owner_email TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const putWorkspace = database.prepare(`
    INSERT INTO workspaces (owner_email, data_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_email) DO UPDATE SET
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `);
  const getWorkspace = database.prepare(
    'SELECT data_json FROM workspaces WHERE owner_email = ?',
  );
  const root = resolve(distDir);

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'internal server error' });
      else response.destroy();
    });
  });

  async function handleRequest(request, response) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      sendEmpty(response, 400);
      return;
    }

    if (pathname.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) {
      sendEmpty(response, 404);
      return;
    }

    if (pathname === '/api/health') {
      if (request.method !== 'GET') {
        response.setHeader('allow', 'GET');
        sendEmpty(response, 405);
        return;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === '/api/workspace') {
      const owner = normalizeOwner(request);
      if (!owner) {
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      }
      if (request.method === 'GET') {
        const row = getWorkspace.get(owner);
        if (!row) {
          sendEmpty(response, 204);
          return;
        }
        sendJson(response, 200, JSON.parse(row.data_json));
        return;
      }
      if (request.method === 'PUT') {
        const raw = await readBody(request);
        if (raw === null) {
          sendJson(response, 413, { error: 'request body too large' });
          return;
        }
        let document;
        try {
          document = JSON.parse(raw);
        } catch {
          sendJson(response, 400, { error: 'invalid workspace' });
          return;
        }
        if (!validateWorkspace(document)) {
          sendJson(response, 400, { error: 'invalid workspace' });
          return;
        }
        putWorkspace.run(owner, JSON.stringify(document), new Date().toISOString());
        sendEmpty(response, 204);
        return;
      }
      response.setHeader('allow', 'GET, PUT');
      sendEmpty(response, 405);
      return;
    }

    if (!request.method || !['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('allow', 'GET, HEAD');
      sendEmpty(response, 405);
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const lastSegment = relativePath.split('/').at(-1) ?? '';
    const requestedFile = resolve(root, relativePath);
    const hasAssetExtension = lastSegment.includes('.') && !pathname.endsWith('/');
    let filePath = requestedFile;
    let immutable = hasAssetExtension;
    try {
      await access(requestedFile);
    } catch {
      if (hasAssetExtension) {
        sendEmpty(response, 404);
        return;
      }
      filePath = resolve(root, 'index.html');
      immutable = false;
    }
    await serveFile(response, request, root, filePath, immutable);
  }

  server.on('close', () => database.close());
  return server;
}

async function main() {
  const databasePath = process.env.DATABASE_PATH || (
    process.env.NODE_ENV === 'production' ? null : './data/project-board.db'
  );
  if (!databasePath) throw new Error('DATABASE_PATH is required in production');
  const server = createApp({
    databasePath,
    distDir: process.env.DIST_DIR || './dist',
  });
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8780);
  server.listen(port, host, () => {
    console.log(`Project Board listening on http://${host}:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
