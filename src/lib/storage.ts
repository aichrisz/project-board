import type { Project, StorageBlob, ThemeMode } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { withAutoProgress } from './progress';

export const STORAGE_KEY = 'project-board-v1';

function parseTheme(value: unknown): ThemeMode {
  if (value === 'dark' || value === 'light' || value === 'system') return value;
  return DEFAULT_SETTINGS.theme;
}

/** Migrate project fields safely (e.g. default starred false). */
export function migrateProject(p: Project): Project {
  return withAutoProgress({
    ...p,
    starred: p.starred === true,
  });
}

function parseLastExportAt(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

export function loadStorage(): StorageBlob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StorageBlob;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return null;
    }
    return {
      version: 1,
      projects: parsed.projects.map((p) => migrateProject(p)),
      settings: {
        showCompleted:
          parsed.settings?.showCompleted ?? DEFAULT_SETTINGS.showCompleted,
        idleDays: parsed.settings?.idleDays ?? DEFAULT_SETTINGS.idleDays,
        theme: parseTheme(parsed.settings?.theme),
        lastExportAt: parseLastExportAt(parsed.settings?.lastExportAt),
      },
    };
  } catch {
    return null;
  }
}

export function saveStorage(blob: StorageBlob): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
