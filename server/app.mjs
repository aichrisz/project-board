import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { access, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_PROJECTS = 5000;
const MAX_ACTIVITY = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOwner(request) {
  const value = request.headers['cf-access-authenticated-user-email'];
  if (typeof value !== 'string') return null;
  const owner = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(owner) ? owner : null;
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

function validateWorkspace(document) {
  if (!isRecord(document) || document.version !== 1) return false;
  if (!Array.isArray(document.projects) || document.projects.length > MAX_PROJECTS) return false;
  if (!isRecord(document.settings)) return false;
  if (!Array.isArray(document.activity) || document.activity.length > MAX_ACTIVITY) return false;
  if (document.focus !== undefined && !isRecord(document.focus)) return false;
  return document.projects.every(isRecord) && document.activity.every(isRecord);
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
