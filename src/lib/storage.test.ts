import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FocusState, Project, StorageBlob } from '../types';

import { DEFAULT_SETTINGS } from '../types';
import { createActiveSession } from './focusSession';
import {
  loadStorage,
  ORPHAN_STORAGE_PREFIX,
  saveStorage,
  STORAGE_KEY,
  STORAGE_OWNER_SCOPE_KEY,
} from './storage';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [{ id: 's1', title: 'First', done: false, order: 0 }],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

function withLocalStorage<T>(initial: string | null, callback: () => T): T {
  const previous = globalThis.localStorage;
  let value = initial;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return key === STORAGE_KEY ? value : null;
      },
      setItem(key: string, next: string) {
        if (key === STORAGE_KEY) value = next;
      },
      removeItem(key: string) {
        if (key === STORAGE_KEY) value = null;
      },
    },
  });
  try {
    return callback();
  } finally {
    if (previous === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
}

function makeBlob(overrides: Partial<StorageBlob> = {}): StorageBlob {
  return {
    version: 1,
    projects: [makeProject()],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

describe('loadStorage focus compatibility', () => {
  it('defaults focus for a pre-focus v1 blob', () => {
    const loaded = withLocalStorage(JSON.stringify(makeBlob()), () => loadStorage());
    assert.deepEqual(loaded?.focus, { active: null, history: [] });
  });

  it('normalizes valid focus and does not prune without a project snapshot', () => {
    const focus: FocusState = {
      active: createActiveSession({
        id: 'active-1',
        projectId: 'missing-project',
        plannedMinutes: 25,
        startedAtMs: Date.parse('2026-08-03T09:00:00.000Z'),
      }),
      history: [],
    };
    const loaded = withLocalStorage(JSON.stringify(makeBlob({ focus })), () => loadStorage());
    assert.deepEqual(loaded?.focus, focus);
  });

  it('degrades malformed focus while preserving the rest of the blob', () => {
    const loaded = withLocalStorage(
      JSON.stringify(makeBlob({ focus: 'corrupt' as never })),
      () => loadStorage(),
    );
    assert.equal(loaded?.projects[0]?.id, 'p1');
    assert.deepEqual(loaded?.focus, { active: null, history: [] });
  });
});

describe('owner-scoped local storage', () => {
  it('blocks writes for another owner and keeps preserved orphan bytes', () => {
    const orphanKey = `${ORPHAN_STORAGE_PREFIX}${'A'.repeat(43)}`;
    const orphanRaw = JSON.stringify({
      workspace: JSON.stringify(makeBlob()),
      activity: '[]',
      legacyJournal: null,
    });
    const values = new Map<string, string>([
      [STORAGE_OWNER_SCOPE_KEY, 'A'.repeat(43)],
      [orphanKey, orphanRaw],
    ]);
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() { return values.size; },
        key(index: number) { return [...values.keys()][index] ?? null; },
        getItem(key: string) { return values.get(key) ?? null; },
        setItem(key: string, value: string) { values.set(key, value); },
        removeItem(key: string) { values.delete(key); },
      },
    });
    try {
      const original = JSON.stringify(makeBlob());
      values.set(STORAGE_KEY, original);
      saveStorage(makeBlob({ projects: [] }), 'B'.repeat(43));
      assert.equal(values.get(STORAGE_KEY), original);
      saveStorage(makeBlob({ projects: [] }), 'A'.repeat(43));
      assert.notEqual(values.get(STORAGE_KEY), original);
      assert.equal(values.get(orphanKey), orphanRaw);
    } finally {
      if (previous === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    }
  });
});
