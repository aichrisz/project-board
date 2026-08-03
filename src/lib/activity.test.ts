import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivityEvent } from '../types';

import { prependActivityEvents } from './activity';

function event(id: string): ActivityEvent {
  return {
    id,
    at: '2026-08-03T09:00:00.000Z',
    type: 'focus_session',
    message: id,
  };
}

describe('activity event batching', () => {
  it('prepends a batch in event order while keeping newest-first storage order', () => {
    const existing = [event('old')];
    const next = prependActivityEvents(existing, [event('step'), event('focus')]);

    assert.deepEqual(next.map((item) => item.id), ['focus', 'step', 'old']);
    assert.deepEqual(existing.map((item) => item.id), ['old']);
  });
});
