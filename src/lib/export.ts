import type { AppSettings, StorageBlob, ThemeMode } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { migrateProject } from './storage';

function parseTheme(value: unknown): ThemeMode {
  if (value === 'dark' || value === 'light' || value === 'system') return value;
  return DEFAULT_SETTINGS.theme;
}

export function toExportJson(blob: StorageBlob): string {
  return JSON.stringify(blob, null, 2);
}

export function parseImportJson(text: string): StorageBlob {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error('Unsupported export version (expected version: 1)');
  }
  if (!Array.isArray(obj.projects)) {
    throw new Error('Invalid export: projects must be an array');
  }
  const settingsRaw = (obj.settings ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    projects: obj.projects.map((p) =>
      migrateProject(p as StorageBlob['projects'][number]),
    ),
    settings: {
      showCompleted:
        typeof settingsRaw.showCompleted === 'boolean'
          ? settingsRaw.showCompleted
          : DEFAULT_SETTINGS.showCompleted,
      idleDays:
        typeof settingsRaw.idleDays === 'number'
          ? settingsRaw.idleDays
          : DEFAULT_SETTINGS.idleDays,
      theme: parseTheme(settingsRaw.theme),
      lastExportAt:
        typeof settingsRaw.lastExportAt === 'string' &&
        settingsRaw.lastExportAt.trim()
          ? settingsRaw.lastExportAt
          : null,
    },
  };
}

export type ImportSummary = {
  currentCount: number;
  importCount: number;
  newIds: number;
  overlappingIds: number;
  sampleTitles: string[];
  settingsKeysChanging: (keyof AppSettings)[];
  incoming: StorageBlob;
};

/** Compare current board state with a parsed import blob (no side effects). */
export function summarizeImport(
  current: StorageBlob,
  incoming: StorageBlob,
): ImportSummary {
  const currentIds = new Set(current.projects.map((p) => p.id));
  let newIds = 0;
  let overlappingIds = 0;
  for (const p of incoming.projects) {
    if (currentIds.has(p.id)) overlappingIds += 1;
    else newIds += 1;
  }

  const settingsKeysChanging: (keyof AppSettings)[] = [];
  const keys: (keyof AppSettings)[] = [
    'showCompleted',
    'idleDays',
    'theme',
    'lastExportAt',
  ];
  for (const key of keys) {
    if (current.settings[key] !== incoming.settings[key]) {
      settingsKeysChanging.push(key);
    }
  }

  const sampleTitles = incoming.projects
    .slice(0, 5)
    .map((p) => p.title || '(untitled)');

  return {
    currentCount: current.projects.length,
    importCount: incoming.projects.length,
    newIds,
    overlappingIds,
    sampleTitles,
    settingsKeysChanging,
    incoming,
  };
}

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
