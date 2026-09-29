import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Project } from '../types';
import { updateBlockerNote } from './blocker';

function makeProject(notes_md = ''): Project {
  return {
    id: 'p1',
    title: 'Alpha',
    slug: 'alpha',
    type: 'tool',
    status: 'in_progress',
    summary: '',
    progress_pct: 0,
    steps: [],
    notes_md,
    links: [],
    tags: [],
    deadline: null,
    stack: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-09-21T00:00:00.000Z',
    started_at: null,
    starred: false,
  };
}

describe('blocker note policy', () => {
  it('trims valid text and appends it without mutating project', () => {
    const project = makeProject('Prior note \n\n\t');
    const original = structuredClone(project);

    assert.deepEqual(updateBlockerNote(project, '  Waiting for API  '), {
      kind: 'changed',
      notes: 'Prior note \n\n\t\nBlocker: Waiting for API',
    });
    assert.deepEqual(project, original);
  });

  it('accepts blocker text at exactly 2000 trimmed characters', () => {
    const text = ` ${'x'.repeat(2000)} `;

    const result = updateBlockerNote(makeProject(), text);

    assert.equal(result.kind, 'changed');
    if (result.kind === 'changed') {
      assert.equal(result.notes, `Blocker: ${'x'.repeat(2000)}`);
    }
  });

  it('rejects blank, multiline, oversized, and reserved blocker text', () => {
    const invalid = [
      { text: ' \t ', reason: 'required' },
      { text: 'Blocker\nnext', reason: 'line-break' },
      { text: 'Blocker\rnext', reason: 'line-break' },
      { text: 'Blocker\n', reason: 'line-break' },
      { text: 'Blocker\u2028next', reason: 'line-break' },
      { text: 'Blocker\u2029next', reason: 'line-break' },
      { text: 'none', reason: 'reserved' },
      { text: ' NONE. ', reason: 'reserved' },
      { text: 'x'.repeat(2001), reason: 'too-long' },
    ] as const;

    for (const { text, reason } of invalid) {
      assert.deepEqual(updateBlockerNote(makeProject('Prior note'), text), {
        kind: 'error',
        reason,
      });
    }
  });

  it('allows notes result at 200000 characters and rejects overflow', () => {
    const suffix = '\nBlocker: x';
    const atLimit = makeProject('x'.repeat(200_000 - suffix.length));

    const result = updateBlockerNote(atLimit, 'x');

    assert.equal(result.kind, 'changed');
    if (result.kind === 'changed') assert.equal(result.notes.length, 200_000);

    const overflow = makeProject('x'.repeat(200_000 - suffix.length + 1));
    const originalNotes = overflow.notes_md;
    assert.deepEqual(updateBlockerNote(overflow, 'x'), {
      kind: 'error',
      reason: 'notes-too-long',
    });
    assert.equal(overflow.notes_md, originalNotes);
  });

  it('preserves note history when clearing and never revives an older blocker', () => {
    const project = makeProject('Blocker: old\nPrior note');

    assert.deepEqual(updateBlockerNote(project, null), {
      kind: 'changed',
      notes: 'Blocker: old\nPrior note\nBlocker: none',
    });
    const cleared = makeProject('Blocker: old\nPrior note\nBlocker: none');
    assert.deepEqual(updateBlockerNote(cleared, null), {
      kind: 'noop',
      notes: cleared.notes_md,
    });
    assert.deepEqual(updateBlockerNote(cleared, 'new blocker'), {
      kind: 'changed',
      notes: 'Blocker: old\nPrior note\nBlocker: none\nBlocker: new blocker',
    });
  });

  it('returns no-op for unchanged saves and clear with no current blocker', () => {
    const project = makeProject('Prior note\nBlocker: Waiting');

    assert.deepEqual(updateBlockerNote(project, ' Waiting '), {
      kind: 'noop',
      notes: project.notes_md,
    });
    assert.deepEqual(updateBlockerNote(makeProject('Prior note'), null), {
      kind: 'noop',
      notes: 'Prior note',
    });
  });
});
