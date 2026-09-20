import { backup, DatabaseSync } from 'node:sqlite';
import { access, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const BACKUP_NAME = /^project-board-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

function requiredEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace('.', '-');
}

async function removeExpiredBackups(backupDir) {
  const cutoff = Date.now() - RETENTION_MS;
  const entries = await readdir(backupDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && BACKUP_NAME.test(entry.name))
    .map(async (entry) => {
      const path = join(backupDir, entry.name);
      if ((await stat(path)).mtimeMs < cutoff) await unlink(path);
    }));
}

export async function runBackup({ databasePath, backupDir }) {
  await access(databasePath);
  await mkdir(backupDir, { recursive: true });

  const finalPath = join(backupDir, `project-board-${timestamp()}.db`);
  const temporaryPath = join(
    backupDir,
    `.project-board-${process.pid}-${Date.now()}.tmp`,
  );
  let published = false;
  try {
    const source = new DatabaseSync(databasePath);
    try {
      await backup(source, temporaryPath);
    } finally {
      source.close();
    }

    const checked = new DatabaseSync(temporaryPath);
    try {
      const result = checked.prepare('PRAGMA integrity_check').get();
      if (result?.integrity_check !== 'ok') {
        throw new Error('backup integrity check failed');
      }
    } finally {
      checked.close();
    }

    await rename(temporaryPath, finalPath);
    published = true;
  } finally {
    if (!published) await unlink(temporaryPath).catch(() => undefined);
  }

  await removeExpiredBackups(backupDir);
  return finalPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const path = await runBackup({
      databasePath: requiredEnv('DATABASE_PATH'),
      backupDir: requiredEnv('BACKUP_DIR', '/var/backups/project-board'),
    });
    console.log(`SQLite backup created: ${path}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'backup failed');
    process.exitCode = 1;
  }
}
