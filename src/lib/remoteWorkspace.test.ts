import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS } from '../types';

import {
  loadRemoteWorkspace,
  queueRemoteWorkspaceSave,
  type RemoteWorkspace,
} from './remoteWorkspace';

const workspace: RemoteWorkspace = {
  version: 1,
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  focus: { active: null, history: [] },
  activity: [],
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

describe('remote workspace API bridge', () => {
  it('maps an empty response to null and parses a workspace response', async () => {
    const empty = await loadRemoteWorkspace(async () => response(204));
    assert.equal(empty, null);

    const loaded = await loadRemoteWorkspace(async () => response(200, workspace));
    assert.deepEqual(loaded, workspace);
  });

  it('rejects non-OK responses without changing caller state', async () => {
    await assert.rejects(
      () => loadRemoteWorkspace(async () => response(503)),
      /workspace request failed: 503/,
    );
  });

  it('serializes remote workspace saves in call order', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(init?.body));
      if (calls.length === 1) await firstFinished;
      return response(204);
    };

    const first = queueRemoteWorkspaceSave(workspace, fetcher);
    const second = queueRemoteWorkspaceSave({
      ...workspace,
      activity: [{ id: 'a1', at: '2026-01-01T00:00:00.000Z', type: 'project_created', message: 'created' }],
    }, fetcher);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    releaseFirst();
    await Promise.all([first, second]);
    assert.equal(calls.length, 2);
    assert.match(calls[0] ?? '', /"activity":\[\]/);
    assert.match(calls[1] ?? '', /"id":"a1"/);
  });

  it('continues the save queue after a failed request', async () => {
    let attempts = 0;
    const fetcher = async () => {
      attempts += 1;
      return response(attempts === 1 ? 500 : 204);
    };

    await assert.rejects(queueRemoteWorkspaceSave(workspace, fetcher), /workspace request failed: 500/);
    await queueRemoteWorkspaceSave(workspace, fetcher);
    assert.equal(attempts, 2);
  });
});
