import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendMilestone } from './blocker';
import { editNextAction } from './projectSignals';
import { getRemoteSaveStatus } from './saveStatus';
import type { Project, Step } from '../types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: 'Project',
    slug: 'project',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 37,
    steps: [
      { id: 'next', title: 'Draft outline', done: false, order: 2 },
      { id: 'later', title: 'Review', done: false, order: 3 },
      { id: 'done', title: 'Research', done: true, order: 1 },
    ],
    notes_md: 'Original notes\n',
    links: [{ id: 'link-1', label: 'Docs', url: 'https://example.test' }],
    tags: ['tag'],
    deadline: null,
    stack: ['React'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    started_at: null,
    starred: false,
    ...overrides,
  };
}

describe('remote save status', () => {
  it('does not call newer local work Saved while older snapshot acknowledgment arrives', () => {
    const input = {
      loading: false,
      failed: false,
      conflict: false,
      saveError: false,
      latestKey: 'snapshot-b',
      acknowledgedKey: 'snapshot-a',
      hasPendingWork: false,
    };

    assert.equal(getRemoteSaveStatus(input), 'saving');
    assert.equal(
      getRemoteSaveStatus({ ...input, acknowledgedKey: 'snapshot-b' }),
      'saved',
    );
  });

  it('prioritizes loading, conflict, and failures over saved acknowledgment', () => {
    const acknowledged = {
      loading: false,
      failed: false,
      conflict: false,
      saveError: false,
      latestKey: 'same',
      acknowledgedKey: 'same',
      hasPendingWork: false,
    };

    assert.equal(getRemoteSaveStatus({ ...acknowledged, loading: true }), 'loading');
    assert.equal(getRemoteSaveStatus({ ...acknowledged, conflict: true }), 'conflict');
    assert.equal(getRemoteSaveStatus({ ...acknowledged, failed: true }), 'unavailable');
    assert.equal(getRemoteSaveStatus({ ...acknowledged, saveError: true }), 'failed');
    assert.equal(getRemoteSaveStatus({ ...acknowledged, hasPendingWork: true }), 'saving');
  });
});

describe('next action editor guard', () => {
  it('rejects captured action when removed, completed, renamed, or no longer first', () => {
    const project = makeProject();
    const staleProjects = [
      { ...project, steps: project.steps.filter((step) => step.id !== 'next') },
      { ...project, steps: project.steps.map((step) => step.id === 'next' ? { ...step, done: true } : step) },
      { ...project, steps: project.steps.map((step) => step.id === 'next' ? { ...step, title: 'Changed elsewhere' } : step) },
      { ...project, steps: project.steps.map((step) => step.id === 'later' ? { ...step, order: 0 } : step) },
    ];

    for (const stale of staleProjects) {
      assert.deepEqual(
        editNextAction(stale, 'next', 'Draft outline', 'New title', '2026-10-03T00:00:00.000Z', 2),
        { kind: 'stale' },
      );
    }
    const duplicateId = {
      ...project,
      steps: [...project.steps, { id: 'next', title: 'Duplicate', done: false, order: 4 }],
    };
    assert.deepEqual(
      editNextAction(duplicateId, 'next', 'Draft outline', 'New title', '2026-10-03T00:00:00.000Z', 2),
      { kind: 'stale' },
    );

    const reorderedTarget = {
      ...project,
      steps: project.steps.map((step) => step.id === 'next' ? { ...step, order: 1 } : step),
    };
    assert.deepEqual(
      editNextAction(
        reorderedTarget,
        'next',
        'Draft outline',
        'New title',
        '2026-10-03T00:00:00.000Z',
        2,
      ),
      { kind: 'stale' },
    );
  });

  it('keeps unchanged saves as no-ops and validates one-line titles up to 400 characters', () => {
    const project = makeProject();

    assert.deepEqual(
      editNextAction(project, 'next', 'Draft outline', ' Draft outline ', '2026-10-03T00:00:00.000Z', 2),
      { kind: 'noop' },
    );
    assert.deepEqual(editNextAction(project, 'next', 'Draft outline', '   ', '', 2), {
      kind: 'error',
      reason: 'required',
    });
    for (const text of ['x\ny', 'x\ry', 'x\u2028y', 'x\u2029y']) {
      assert.deepEqual(editNextAction(project, 'next', 'Draft outline', text, '', 2), {
        kind: 'error',
        reason: 'line-break',
      });
    }
    assert.deepEqual(editNextAction(project, 'next', 'Draft outline', 'x'.repeat(401), '', 2), {
      kind: 'error',
      reason: 'too-long',
    });
    const maxTitle = editNextAction(project, 'next', 'Draft outline', 'x'.repeat(400), '', 2);
    assert.equal(maxTitle.kind, 'changed');
    if (maxTitle.kind === 'changed') assert.equal(maxTitle.project.steps[0].title.length, 400);
  });

  it('changes only title and update timestamp while preserving step metadata and project state', () => {
    const project = makeProject();
    const updated = editNextAction(
      project,
      'next',
      'Draft outline',
      ' Write draft ',
      '2026-10-03T00:00:00.000Z',
      2,
    );

    assert.equal(updated.kind, 'changed');
    if (updated.kind !== 'changed') return;
    const expectedSteps: Step[] = project.steps.map((step) =>
      step.id === 'next' ? { ...step, title: 'Write draft' } : step,
    );
    assert.deepEqual(updated.project.steps, expectedSteps);
    assert.equal(updated.project.progress_pct, project.progress_pct);
    assert.equal(updated.project.notes_md, project.notes_md);
    assert.deepEqual(updated.project.links, project.links);
    assert.equal(updated.project.status, project.status);
    assert.equal(updated.project.updated_at, '2026-10-03T00:00:00.000Z');
  });
});

describe('quick milestone append', () => {
  it('appends one UTC-dated entry without changing existing notes', () => {
    const project = makeProject({ notes_md: 'Existing notes\n\n' });
    const result = appendMilestone(
      project,
      '  Release review  ',
      new Date('2026-10-03T00:30:00.000Z'),
    );

    assert.deepEqual(result, {
      kind: 'changed',
      notes: 'Existing notes\nMilestone 2026-10-03: Release review',
      updatedAt: '2026-10-03T00:30:00.000Z',
    });
    const maxMilestone = appendMilestone(project, 'x'.repeat(2000), new Date('2026-10-03T00:30:00.000Z'));
    assert.equal(maxMilestone.kind, 'changed');
    if (maxMilestone.kind === 'changed') assert.match(maxMilestone.notes, /x{2000}$/);
  });

  it('rejects blank, oversized, multiline Unicode, and notes-cap entries', () => {
    const project = makeProject();
    for (const text of ['', '   ']) {
      assert.deepEqual(appendMilestone(project, text), {
        kind: 'error',
        reason: 'required',
      });
    }
    assert.deepEqual(appendMilestone(project, 'x'.repeat(2001)), {
      kind: 'error',
      reason: 'too-long',
    });
    for (const text of ['one\ntwo', 'one\rtwo', 'one\u2028two', 'one\u2029two']) {
      assert.deepEqual(appendMilestone(project, text), {
        kind: 'error',
        reason: 'line-break',
      });
    }
    assert.deepEqual(appendMilestone({ ...project, notes_md: 'x'.repeat(200_000) }, 'new'), {
      kind: 'error',
      reason: 'notes-too-long',
    });
  });
});
