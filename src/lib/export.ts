import type { AppSettings, StorageBlob } from '../types';
import { validateImportBlob } from './importValidation';

export { MAX_IMPORT_BYTES, ImportValidationError } from './importValidation';

export function toExportJson(blob: StorageBlob): string {
  return JSON.stringify(blob, null, 2);
}

/**
 * Parse untrusted import text into a StorageBlob.
 * Rejects malformed, unsafe, or oversized payloads with user-safe messages.
 */
export function parseImportJson(text: string): StorageBlob {
  return validateImportBlob(text);
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
