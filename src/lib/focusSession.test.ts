import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FocusSessionRecord } from '../types';

import {
  DEFAULT_FOCUS_STATE,
  addFocusRecord,
  applyFocusStart,
  applyFocusStop,
  applyFocusFinalize,
  applyFocusKeepWorking,
  canMarkLinkedStepDone,
  clampToSessionWindow,
  createActiveSession,
  dedupeFocusHistory,
  getRemainingSeconds,
  hydrateFocusState,
  isFocusPreset,
  isReadyToResolve,
  isCanonicalInstant,
  focusBoundaryMs,
  focusPhase,
  expectedElapsedSeconds,
  elapsedSecondsFor,
  finalizeSession,
  resolveOutcome,
  sortFocusHistory,
  startOfLocalWeek,
  focusMinutesInLocalWeek,
  focusWeekSummary,
  normalizeFocusNote,
  mergeFocusHistories,
  mergeFocusState,
  normalizeFocusState,
  pruneFocusState,
  toCanonicalInstant,
} from './focusSession';

function makeRecord(overrides: Partial<FocusSessionRecord> = {}): FocusSessionRecord {
  return {
    id: 'r1',
    projectId: 'p1',
    startedAt: '2026-08-03T09:00:00.000Z',
    endedAt: '2026-08-03T09:25:00.000Z',
    plannedMinutes: 25,
    elapsedSeconds: 1_500,
    outcome: 'expired',
    ...overrides,
  };
}

describe('focus session canonical instants', () => {
  it('accepts UTC instants with optional millisecond precision', () => {
    assert.equal(isCanonicalInstant('2026-08-03T09:00:00Z'), true);
    assert.equal(isCanonicalInstant('2026-08-03T09:00:00.5Z'), true);
    assert.equal(isCanonicalInstant('2026-08-03T09:00:00.123Z'), true);
  });

  it('rejects offsets, date-only values, impossible dates, and wrong types', () => {
    for (const value of [
      '2026-08-03T09:00:00+02:00',
      '2026-08-03 09:00:00Z',
      '2026-08-03',
      '2026-08-03T09:00:00.123456Z',
      '2026-02-30T09:00:00Z',
      '',
      null,
      42,
    ]) {
      assert.equal(isCanonicalInstant(value), false, String(value));
    }
  });
});

describe('focus session defaults', () => {
  it('exposes an empty default focus state', () => {
    assert.deepEqual(DEFAULT_FOCUS_STATE, { active: null, history: [] });
  });
});

describe('focus session timestamp writer', () => {
  it('writes canonical UTC instants and rejects non-finite times', () => {
    const ms = Date.parse('2026-08-03T09:00:00Z');
    const iso = toCanonicalInstant(ms);
    assert.equal(iso, '2026-08-03T09:00:00.000Z');
    assert.equal(iso.endsWith('Z'), true);
    assert.throws(() => toCanonicalInstant(Number.NaN));
    assert.throws(() => toCanonicalInstant(Number.POSITIVE_INFINITY));
  });
});

describe('focus session remaining time', () => {
  it('rounds up while running and never returns negative or invalid values', () => {
    const endsAt = '2026-08-03T09:25:00.000Z';
    const endsAtMs = Date.parse(endsAt);
    assert.equal(getRemainingSeconds(endsAt, endsAtMs - 1_001), 2);
    assert.equal(getRemainingSeconds(endsAt, endsAtMs), 0);
    assert.equal(getRemainingSeconds(endsAt, endsAtMs + 1), 0);
    for (const value of ['', 'not-a-date', '2026-08-03T09:25:00+02:00']) {
      assert.equal(getRemainingSeconds(value, endsAtMs - 1_000), 0);
    }
    assert.equal(getRemainingSeconds(endsAt, endsAtMs - 60_000), 60);
  });
});

describe('focus session phase selector', () => {
  const startedAtMs = Date.parse('2026-08-03T09:00:00.000Z');
  const active = createActiveSession({
    id: 'phase-active',
    projectId: 'p1',
    plannedMinutes: 25,
    startedAtMs,
  });

  it('selects setup, running, and resolve from the active snapshot', () => {
    assert.equal(
      focusPhase({ active: null, projectId: 'p1', nowMs: startedAtMs }),
      'setup',
    );
    assert.equal(
      focusPhase({ active, projectId: 'p2', nowMs: startedAtMs }),
      'setup',
    );
    assert.equal(
      focusPhase({ active, projectId: 'p1', nowMs: startedAtMs + 60_000 }),
      'running',
    );
    assert.equal(
      focusPhase({ active, projectId: 'p1', nowMs: Date.parse(active.endsAt) }),
      'resolve',
    );
    assert.equal(
      focusPhase({
        active: { ...active, stoppedAt: '2026-08-03T09:01:00.000Z' },
        projectId: 'p1',
        nowMs: startedAtMs + 60_000,
      }),
      'resolve',
    );
  });
});

describe('focus session creation', () => {
  it('accepts only documented presets and creates an absolute session window', () => {
    for (const value of [15, 25, 45, 60]) assert.equal(isFocusPreset(value), true);
    for (const value of [0, 30, 61, '25', null, Number.NaN]) {
      assert.equal(isFocusPreset(value), false);
    }

    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const active = createActiveSession({
      id: 'focus-1',
      projectId: 'project-1',
      plannedMinutes: 25,
      startedAtMs,
    });
    assert.equal(Date.parse(active.endsAt) - Date.parse(active.startedAt), 25 * 60_000);
    assert.equal(isCanonicalInstant(active.startedAt), true);
    assert.equal(isCanonicalInstant(active.endsAt), true);
    assert.equal('stepId' in active, false);
    assert.equal('stoppedAt' in active, false);
    assert.ok(Date.parse(active.endsAt) > Date.parse(active.startedAt));
  });

  it('treats expired and stopped sessions as ready to resolve', () => {
    const active = createActiveSession({
      id: 'focus-2',
      projectId: 'project-1',
      plannedMinutes: 15,
      startedAtMs: 1_000_000,
    });
    assert.equal(isReadyToResolve(null, 1_000_000), false);
    assert.equal(isReadyToResolve(active, 1_000_001), false);
    assert.equal(isReadyToResolve(active, Date.parse(active.endsAt)), true);
    assert.equal(
      isReadyToResolve({ ...active, stoppedAt: active.startedAt }, 1_000_001),
      true,
    );
  });
});

describe('focus session notes', () => {
  it('trims notes and omits blank values', () => {
    assert.equal(normalizeFocusNote('  hi  '), 'hi');
    assert.equal(normalizeFocusNote(''), undefined);
    assert.equal(normalizeFocusNote('   '), undefined);
    assert.equal(normalizeFocusNote(42), undefined);
  });
});

describe('focus session step eligibility', () => {
  it('only allows marking an existing unfinished linked step', () => {
    const active = {
      ...createActiveSession({
        id: 'focus-step',
        projectId: 'p1',
        plannedMinutes: 25,
        startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
      }),
      stepId: 's1',
    };
    const projects = [{ id: 'p1', steps: [{ id: 's1', done: false }] }];
    assert.equal(canMarkLinkedStepDone({ projects, active }), true);
    assert.equal(canMarkLinkedStepDone({ projects, active: null }), false);
    assert.equal(
      canMarkLinkedStepDone({
        projects: [{ id: 'p1', steps: [{ id: 's1', done: true }] }],
        active,
      }),
      false,
    );
    assert.equal(
      canMarkLinkedStepDone({
        projects: [{ id: 'p2', steps: [{ id: 's1', done: false }] }],
        active,
      }),
      false,
    );
  });
});

describe('focus session boundaries', () => {
  it('clamps stop and elapsed boundaries to the session window', () => {
    const active = createActiveSession({
      id: 'focus-boundary',
      projectId: 'p1',
      plannedMinutes: 25,
      startedAtMs: 1_000_000,
    });
    const startedAtMs = Date.parse(active.startedAt);
    const endsAtMs = Date.parse(active.endsAt);
    for (const nowMs of [startedAtMs - 1, startedAtMs, startedAtMs + 1_000, endsAtMs, endsAtMs + 1]) {
      assert.equal(
        clampToSessionWindow({ active, nowMs }),
        Math.min(Math.max(nowMs, startedAtMs), endsAtMs),
      );
      assert.equal(focusBoundaryMs(active, nowMs), clampToSessionWindow({ active, nowMs }));
    }
    const stoppedAt = active.startedAt;
    assert.equal(
      focusBoundaryMs({ ...active, stoppedAt }, endsAtMs + 3_600_000),
      startedAtMs,
    );
  });
});

describe('focus session outcomes', () => {
  it('requires an eligible unfinished step for completed outcomes', () => {
    const active = createActiveSession({
      id: 'focus-outcome',
      projectId: 'p1',
      plannedMinutes: 15,
      startedAtMs: 1_000_000,
    });
    const endsAtMs = Date.parse(active.endsAt);
    assert.equal(
      resolveOutcome({
        active: { ...active, stepId: 's1' },
        markStepDone: true,
        canMarkStepDone: true,
        nowMs: endsAtMs + 1,
      }),
      'completed',
    );
    assert.equal(
      resolveOutcome({
        active: { ...active, stepId: 's1' },
        markStepDone: true,
        canMarkStepDone: false,
        nowMs: endsAtMs + 1,
      }),
      'expired',
    );
    assert.equal(
      resolveOutcome({
        active,
        markStepDone: false,
        canMarkStepDone: false,
        nowMs: 1_000_001,
      }),
      'stopped',
    );
    assert.equal(
      resolveOutcome({
        active: { ...active, stoppedAt: active.startedAt },
        markStepDone: false,
        canMarkStepDone: false,
        nowMs: endsAtMs + 3_600_000,
      }),
      'stopped',
    );
  });
});

describe('focus session elapsed time', () => {
  it('floors and clamps elapsed seconds to the planned window', () => {
    const cases = [
      { spanMs: 999, expected: 0 },
      { spanMs: 1_999, expected: 1 },
      { spanMs: -1, expected: 0 },
      { spanMs: 25 * 60_000 + 1, expected: 25 * 60 },
    ];
    for (const { spanMs, expected } of cases) {
      const result = expectedElapsedSeconds({
        startedAtMs: 10_000,
        endedAtMs: 10_000 + spanMs,
        plannedMinutes: 25,
      });
      assert.equal(result, expected);
      assert.equal(Number.isInteger(result), true);
    }
  });

  it('uses stoppedAt as the elapsed boundary even when resolved later', () => {
    const active = {
      ...createActiveSession({
        id: 'focus-elapsed',
        projectId: 'p1',
        plannedMinutes: 25,
        startedAtMs: 1_000_000,
      }),
      stoppedAt: toCanonicalInstant(1_060_000),
    };
    assert.equal(
      elapsedSecondsFor({ active, endedAtMs: 1_060_000 }),
      60,
    );
    assert.equal(
      elapsedSecondsFor({
        active: { ...active, stoppedAt: undefined },
        endedAtMs: Date.parse(active.endsAt) + 3_600_000,
      }),
      25 * 60,
    );
  });

  it('finalizes records with canonical boundaries, derived elapsed time, and notes', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const active = {
      ...createActiveSession({
        id: 'focus-record',
        projectId: 'p1',
        stepId: 's1',
        plannedMinutes: 25,
        startedAtMs,
      }),
    };
    const before = { ...active };
    const expired = finalizeSession({
      active,
      outcome: 'expired',
      note: '  finished  ',
      endedAtMs: startedAtMs + 25 * 60_000,
    });
    assert.equal(expired.endedAt, '2026-08-03T09:25:00.000Z');
    assert.equal(expired.elapsedSeconds, 25 * 60);
    assert.equal(expired.outcome, 'expired');
    assert.equal(expired.note, 'finished');
    assert.deepEqual(active, before);

    const stopped = finalizeSession({
      active: { ...active, stoppedAt: toCanonicalInstant(startedAtMs + 60_000) },
      outcome: 'stopped',
      note: '   ',
      endedAtMs: startedAtMs + 60_000,
    });
    assert.equal(stopped.elapsedSeconds, 60);
    assert.equal('note' in stopped, false);
    assert.equal('stoppedAt' in stopped, false);
  });

  it('canonicalizes expired records to the exact planned boundary', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const active = createActiveSession({
      id: 'focus-expired-boundary',
      projectId: 'p1',
      plannedMinutes: 25,
      startedAtMs,
    });
    const plannedEndAtMs = startedAtMs + 25 * 60_000;

    for (const endedAtMs of [startedAtMs + 5 * 60_000, plannedEndAtMs + 5 * 60_000]) {
      const record = finalizeSession({
        active,
        outcome: 'expired',
        endedAtMs,
      });
      assert.equal(record.endedAt, toCanonicalInstant(plannedEndAtMs));
      assert.equal(record.elapsedSeconds, 25 * 60);
    }
  });
});

describe('focus session history ordering', () => {
  it('sorts newest first with an ascending id tie-breaker', () => {
    const sorted = sortFocusHistory([
      makeRecord({ id: 'z', endedAt: '2026-08-03T09:10:00.000Z' }),
      makeRecord({ id: 'b', endedAt: '2026-08-03T09:25:00.000Z' }),
      makeRecord({ id: 'a', endedAt: '2026-08-03T09:25:00.000Z' }),
    ]);
    assert.deepEqual(sorted.map((record) => record.id), ['a', 'b', 'z']);
  });

  it('deduplicates by the canonical winner and is idempotent', () => {
    const history = [
      makeRecord({ id: 'same', endedAt: '2026-08-03T09:01:00.000Z', note: 'old' }),
      makeRecord({ id: 'other', endedAt: '2026-08-03T09:03:00.000Z' }),
      makeRecord({ id: 'same', endedAt: '2026-08-03T09:02:00.000Z', note: 'winner' }),
    ];
    const deduped = dedupeFocusHistory(history);
    assert.deepEqual(deduped.map((record) => record.id), ['other', 'same']);
    assert.equal(deduped[1]?.note, 'winner');
    assert.deepEqual(dedupeFocusHistory(deduped), deduped);
  });

  it('adds newest records and trims only the oldest past the cap', () => {
    const history = Array.from({ length: 250 }, (_, index) =>
      makeRecord({
        id: `r${index}`,
        endedAt: toCanonicalInstant(
          Date.parse('2026-08-03T10:00:00Z') + index * 1_000,
        ),
      }),
    );
    const newest = makeRecord({ id: 'newest', endedAt: '2026-08-04T00:00:00.000Z' });
    const next = addFocusRecord(history, newest);
    assert.equal(next.length, 250);
    assert.equal(next.some((record) => record.id === 'newest'), true);
    assert.equal(next.some((record) => record.id === 'r0'), false);
  });

  it('merges by id with the local record winning collisions', () => {
    const local = makeRecord({ id: 'same', note: 'local' });
    const incoming = makeRecord({
      id: 'same',
      note: 'incoming',
      endedAt: '2026-08-03T09:30:00.000Z',
    });
    const merged = mergeFocusHistories(
      [local, makeRecord({ id: 'local-only', endedAt: '2026-08-03T09:05:00.000Z' })],
      [incoming, makeRecord({ id: 'remote-only', endedAt: '2026-08-03T09:35:00.000Z' })],
    );
    assert.equal(merged.find((record) => record.id === 'same'), local);
    assert.deepEqual(
      merged.map((record) => record.id),
      ['remote-only', 'same', 'local-only'],
    );
    assert.deepEqual(mergeFocusHistories([local], [incoming]), [local]);
  });
});

describe('focus session pruning', () => {
  it('removes orphaned projects and active step links without deleting sessions', () => {
    const active = {
      ...createActiveSession({
        id: 'active',
        projectId: 'p1',
        stepId: 'done-step',
        plannedMinutes: 25,
        startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
      }),
      stoppedAt: '2026-08-03T09:01:00.000Z',
    };
    const state = {
      active,
      history: [
        makeRecord({ id: 'done-step', projectId: 'p1', stepId: 'done-step' }),
        makeRecord({ id: 'missing-step', projectId: 'p1', stepId: 'gone' }),
        makeRecord({ id: 'missing-project', projectId: 'p2' }),
      ],
    };
    const pruned = pruneFocusState(state, [
      { id: 'p1', steps: [{ id: 'done-step', done: true }] },
    ]);
    assert.equal(pruned.active?.id, 'active');
    assert.equal('stepId' in (pruned.active ?? {}), false);
    assert.deepEqual(pruned.history.map((record) => record.id), ['done-step', 'missing-step']);
    assert.equal('stepId' in pruned.history[1]!, false);
    assert.equal(pruned.history[0]?.stepId, 'done-step');
    assert.equal(pruneFocusState(pruned, [{ id: 'p1', steps: [{ id: 'done-step', done: true }] }]), pruned);
  });
});

describe('focus session weekly aggregation', () => {
  it('uses the local Monday boundary and counts every outcome', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const weekStart = startOfLocalWeek(now);
    assert.equal(weekStart.getDay(), 1);
    assert.equal(weekStart.getHours(), 0);
    const history = [
      makeRecord({
        id: 'monday',
        projectId: 'p1',
        endedAt: weekStart.toISOString(),
        elapsedSeconds: 60,
        outcome: 'completed',
      }),
      makeRecord({
        id: 'sunday',
        projectId: 'p1',
        endedAt: new Date(weekStart.getTime() - 1).toISOString(),
        elapsedSeconds: 120,
        outcome: 'stopped',
      }),
      makeRecord({
        id: 'other-project',
        projectId: 'p2',
        endedAt: new Date(weekStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        elapsedSeconds: 180,
        outcome: 'expired',
      }),
    ];
    assert.equal(focusMinutesInLocalWeek(history, { now }), 4);
    assert.equal(focusMinutesInLocalWeek(history, { projectId: 'p1', now }), 1);
    assert.deepEqual(focusWeekSummary(history, { projectId: 'p1', now }), {
      minutes: 1,
      sessions: 1,
      completed: 1,
      stopped: 0,
      expired: 0,
    });
  });
});

describe('focus session lenient normalization', () => {
  it('degrades malformed state and preserves valid siblings', () => {
    const active = createActiveSession({
      id: 'active',
      projectId: 'p1',
      plannedMinutes: 25,
      startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
    });
    const normalized = normalizeFocusState({
      active,
      history: [makeRecord({ id: 'valid' }), { id: 'bad', elapsedSeconds: '60' }],
    });
    assert.deepEqual(normalized.active, active);
    assert.deepEqual(normalized.history.map((record) => record.id), ['valid']);
    for (const value of [undefined, null, 42, 'x', []]) {
      assert.deepEqual(normalizeFocusState(value), DEFAULT_FOCUS_STATE);
    }
  });
});

describe('focus session snapshot transitions', () => {
  it('starts from a project snapshot without side effects or project copying', () => {
    const projects = [{ id: 'p1', steps: [{ id: 's1', done: false }] }];
    const result = applyFocusStart({
      projects,
      focus: DEFAULT_FOCUS_STATE,
      request: { id: 'new-active', projectId: 'p1', stepId: 's1', plannedMinutes: 25 },
      nowMs: Date.parse('2026-08-03T09:00:00Z'),
    });
    assert.equal('reason' in result, false);
    if ('reason' in result) return;
    assert.equal(result.nextProjects, projects);
    assert.equal(result.record, null);
    assert.deepEqual(result.events, []);
    assert.equal(result.nextFocus.active?.id, 'new-active');
    assert.equal(result.nextFocus.active?.stepId, 's1');
  });

  it('stops once at the canonical clamped boundary and is idempotent', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const active = createActiveSession({
      id: 'stop-active',
      projectId: 'p1',
      plannedMinutes: 25,
      startedAtMs,
    });
    const projects = [{ id: 'p1', steps: [] }];
    const focus = { active, history: [] };
    const stopped = applyFocusStop({
      projects,
      focus,
      nowMs: startedAtMs + 60_000,
    });
    assert.ok(stopped);
    assert.equal(stopped.nextProjects, projects);
    assert.equal(stopped.nextFocus.history, focus.history);
    assert.equal(stopped.nextFocus.active?.stoppedAt, '2026-08-03T09:01:00.000Z');
    assert.deepEqual(stopped.events, []);
    const again = applyFocusStop({
      projects,
      focus: stopped.nextFocus,
      nowMs: startedAtMs + 3_600_000,
    });
    assert.ok(again);
    assert.equal(again.nextFocus.active?.stoppedAt, stopped.nextFocus.active?.stoppedAt);
    assert.equal(again.nextFocus, stopped.nextFocus);
  });

  it('finalizes once, delegates step completion, and orders events', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const projects = [{
      id: 'p1',
      steps: [{ id: 's1', title: 'Write', done: false }],
    }];
    const active = {
      ...createActiveSession({
        id: 'finalize-active',
        projectId: 'p1',
        stepId: 's1',
        plannedMinutes: 25,
        startedAtMs,
      }),
    };
    const focus = { active, history: [] };
    let toggleCalls = 0;
    const nextProjects = [{
      id: 'p1',
      steps: [{ id: 's1', title: 'Write', done: true }],
    }];
    const result = applyFocusFinalize({
      projects,
      focus,
      markStepDone: true,
      note: '  done  ',
      nowMs: startedAtMs + 60_000,
      toggleStepInProjects: () => {
        toggleCalls += 1;
        return nextProjects;
      },
    });
    assert.ok(result);
    assert.equal(toggleCalls, 1);
    assert.equal(result.record?.outcome, 'completed');
    assert.deepEqual(result.events.map((event) => event.kind), ['step_toggled', 'focus_session']);
    assert.equal(result.nextProjects, nextProjects);
    assert.equal(result.nextFocus.active, null);
    assert.equal(result.nextFocus.history.length, 1);
    assert.equal(applyFocusFinalize({
      projects: nextProjects,
      focus: result.nextFocus,
      nowMs: startedAtMs + 61_000,
      toggleStepInProjects: () => nextProjects,
    }), null);
  });

  it('never fabricates completion and keeps prior history when continuing', () => {
    const startedAtMs = Date.parse('2026-08-03T09:00:00Z');
    const projects = [{ id: 'p1', steps: [{ id: 's1', done: true }] }];
    const active = {
      ...createActiveSession({
        id: 'cannot-complete',
        projectId: 'p1',
        stepId: 's1',
        plannedMinutes: 15,
        startedAtMs,
      }),
    };
    const rejectedCompletion = applyFocusFinalize({
      projects,
      focus: { active, history: [] },
      markStepDone: true,
      nowMs: Date.parse(active.endsAt) + 1,
      toggleStepInProjects: () => projects,
    });
    assert.ok(rejectedCompletion);
    assert.equal(rejectedCompletion.record?.outcome, 'expired');
    assert.equal(rejectedCompletion.nextProjects, projects);
    assert.deepEqual(rejectedCompletion.events.map((event) => event.kind), ['focus_session']);

    const continued = applyFocusKeepWorking({
      projects,
      focus: { active, history: [] },
      next: { id: 'next-active', plannedMinutes: 45 },
      nowMs: startedAtMs + 60_000,
    });
    assert.ok(continued);
    assert.equal(continued.record?.elapsedSeconds, 60);
    assert.equal(continued.nextFocus.history.length, 1);
    assert.equal(continued.nextFocus.active?.id, 'next-active');
    assert.equal(continued.nextFocus.active?.stoppedAt, undefined);
    assert.equal(continued.nextProjects, projects);
    assert.deepEqual(continued.events.map((event) => event.kind), ['focus_session']);
  });
});

describe('focus session hydration', () => {
  it('prunes storage focus against the caller-provided hydrated projects', () => {
    const active = createActiveSession({
      id: 'hydrated-active',
      projectId: 'p1',
      stepId: 's1',
      plannedMinutes: 25,
      startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
    });
    const state = hydrateFocusState({
      raw: { active, history: [makeRecord({ projectId: 'p1', stepId: 's1' })] },
      hydratedProjects: [],
    });
    assert.deepEqual(state, DEFAULT_FOCUS_STATE);
    assert.deepEqual(
      hydrateFocusState({
        raw: { active, history: [makeRecord({ projectId: 'p1', stepId: 's1' })] },
        hydratedProjects: [{ id: 'p1', steps: [{ id: 's1', done: false }] }],
      }),
      { active, history: [makeRecord({ projectId: 'p1', stepId: 's1' })] },
    );
  });
});

describe('focus session import composition', () => {
  it('replaces or merges focus against the supplied post-mutation snapshot', () => {
    const active = {
      ...createActiveSession({
        id: 'local-active',
        projectId: 'p1',
        stepId: 's1',
        plannedMinutes: 25,
        startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
      }),
      stoppedAt: '2026-08-03T09:01:00.000Z',
    };
    const local = {
      active,
      history: [makeRecord({ id: 'local-record', projectId: 'p1' })],
    };
    const incoming = {
      active: createActiveSession({
        id: 'incoming-active',
        projectId: 'p2',
        plannedMinutes: 15,
        startedAtMs: Date.parse('2026-08-03T10:00:00Z'),
      }),
      history: [
        makeRecord({ id: 'local-record', note: 'incoming' }),
        makeRecord({
          id: 'incoming-record',
          projectId: 'p2',
          endedAt: '2026-08-03T09:24:00.000Z',
          elapsedSeconds: 1_440,
        }),
      ],
    };
    const projects = [{
      id: 'p1',
      steps: [{ id: 's1', done: true }],
    }, { id: 'p2', steps: [] }];

    const replaced = mergeFocusState({
      local,
      incoming,
      projects,
      mode: 'replace',
    });
    assert.equal(replaced.active?.id, 'incoming-active');
    assert.deepEqual(replaced.history.map((record) => record.id), [
      'local-record',
      'incoming-record',
    ]);

    const merged = mergeFocusState({
      local,
      incoming,
      projects,
      mode: 'merge',
    });
    assert.equal(merged.active?.id, 'local-active');
    assert.equal(merged.active?.stoppedAt, active.stoppedAt);
    assert.equal('stepId' in (merged.active ?? {}), false);
    assert.equal(merged.history.find((record) => record.id === 'local-record'), local.history[0]);
    assert.equal(merged.history.some((record) => record.id === 'incoming-record'), true);
    assert.deepEqual(
      mergeFocusState({ local: merged, incoming, projects, mode: 'merge' }),
      merged,
    );
  });

  it('clears focus when the caller supplies a stale empty snapshot', () => {
    const state = mergeFocusState({
      local: {
        active: createActiveSession({
          id: 'active',
          projectId: 'p1',
          plannedMinutes: 15,
          startedAtMs: Date.parse('2026-08-03T09:00:00Z'),
        }),
        history: [makeRecord({ projectId: 'p1' })],
      },
      incoming: DEFAULT_FOCUS_STATE,
      projects: [],
      mode: 'merge',
    });
    assert.deepEqual(state, DEFAULT_FOCUS_STATE);
  });
});
