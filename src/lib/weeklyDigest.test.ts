import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivityEvent, Project, Step } from '../types';
import { getFocusProjects } from './projectSignals';
import {
  deriveKeepMoving,
  deriveLatestWins,
  deriveNeedsAttention,
} from './weeklyDigest';

const DAY = 24 * 60 * 60 * 1000;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [],
    notes_md: '',
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'a1',
    at: '2026-09-20T10:00:00.000Z',
    type: 'project_updated',
    message: 'Updated project',
    ...overrides,
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

function steps(...items: Array<Partial<Step> & Pick<Step, 'id' | 'title'>>): Step[] {
  return items.map((item, index) => ({
    done: false,
    order: index,
    ...item,
  }));
}

describe('weekly digest', () => {
  describe('keep moving', () => {
    it('reuses focus ordering and caps at three', () => {
      const projects = [
        makeProject({ id: 'p0', updated_at: '2026-09-21T00:00:00.000Z' }),
        makeProject({ id: 'p1', updated_at: '2026-09-20T00:00:00.000Z' }),
        makeProject({ id: 'p2', updated_at: '2026-09-19T00:00:00.000Z' }),
        makeProject({ id: 'p3', updated_at: '2026-09-18T00:00:00.000Z' }),
      ];

      const expected = getFocusProjects(projects).projects.map((project) => project.id);
      const items = deriveKeepMoving(projects);

      assert.deepEqual(items.map((item) => item.projectId), expected);
      assert.equal(items.length, 3);
    });

    it('exposes the next action, blocker and freshness', () => {
      const project = makeProject({
        id: 'focus',
        title: 'Kairo Streak Guard',
        updated_at: isoDaysAgo(90),
        steps: steps(
          { id: 'later', title: 'Run old check', order: 2 },
          { id: 'next', title: 'Run mobile QA', order: 1 },
        ),
        notes_md: 'Blocker: Waiting for alert endpoint',
      });

      assert.deepEqual(deriveKeepMoving([project]), [
        {
          projectId: 'focus',
          title: 'Kairo Streak Guard',
          nextAction: 'Run mobile QA',
          blocker: 'Waiting for alert endpoint',
          freshness: 'Review',
        },
      ]);
    });

    it('uses null when there is no next action, blocker or freshness', () => {
      const project = makeProject({
        id: 'calm',
        updated_at: isoDaysAgo(1),
        steps: steps({ id: 'done', title: 'Done', done: true }),
        notes_md: 'Blocker: none.',
      });

      assert.deepEqual(deriveKeepMoving([project]), [
        {
          projectId: 'calm',
          title: 'Alpha',
          nextAction: null,
          blocker: null,
          freshness: null,
        },
      ]);
    });

    it('does not mutate the source projects', () => {
      const projects = [
        makeProject({
          id: 'p0',
          steps: steps({ id: 's1', title: 'Ship', order: 1 }),
          notes_md: 'Blocker: waiting',
        }),
      ];
      const original = structuredClone(projects);

      deriveKeepMoving(projects);

      assert.deepEqual(projects, original);
    });
  });

  describe('needs attention', () => {
    it('deduplicates a project that has both a blocker and freshness', () => {
      const project = makeProject({
        id: 'both',
        notes_md: 'Blocker: waiting',
        updated_at: isoDaysAgo(90),
      });

      const items = deriveNeedsAttention([project]);

      assert.equal(items.length, 1);
      assert.deepEqual(items[0], {
        projectId: 'both',
        title: 'Alpha',
        blocker: 'waiting',
        freshness: 'Review',
      });
    });

    it('orders by severity blocker+Review, blocker, Review, Quiet', () => {
      const projects = [
        makeProject({ id: 'quiet', updated_at: isoDaysAgo(40) }),
        makeProject({ id: 'review', updated_at: isoDaysAgo(90) }),
        makeProject({ id: 'blocker', notes_md: 'Blocker: x', updated_at: isoDaysAgo(1) }),
        makeProject({
          id: 'blocker-review',
          notes_md: 'Blocker: x',
          updated_at: isoDaysAgo(90),
        }),
      ];

      assert.deepEqual(
        deriveNeedsAttention(projects).map((item) => item.projectId),
        ['blocker-review', 'blocker', 'review', 'quiet'],
      );
    });

    it('tie-breaks valid newest updated_at then id and places invalid dates last', () => {
      const blocker = { notes_md: 'Blocker: x' };
      const sameDay = isoDaysAgo(2);
      const projects = [
        makeProject({ id: 'b-old', updated_at: isoDaysAgo(20), ...blocker }),
        makeProject({ id: 'b-invalid', updated_at: 'not-a-date', ...blocker }),
        makeProject({ id: 'b-new', updated_at: isoDaysAgo(1), ...blocker }),
        makeProject({ id: 'b-tie-b', updated_at: sameDay, ...blocker }),
        makeProject({ id: 'b-tie-a', updated_at: sameDay, ...blocker }),
      ];

      assert.deepEqual(
        deriveNeedsAttention(projects).map((item) => item.projectId),
        ['b-new', 'b-tie-a', 'b-tie-b', 'b-old', 'b-invalid'],
      );
    });

    it('caps attention at five and leaves inputs unchanged', () => {
      const projects = Array.from({ length: 6 }, (_, index) =>
        makeProject({
          id: `b${index}`,
          notes_md: 'Blocker: x',
          updated_at: `2026-09-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
        }),
      );
      const original = structuredClone(projects);

      const items = deriveNeedsAttention(projects);

      assert.equal(items.length, 5);
      assert.deepEqual(projects, original);
    });

    it('ignores terminal projects even with an active blocker', () => {
      const done = makeProject({ id: 'done', status: 'done', notes_md: 'Blocker: x' });
      const archived = makeProject({
        id: 'archived',
        status: 'archived',
        notes_md: 'Blocker: x',
      });

      assert.deepEqual(deriveNeedsAttention([done, archived]), []);
    });

    it('returns an empty list when nothing needs attention', () => {
      const fresh = makeProject({ id: 'fresh', updated_at: isoDaysAgo(1) });

      assert.deepEqual(deriveNeedsAttention([fresh]), []);
    });
  });

  describe('latest wins', () => {
    it('parses canonical milestone lines with a case-insensitive keyword', () => {
      const project = makeProject({
        id: 'p1',
        notes_md:
          'Intro\nmilestone 2026-09-21: Shipped auth\nMilestone 2026-09-20: Wrote docs',
      });

      const wins = deriveLatestWins([project], []);

      assert.deepEqual(wins.map((win) => win.text), ['Shipped auth', 'Wrote docs']);
      assert.equal(wins[0].at, '2026-09-21T00:00:00.000Z');
      assert.equal(wins[0].projectId, 'p1');
      assert.equal(wins[0].key, 'milestone:p1:2026-09-21:Shipped auth');
    });

    it('rejects malformed lines, invalid calendar dates and empty text', () => {
      const project = makeProject({
        id: 'p1',
        notes_md: [
          'Milestone 2026-02-30: Impossible',
          'Milestone 2026-13-01: Impossible',
          'Milestone 2026-09-21:',
          'Milestone 2026-09-21:    ',
          'Milestone 26-09-21: Short year',
          'Milestones 2026-09-21: Plural',
          'prefix Milestone 2026-09-21: Embedded',
          'Milestone 2026-09-21: Valid but only this',
        ].join('\n'),
      });

      assert.deepEqual(
        deriveLatestWins([project], []).map((win) => win.text),
        ['Valid but only this'],
      );
    });

    it('dedupes identical project/date/text milestones', () => {
      const project = makeProject({
        id: 'p1',
        notes_md: 'Milestone 2026-09-21: Ship\nMilestone 2026-09-21: Ship',
      });

      assert.equal(deriveLatestWins([project], []).length, 1);
    });

    it('includes only unambiguous completed-step and status-done activity', () => {
      const events = [
        makeEvent({
          id: 'step',
          type: 'step_toggled',
          message: 'Completed step “Auth” on “Alpha”',
        }),
        makeEvent({ id: 'status', type: 'status_changed', message: '“Alpha” → done' }),
        makeEvent({ id: 'status-label', type: 'status_changed', message: '“Alpha” → Done' }),
        makeEvent({
          id: 'reopen',
          type: 'step_toggled',
          message: 'Reopened step “Auth” on “Alpha”',
        }),
        makeEvent({ id: 'paused', type: 'status_changed', message: '“Alpha” → paused' }),
        makeEvent({
          id: 'update',
          type: 'project_updated',
          message: 'Updated blocker for “Alpha”',
        }),
        makeEvent({ id: 'import', type: 'import', message: 'Imported workspace' }),
        makeEvent({ id: 'reset', type: 'reset', message: 'Reset workspace' }),
        makeEvent({
          id: 'focus',
          type: 'focus_session',
          message: 'Focus 25m on “Alpha” — step “Auth” done',
        }),
      ];

      const keys = deriveLatestWins([], events)
        .map((win) => win.key)
        .sort();

      assert.deepEqual(keys, [
        'activity:status',
        'activity:status-label',
        'activity:step',
      ].sort());
    });

    it('excludes status messages that only end in done', () => {
      const events = [
        makeEvent({ id: 'done', type: 'status_changed', message: '“Alpha” → done' }),
        makeEvent({
          id: 'not-done',
          type: 'status_changed',
          message: '“Alpha” → not done',
        }),
        makeEvent({ id: 'undone', type: 'status_changed', message: '“Alpha” → undone' }),
      ];

      assert.deepEqual(
        deriveLatestWins([], events).map((win) => win.key),
        ['activity:done'],
      );
    });

    it('excludes activity wins with malformed, impossible or noncanonical timestamps', () => {
      const events = [
        makeEvent({
          id: 'canonical',
          type: 'status_changed',
          message: '“Alpha” → done',
          at: '2026-09-20T10:00:00.000Z',
        }),
        makeEvent({
          id: 'offset',
          type: 'status_changed',
          message: '“Alpha” → done',
          at: '2026-09-20T10:00:00+02:00',
        }),
        makeEvent({
          id: 'impossible',
          type: 'status_changed',
          message: '“Alpha” → done',
          at: '2026-02-30T10:00:00.000Z',
        }),
        makeEvent({
          id: 'date-only',
          type: 'status_changed',
          message: '“Alpha” → done',
          at: '2026-09-20',
        }),
        makeEvent({
          id: 'malformed',
          type: 'status_changed',
          message: '“Alpha” → done',
          at: 'not-a-date',
        }),
      ];

      assert.deepEqual(
        deriveLatestWins([], events).map((win) => win.key),
        ['activity:canonical'],
      );
    });

    it('includes the real mark-all-steps-done activity', () => {
      const events = [
        makeEvent({
          id: 'all-done',
          type: 'step_toggled',
          message: 'Marked all steps done on “Alpha”',
        }),
        makeEvent({
          id: 'cleared',
          type: 'step_toggled',
          message: 'Cleared all step completion on “Alpha”',
        }),
      ];

      assert.deepEqual(
        deriveLatestWins([], events).map((win) => win.key),
        ['activity:all-done'],
      );
    });

    it('accepts a four-digit milestone year below one hundred', () => {
      const project = makeProject({
        id: 'p1',
        notes_md: 'Milestone 0099-09-21: Ancient ship',
      });

      const wins = deriveLatestWins([project], []);

      assert.equal(wins.length, 1);
      assert.equal(wins[0].at, '0099-09-21T00:00:00.000Z');
      assert.equal(wins[0].text, 'Ancient ship');
    });

    it('orders newest first, caps at five and does not mutate inputs', () => {
      const projects = [
        makeProject({
          id: 'p1',
          notes_md: 'Milestone 2026-09-20: A\nMilestone 2026-09-22: B',
        }),
      ];
      const activity = [
        makeEvent({
          id: 'e1',
          type: 'step_toggled',
          message: 'Completed step “X”',
          at: '2026-09-21T00:00:00.000Z',
        }),
        makeEvent({
          id: 'e2',
          type: 'status_changed',
          message: '“P” → done',
          at: '2026-09-25T00:00:00.000Z',
        }),
        makeEvent({
          id: 'e3',
          type: 'step_toggled',
          message: 'Completed step “Y”',
          at: '2026-09-24T00:00:00.000Z',
        }),
        makeEvent({
          id: 'e4',
          type: 'step_toggled',
          message: 'Completed step “Z”',
          at: '2026-09-23T00:00:00.000Z',
        }),
      ];
      const originalProjects = structuredClone(projects);
      const originalActivity = structuredClone(activity);

      const wins = deriveLatestWins(projects, activity);

      assert.equal(wins.length, 5);
      assert.deepEqual(
        wins.map((win) => win.text),
        ['“P” → done', 'Completed step “Y”', 'Completed step “Z”', 'B', 'Completed step “X”'],
      );
      assert.deepEqual(projects, originalProjects);
      assert.deepEqual(activity, originalActivity);
    });

    it('breaks equal timestamps by ascending key', () => {
      const project = makeProject({
        id: 'p1',
        notes_md: 'Milestone 2026-09-21: Zebra\nMilestone 2026-09-21: Apple',
      });

      assert.deepEqual(
        deriveLatestWins([project], []).map((win) => win.text),
        ['Apple', 'Zebra'],
      );
    });

    it('returns an empty list when no wins are recorded', () => {
      assert.deepEqual(deriveLatestWins([], []), []);
    });
  });
});
