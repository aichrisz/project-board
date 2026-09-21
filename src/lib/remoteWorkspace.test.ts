import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS } from '../types';

import {
  CREATION_ETAG,
  hydrateRemoteWorkspace,
  loadRemoteWorkspace,
  queueRemoteWorkspaceSave,
  type RemoteWorkspace,
  type WorkspaceSyncState,
} from './remoteWorkspace';

const workspace: RemoteWorkspace = {
  version: 1,
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  focus: { active: null, history: [] },
  activity: [],
};

function response(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
  });
}

describe('remote workspace API bridge', () => {
  it('does not resolve a mutable snapshot before remote hydration completes', async () => {
    let release!: (value: { workspace: RemoteWorkspace; revision: string }) => void;
    const pending = new Promise<{ workspace: RemoteWorkspace; revision: string }>((resolve) => {
      release = resolve;
    });
    let settled = false;
    const hydration = hydrateRemoteWorkspace(workspace, () => pending);
    void hydration.then(() => {
      settled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    const remote = { ...workspace, projects: [{ ...workspace.projects[0], id: 'remote' }] };
    release({ workspace: remote, revision: '"remote-v1"' });
    assert.deepEqual((await hydration).workspace, remote);
  });

  it('keeps the local workspace when remote hydration fails', async () => {
    const result = await hydrateRemoteWorkspace(workspace, async () => {
      throw new Error('offline');
    });
    assert.deepEqual(result, {
      workspace,
      status: 'failed',
      shouldSave: false,
      revision: CREATION_ETAG,
      reloadRequired: true,
    });
  });

  it('maps an empty response to the creation revision and parses a workspace response', async () => {
    const empty = await loadRemoteWorkspace(async () => response(204, undefined, { etag: CREATION_ETAG }));
    assert.deepEqual(empty, { workspace: null, revision: CREATION_ETAG });

    const loaded = await loadRemoteWorkspace(async () =>
      response(200, workspace, { etag: '"workspace-v1"' }),
    );
    assert.deepEqual(loaded, { workspace, revision: '"workspace-v1"' });
  });

  it('rejects non-OK responses without changing caller state', async () => {
    await assert.rejects(
      () => loadRemoteWorkspace(async () => response(503)),
      /workspace request failed: 503/,
    );
  });

  it('serializes remote workspace saves and advances the captured revision', async () => {
    const calls: Array<{ body: string; etag: string | null }> = [];
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false };
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        body: String(init?.body),
        etag: new Headers(init?.headers).get('if-match'),
      });
      if (calls.length === 1) await firstFinished;
      return response(204, undefined, { etag: `"v${calls.length + 1}"` });
    };

    const first = queueRemoteWorkspaceSave(workspace, sync, fetcher);
    const second = queueRemoteWorkspaceSave({
      ...workspace,
      activity: [{ id: 'a1', at: '2026-01-01T00:00:00.000Z', type: 'project_created', message: 'created' }],
    }, sync, fetcher);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    releaseFirst();
    await Promise.all([first, second]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.etag, '"v1"');
    assert.equal(calls[1]?.etag, '"v2"');
    assert.equal(sync.etag, '"v3"');
    assert.match(calls[0]?.body ?? '', /"activity":\[\]/);
    assert.match(calls[1]?.body ?? '', /"id":"a1"/);
  });

  it('continues the save queue after a failed request', async () => {
    let attempts = 0;
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false };
    const fetcher = async () => {
      attempts += 1;
      return response(attempts === 1 ? 500 : 204, undefined, { etag: '"v2"' });
    };

    await assert.rejects(queueRemoteWorkspaceSave(workspace, sync, fetcher), /workspace request failed: 500/);
    await queueRemoteWorkspaceSave(workspace, sync, fetcher);
    assert.equal(attempts, 2);
    assert.equal(sync.etag, '"v2"');
  });

  it('does not report a missing-ETag save as the successful baseline and retries later', async () => {
    let attempts = 0;
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false };
    const nextWorkspace: RemoteWorkspace = {
      ...workspace,
      activity: [{ id: 'a1', at: '2026-01-01T00:00:00.000Z', type: 'project_created', message: 'created' }],
    };
    const fetcher = async () => {
      attempts += 1;
      return attempts === 1
        ? response(204)
        : response(204, undefined, { etag: '"v2"' });
    };

    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, fetcher),
      /workspace response missing ETag/,
    );
    assert.equal(sync.etag, '"v1"');
    assert.deepEqual(
      await queueRemoteWorkspaceSave(nextWorkspace, sync, fetcher),
      nextWorkspace,
    );
    assert.equal(sync.etag, '"v2"');
  });

  it('stops automatic saves after a conflict without retrying an overwrite', async () => {
    let attempts = 0;
    const sync: WorkspaceSyncState = { etag: '"stale"', blocked: false };
    const fetcher = async () => {
      attempts += 1;
      return response(412);
    };

    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, fetcher),
      { name: 'WorkspaceConflictError' },
    );
    assert.equal(sync.blocked, true);
    await assert.rejects(
      queueRemoteWorkspaceSave({ ...workspace, version: 1 }, sync, fetcher),
      { name: 'WorkspaceConflictError' },
    );
    assert.equal(attempts, 1);
    assert.equal(sync.etag, '"stale"');
  });
});
