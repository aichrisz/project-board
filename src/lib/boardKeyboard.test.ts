import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isBoardKeyboardKey,
  resolveBoardKeyboardAction,
} from './boardKeyboard';
import { ACTIVE_STATUSES } from '../types';

const COLUMN = ['p1', 'p2', 'p3'] as const;

function resolve(
  key: string,
  overrides: {
    projectId?: string;
    status?: (typeof ACTIVE_STATUSES)[number];
  } = {},
) {
  return resolveBoardKeyboardAction({
    key,
    projectId: overrides.projectId ?? 'p1',
    status: overrides.status ?? 'idea',
    statuses: ACTIVE_STATUSES,
    columnProjectIds: COLUMN,
  });
}

describe('resolveBoardKeyboardAction horizontal status movement', () => {
  it('moves right to the next status with an exact announcement', () => {
    assert.deepEqual(resolve('ArrowRight'), {
      kind: 'move-status',
      status: 'planned',
      message: 'Moved to Planned',
    });
  });

  it('treats l as ArrowRight', () => {
    assert.deepEqual(resolve('l'), {
      kind: 'move-status',
      status: 'planned',
      message: 'Moved to Planned',
    });
    assert.deepEqual(resolve('L'), {
      kind: 'move-status',
      status: 'planned',
      message: 'Moved to Planned',
    });
  });

  it('treats h as ArrowLeft', () => {
    assert.deepEqual(resolve('h', { status: 'planned' }), {
      kind: 'move-status',
      status: 'idea',
      message: 'Moved to Idea',
    });
    assert.deepEqual(resolve('ArrowLeft', { status: 'in_progress' }), {
      kind: 'move-status',
      status: 'planned',
      message: 'Moved to Planned',
    });
  });

  it('uses the multi-word status label verbatim', () => {
    assert.deepEqual(resolve('ArrowRight', { status: 'planned' }), {
      kind: 'move-status',
      status: 'in_progress',
      message: 'Moved to In progress',
    });
  });

  it('returns none at the left boundary', () => {
    assert.deepEqual(resolve('h', { status: 'idea' }), { kind: 'none' });
    assert.deepEqual(resolve('ArrowLeft', { status: 'idea' }), {
      kind: 'none',
    });
  });

  it('returns none at the right boundary', () => {
    assert.deepEqual(resolve('l', { status: 'paused' }), { kind: 'none' });
    assert.deepEqual(resolve('ArrowRight', { status: 'paused' }), {
      kind: 'none',
    });
  });

  it('returns none when the status is not a visible column', () => {
    assert.deepEqual(
      resolveBoardKeyboardAction({
        key: 'ArrowRight',
        projectId: 'p1',
        status: 'archived',
        statuses: ACTIVE_STATUSES,
        columnProjectIds: COLUMN,
      }),
      { kind: 'none' },
    );
  });
});

describe('resolveBoardKeyboardAction vertical focus movement', () => {
  it('moves focus down with j', () => {
    assert.deepEqual(resolve('j', { projectId: 'p1' }), {
      kind: 'move-focus',
      projectId: 'p2',
    });
    assert.deepEqual(resolve('J', { projectId: 'p2' }), {
      kind: 'move-focus',
      projectId: 'p3',
    });
  });

  it('moves focus down with ArrowDown', () => {
    assert.deepEqual(resolve('ArrowDown', { projectId: 'p2' }), {
      kind: 'move-focus',
      projectId: 'p3',
    });
  });

  it('moves focus up with k and ArrowUp', () => {
    assert.deepEqual(resolve('k', { projectId: 'p2' }), {
      kind: 'move-focus',
      projectId: 'p1',
    });
    assert.deepEqual(resolve('K', { projectId: 'p3' }), {
      kind: 'move-focus',
      projectId: 'p2',
    });
    assert.deepEqual(resolve('ArrowUp', { projectId: 'p3' }), {
      kind: 'move-focus',
      projectId: 'p2',
    });
  });

  it('returns none at the first card', () => {
    assert.deepEqual(resolve('k', { projectId: 'p1' }), { kind: 'none' });
    assert.deepEqual(resolve('ArrowUp', { projectId: 'p1' }), {
      kind: 'none',
    });
  });

  it('returns none at the last card', () => {
    assert.deepEqual(resolve('j', { projectId: 'p3' }), { kind: 'none' });
    assert.deepEqual(resolve('ArrowDown', { projectId: 'p3' }), {
      kind: 'none',
    });
  });

  it('returns none when the card is absent from the column', () => {
    assert.deepEqual(resolve('j', { projectId: 'missing' }), { kind: 'none' });
  });

  it('returns none for a single-card column', () => {
    const single = {
      key: 'j',
      projectId: 'only',
      status: 'idea' as const,
      statuses: ACTIVE_STATUSES,
      columnProjectIds: ['only'],
    };
    assert.deepEqual(resolveBoardKeyboardAction(single), { kind: 'none' });
    assert.deepEqual(resolveBoardKeyboardAction({ ...single, key: 'k' }), {
      kind: 'none',
    });
  });
});

describe('resolveBoardKeyboardAction detail activation', () => {
  it('opens detail on Enter', () => {
    assert.deepEqual(resolve('Enter'), {
      kind: 'open-detail',
      projectId: 'p1',
    });
  });

  it('opens detail on Space', () => {
    assert.deepEqual(resolve(' '), {
      kind: 'open-detail',
      projectId: 'p1',
    });
  });

  it('opens detail for the focused card, not the first card', () => {
    assert.deepEqual(resolve('Enter', { projectId: 'p3' }), {
      kind: 'open-detail',
      projectId: 'p3',
    });
  });
});

describe('resolveBoardKeyboardAction unsupported keys', () => {
  it('returns none for an unrelated printable key', () => {
    assert.deepEqual(resolve('x'), { kind: 'none' });
  });

  it('returns none for other unsupported keys', () => {
    for (const key of ['Tab', 'Escape', 'Backspace', 'a', '?', 'Spacebar']) {
      assert.deepEqual(resolve(key), { kind: 'none' }, `key: ${key}`);
    }
  });
});

describe('isBoardKeyboardKey', () => {
  it('accepts the arrow keys', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      assert.equal(isBoardKeyboardKey(key), true, `key: ${key}`);
    }
  });

  it('accepts the vim keys in both cases', () => {
    for (const key of ['h', 'H', 'j', 'J', 'k', 'K', 'l', 'L']) {
      assert.equal(isBoardKeyboardKey(key), true, `key: ${key}`);
    }
  });

  it('accepts the activation keys', () => {
    assert.equal(isBoardKeyboardKey('Enter'), true);
    assert.equal(isBoardKeyboardKey(' '), true);
  });

  it('rejects unsupported keys', () => {
    for (const key of ['x', 'Tab', 'Escape', 'Spacebar']) {
      assert.equal(isBoardKeyboardKey(key), false, `key: ${key}`);
    }
  });
});
