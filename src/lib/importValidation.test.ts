import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ActiveFocusSession,
  FocusSessionRecord,
  FocusState,
  Project,
} from '../types';

import { DEFAULT_SETTINGS } from '../types';
import { createActiveSession, finalizeSession } from './focusSession';
import {
  DEFAULT_FOCUS_STATE,
  FOCUS_HISTORY_CAP,
} from './focusSession';
import { ImportValidationError, validateImportBlob } from './importValidation';

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

function makeRecord(overrides: Partial<FocusSessionRecord> = {}): FocusSessionRecord {
  return {
    id: 'record-1',
    projectId: 'p1',
    startedAt: '2026-08-03T09:00:00.000Z',
    endedAt: '2026-08-03T09:25:00.000Z',
    plannedMinutes: 25,
    elapsedSeconds: 1_500,
    outcome: 'expired',
    ...overrides,
  };
}

function makeActive(overrides: Partial<ActiveFocusSession> = {}): ActiveFocusSession {
  return {
    id: 'active-1',
    projectId: 'p1',
    startedAt: '2026-08-03T09:00:00.000Z',
    endsAt: '2026-08-03T09:25:00.000Z',
    plannedMinutes: 25,
    ...overrides,
  };
}

function makeBlob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    projects: [makeProject()],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function assertImportError(raw: unknown, message: RegExp): void {
  assert.throws(
    () => validateImportBlob(json(raw)),
    (error: unknown) => {
      assert.ok(error instanceof ImportValidationError);
      assert.match(error.message, message);
      return true;
    },
  );
}

describe('strict focus import compatibility', () => {
  it('defaults absent and null focus to the empty state', () => {
    assert.deepEqual(validateImportBlob(json(makeBlob())).focus, DEFAULT_FOCUS_STATE);
    assert.deepEqual(
      validateImportBlob(json(makeBlob({ focus: null }))).focus,
      DEFAULT_FOCUS_STATE,
    );
  });

  it('preserves valid active and historical focus state', () => {
    const focus: FocusState = {
      active: makeActive({ stoppedAt: '2026-08-03T09:01:00.000Z' }),
      history: [
        makeRecord({
          id: 'newer',
          startedAt: '2026-08-03T10:00:00Z',
          endedAt: '2026-08-03T10:02:17Z',
          elapsedSeconds: 137,
          outcome: 'stopped',
          note: '  shipped  ',
        }),
        makeRecord({ id: 'older' }),
      ],
    };
    assert.deepEqual(validateImportBlob(json(makeBlob({ focus }))).focus, {
      active: focus.active,
      history: [
        { ...focus.history[0], note: 'shipped' },
        focus.history[1],
      ],
    });
  });

  it('strictly validates focus shape, references, timestamps, and elapsed time', () => {
    assertImportError(makeBlob({ focus: [] }), /Focus.*focus.*object/i);
    assertImportError(makeBlob({ focus: { history: {} } }), /history.*list/i);
    assertImportError(
      makeBlob({ focus: { history: [makeRecord({ projectId: 'missing' })] } }),
      /projectId.*imported project/i,
    );
    assertImportError(
      makeBlob({
        focus: {
          history: [makeRecord({ endedAt: '2026-08-03T09:01:00Z', elapsedSeconds: 900 })],
        },
      }),
      /elapsedSeconds.*match/i,
    );
    assertImportError(
      makeBlob({
        focus: {
          history: [
            makeRecord({
              endedAt: '2026-08-03T09:10:00Z',
              elapsedSeconds: 600,
            }),
          ],
        },
      }),
      /expired session.*full planned duration/i,
    );
    assertImportError(
      makeBlob({
        projects: [
          makeProject({
            steps: [{ id: 's1', title: 'First', done: true, order: 0 }],
          }),
        ],
        focus: { active: makeActive({ stepId: 's1' }), history: [] },
      }),
      /completed step/i,
    );
    assertImportError(
      makeBlob({
        focus: {
          history: [makeRecord({ startedAt: '2026-08-03T09:00:00+02:00' })],
        },
      }),
      /startedAt.*UTC timestamp/i,
    );
  });

  it('deduplicates history before applying the cap and keeps the newest winner', () => {
    const history = Array.from({ length: FOCUS_HISTORY_CAP }, (_, index) =>
      makeRecord({
        id: `record-${index}`,
        startedAt: `2026-08-03T${String(9 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`,
        endedAt: `2026-08-03T${String(9 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`,
        plannedMinutes: 15,
        elapsedSeconds: 0,
        outcome: 'stopped',
      }),
    );
    history.push(makeRecord({ id: 'record-0', note: 'newer winner' }));
    const parsed = validateImportBlob(json(makeBlob({ focus: { history } }))).focus;
    assert.equal(parsed?.history.length, FOCUS_HISTORY_CAP);
    assert.equal(parsed?.history.filter((record) => record.id === 'record-0').length, 1);
    assert.equal(parsed?.history.find((record) => record.id === 'record-0')?.note, 'newer winner');
  });

  it('accepts records produced by the shared finalizer for every outcome', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00.000Z');
    const active = createActiveSession({
      id: 'finalized',
      projectId: 'p1',
      plannedMinutes: 25,
      startedAtMs,
    });
    const records = [
      finalizeSession({
        active,
        outcome: 'expired',
        endedAtMs: startedAtMs + 25 * 60_000,
      }),
      finalizeSession({ active, outcome: 'completed', endedAtMs: startedAtMs + 300_000 }),
      finalizeSession({
        active: { ...active, stoppedAt: '2026-08-03T09:01:00.000Z' },
        outcome: 'stopped',
        endedAtMs: startedAtMs + 60_000,
      }),
    ];
    for (const record of records) {
      const parsed = validateImportBlob(
        json(makeBlob({ focus: { active: null, history: [record] } })),
      );
      assert.deepEqual(parsed.focus?.history[0], record);
    }
  });
});
