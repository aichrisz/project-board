import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Project, Step } from '../types';
import {
  getActiveProjectAdvisory,
  getFreshness,
  getNextAction,
} from './projectSignals';

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
    updated_at: '2026-09-21T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12);
}

const now = localDate(2026, 9, 21);

function steps(...items: Array<Partial<Step> & Pick<Step, 'id' | 'title'>>): Step[] {
  return items.map((item, index) => ({
    done: false,
    order: index,
    ...item,
  }));
}

describe('getNextAction', () => {
  it('returns the first unfinished step by order without changing the source array', () => {
    const source = steps(
      { id: 'later', title: 'Later', order: 20 },
      { id: 'done', title: 'Done', done: true, order: 0 },
      { id: 'next', title: 'Next', order: 10 },
    );
    const project = makeProject({ steps: source });

    assert.deepEqual(getNextAction(project), source[2]);
    assert.deepEqual(project.steps, source);
  });

  it('returns no action when every step is finished', () => {
    const project = makeProject({
      steps: steps({ id: 'done', title: 'Done', done: true }),
    });

    assert.equal(getNextAction(project), null);
  });
});

describe('getFreshness', () => {
  it('does not label projects updated less than 30 calendar days ago', () => {
    const project = makeProject({ updated_at: localDate(2026, 8, 23).toISOString() });

    assert.equal(getFreshness(project, now), null);
  });

  it('labels projects updated 30 through 59 calendar days ago as Quiet', () => {
    assert.equal(
      getFreshness(
        makeProject({ updated_at: localDate(2026, 8, 22).toISOString() }),
        now,
      ),
      'Quiet',
    );
    assert.equal(
      getFreshness(
        makeProject({ updated_at: localDate(2026, 7, 24).toISOString() }),
        now,
      ),
      'Quiet',
    );
  });

  it('labels projects updated at least 60 calendar days ago as Review', () => {
    const project = makeProject({ updated_at: localDate(2026, 7, 23).toISOString() });

    assert.equal(getFreshness(project, now), 'Review');
  });

  it('does not prompt for done or archived projects', () => {
    assert.equal(
      getFreshness(
        makeProject({ status: 'done', updated_at: '2026-01-01T00:00:00.000Z' }),
        now,
      ),
      null,
    );
    assert.equal(
      getFreshness(
        makeProject({ status: 'archived', updated_at: '2026-01-01T00:00:00.000Z' }),
        now,
      ),
      null,
    );
  });
});

describe('getActiveProjectAdvisory', () => {
  it('uses neutral copy at zero active projects', () => {
    assert.deepEqual(getActiveProjectAdvisory([]), {
      count: 0,
      idealMaximum: 3,
      tone: 'neutral',
      message: '0 projects in progress (ideal maximum: 3).',
    });
  });

  it('uses neutral copy at the ideal maximum', () => {
    const projects = Array.from({ length: 3 }, (_, index) =>
      makeProject({ id: `p${index}` }),
    );

    assert.deepEqual(getActiveProjectAdvisory(projects), {
      count: 3,
      idealMaximum: 3,
      tone: 'neutral',
      message: '3 projects in progress (ideal maximum: 3).',
    });
  });

  it('uses supportive copy above the ideal maximum without blocking action', () => {
    const projects = Array.from({ length: 4 }, (_, index) =>
      makeProject({ id: `p${index}` }),
    );

    assert.deepEqual(getActiveProjectAdvisory(projects), {
      count: 4,
      idealMaximum: 3,
      tone: 'supportive',
      message:
        '4 projects in progress. Consider continuing, pausing, or finishing one project.',
    });
  });
});
