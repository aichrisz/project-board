import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canRenderWorkspace } from './workspaceReadiness';

describe('workspace readiness gate', () => {
  it('blocks routes and mutations until authoritative hydration finishes', () => {
    assert.equal(canRenderWorkspace(false), false);
    assert.equal(canRenderWorkspace(true), true);
  });
});