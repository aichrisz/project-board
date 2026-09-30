import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS } from '../types';
import { SEED_PROJECTS } from '../data/seed';

import {
  CREATION_ETAG,
  hydrateRemoteWorkspace,
  isHydratedWorkspaceCurrent,
  loadRemoteWorkspace,
  pendingWorkspaceKey,
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
const OWNER_A = 'A'.repeat(43);
const OWNER_B = 'B'.repeat(43);

function response(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-workspace-owner-scope': OWNER_A,
      ...headers,
    },
  });
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('remote workspace API bridge', () => {
  it('does not resolve a mutable snapshot before remote hydration completes', async () => {
    let release!: (value: { workspace: RemoteWorkspace; revision: string; ownerScopeToken: string }) => void;
    const pending = new Promise<{ workspace: RemoteWorkspace; revision: string; ownerScopeToken: string }>((resolve) => {
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
    release({ workspace: remote, revision: '"remote-v1"', ownerScopeToken: OWNER_A });
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
    assert.deepEqual(empty, { workspace: null, revision: CREATION_ETAG, ownerScopeToken: OWNER_A });

    let cacheMode: RequestCache | undefined;
    const loaded = await loadRemoteWorkspace(async (_input, init) => {
      cacheMode = init?.cache;
      return response(200, workspace, { etag: '"workspace-v1"' });
    });
    assert.deepEqual(loaded, { workspace, revision: '"workspace-v1"', ownerScopeToken: OWNER_A });
    assert.equal(cacheMode, 'no-store');
  });

  it('rejects non-OK responses without changing caller state', async () => {
    await assert.rejects(
      () => loadRemoteWorkspace(async () => response(503)),
      /workspace request failed: 503/,
    );
  });

  it('validates remote JSON before hydration can replace local state', async () => {
    await assert.rejects(
      () => loadRemoteWorkspace(async () => response(200, { version: 1, projects: [] }, { etag: '"v1"' })),
      /invalid workspace response/,
    );
    await assert.rejects(
      () => loadRemoteWorkspace(async () => new Response('<html>sign-in</html>', {
        status: 200,
        headers: { etag: '"v1"', 'content-type': 'text/html', 'x-workspace-owner-scope': OWNER_A },
      })),
      /invalid workspace response/,
    );
  });

  it('hydrates valid v1 workspaces without optional focus using default focus', async () => {
    const { focus: _focus, ...withoutFocus } = workspace;
    const loaded = await loadRemoteWorkspace(async () => response(200, withoutFocus, { etag: '"v1"' }));
    assert.deepEqual(loaded.workspace?.focus, { active: null, history: [] });
    await assert.rejects(
      loadRemoteWorkspace(async () => response(200, { ...withoutFocus, settings: undefined }, { etag: '"v1"' })),
      /invalid workspace response/,
    );
    await assert.rejects(
      loadRemoteWorkspace(async () => response(200, { ...withoutFocus, activity: [{}] }, { etag: '"v1"' })),
      /invalid workspace response/,
    );
  });

  it('recovers an aborted write only when remote revision still matches its base', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(503), storage),
      /workspace request failed: 503/,
    );
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));

    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace: null,
      revision: '"base"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(hydrated.status, 'ready');
    assert.equal(hydrated.shouldSave, true);
    assert.deepEqual(hydrated.workspace, workspace);
  });

  it('preserves same-owner cache and journal changes during a delayed GET', async () => {
    const baseWorkspace: RemoteWorkspace = {
      ...workspace,
      projects: [{ ...SEED_PROJECTS[0]!, starred: false }],
    };
    const starredWorkspace: RemoteWorkspace = {
      ...baseWorkspace,
      projects: [{ ...baseWorkspace.projects[0]!, starred: true }],
    };

    for (const revision of ['"base"', '"advanced"']) {
      const storage = memoryStorage();
      storage.setItem('project-board-v1-owner-scope', OWNER_A);
      storage.setItem('project-board-v1', JSON.stringify(baseWorkspace));
      let releaseGet!: (value: { workspace: RemoteWorkspace | null; revision: string; ownerScopeToken: string }) => void;
      const pendingGet = new Promise<{ workspace: RemoteWorkspace | null; revision: string; ownerScopeToken: string }>((resolve) => {
        releaseGet = resolve;
      });
      const hydration = hydrateRemoteWorkspace(
        () => ({ ...JSON.parse(storage.getItem('project-board-v1')!), activity: [] }),
        () => pendingGet,
        storage,
      );

      const sync: WorkspaceSyncState = { etag: '"base"', blocked: false, ownerScopeToken: OWNER_A };
      await assert.rejects(
        queueRemoteWorkspaceSave(starredWorkspace, sync, async () => response(503), storage),
        /workspace request failed: 503/,
      );
      storage.setItem('project-board-v1', JSON.stringify(starredWorkspace));
      releaseGet({ workspace: null, revision, ownerScopeToken: OWNER_A });

      const hydrated = await hydration;
      assert.equal(hydrated.workspace.projects[0]?.starred, true);
      assert.equal(hydrated.revision, revision);
      const savedJournal = JSON.parse(storage.getItem(pendingWorkspaceKey(OWNER_A))!);
      assert.equal(savedJournal.baseETag, '"base"');
      assert.equal(hydrated.status, 'failed');
      assert.equal(hydrated.shouldSave, false);
      assert.equal(hydrated.recoveryConflict, true);
      assert.equal(isHydratedWorkspaceCurrent(hydrated, storage), true);
    }
  });

  it('rejects an owner change during delayed GET without exposing or overwriting either cache', async () => {
    const localA = { ...workspace, projects: [{ id: 'private-a' } as RemoteWorkspace['projects'][number]] };
    const localB = { ...workspace, projects: [{ id: 'private-b' } as RemoteWorkspace['projects'][number]] };
    const storage = memoryStorage();
    storage.setItem('project-board-v1-owner-scope', OWNER_A);
    storage.setItem('project-board-v1', JSON.stringify(localA));
    let releaseGet!: (value: { workspace: RemoteWorkspace; revision: string; ownerScopeToken: string }) => void;
    const pendingGet = new Promise<{ workspace: RemoteWorkspace; revision: string; ownerScopeToken: string }>((resolve) => {
      releaseGet = resolve;
    });
    const hydration = hydrateRemoteWorkspace(localA, () => pendingGet, storage);

    storage.setItem('project-board-v1-owner-scope', OWNER_B);
    storage.setItem('project-board-v1', JSON.stringify(localB));
    releaseGet({ workspace: localA, revision: '"owner-a"', ownerScopeToken: OWNER_A });

    const hydrated = await hydration;
    assert.equal(hydrated.status, 'failed');
    assert.equal(hydrated.shouldSave, false);
    assert.deepEqual(hydrated.workspace.projects, []);
    assert.equal(storage.getItem('project-board-v1-owner-scope'), OWNER_B);
    assert.equal(storage.getItem('project-board-v1'), JSON.stringify(localB));
    assert.equal(isHydratedWorkspaceCurrent(hydrated, storage), true);
  });

  it('rejects context application when owner cache or journal changes after reconciliation', async () => {
    const storage = memoryStorage();
    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace,
      revision: '"v1"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(isHydratedWorkspaceCurrent(hydrated, storage), true);

    storage.setItem(pendingWorkspaceKey(OWNER_A), JSON.stringify({
      version: 1,
      ownerScopeToken: OWNER_A,
      baseETag: '"newer"',
      operationId: 'newer-operation-id',
    }));
    assert.equal(isHydratedWorkspaceCurrent(hydrated, storage), false);
  });

  it('recognizes an uncertain write already committed remotely', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(500), storage),
      /workspace request failed: 500/,
    );

    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace,
      revision: '"committed"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(hydrated.status, 'ready');
    assert.equal(hydrated.shouldSave, false);
    assert.equal(storage.getItem(pendingWorkspaceKey(OWNER_A)), null);
  });

  it('reconciles legacy digest journals without awaiting Web Crypto', async () => {
    const storage = memoryStorage();
    storage.setItem('project-board-v1-owner-scope', OWNER_A);
    storage.setItem(pendingWorkspaceKey(OWNER_A), JSON.stringify({
      version: 1,
      ownerScopeToken: OWNER_A,
      baseETag: '"base"',
      workspaceDigest: `sha256:${'0'.repeat(64)}`,
    }));
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    let releaseDigest!: () => void;
    let signalDigest!: () => void;
    const digestStarted = new Promise<void>((resolve) => { signalDigest = resolve; });
    let digestCalls = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest() {
            digestCalls += 1;
            signalDigest();
            return new Promise<ArrayBuffer>((resolve) => {
              releaseDigest = () => resolve(new Uint8Array(32).buffer);
            });
          },
        },
      },
    });
    try {
      const hydration = hydrateRemoteWorkspace(workspace, async () => ({
        workspace,
        revision: '"committed"',
        ownerScopeToken: OWNER_A,
      }), storage);
      const outcome = await Promise.race([
        hydration.then((result) => ({ kind: 'hydrated' as const, result })),
        digestStarted.then(() => ({ kind: 'digest' as const })),
      ]);
      if (outcome.kind === 'digest') {
        releaseDigest();
        await hydration;
      }
      assert.equal(outcome.kind, 'hydrated');
      assert.equal(digestCalls, 0);
      assert.equal(outcome.result.status, 'ready');
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      else delete (globalThis as { crypto?: Crypto }).crypto;
    }
  });

  it('preserves pending local data and blocks recovery on a changed revision', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(500), storage),
      /workspace request failed: 500/,
    );

    const remote = { ...workspace, activity: [{ id: 'external', at: '2026-01-01T00:00:00.000Z', type: 'project_created' as const, message: 'external' }] };
    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace: remote,
      revision: '"different"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(hydrated.status, 'failed');
    assert.equal(hydrated.recoveryConflict, true);
    assert.equal(hydrated.shouldSave, false);
    assert.deepEqual(hydrated.workspace, workspace);
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));
  });

  it('treats malformed journal data as a conflict without deleting it', async () => {
    const storage = memoryStorage();
    storage.setItem(pendingWorkspaceKey(OWNER_A), '{bad');
    storage.setItem('project-board-v1-owner-scope', OWNER_A);
    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace,
      revision: '"v1"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(hydrated.recoveryConflict, true);
    assert.equal(storage.getItem(pendingWorkspaceKey(OWNER_A)), '{bad');
  });

  it('preserves local state if another tab changes journal during reconciliation', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(500), storage),
      /workspace request failed: 500/,
    );
    const original = JSON.parse(storage.getItem(pendingWorkspaceKey(OWNER_A))!);
    const latestCandidate = {
      ...workspace,
      activity: [{
        id: 'latest',
        at: '2026-01-01T00:00:00.000Z',
        type: 'project_updated' as const,
        message: 'latest local data',
      }],
    };
    let candidate = workspace;
    const getItem = storage.getItem;
    let pendingReads = 0;
    storage.getItem = (key) => {
      if (key === pendingWorkspaceKey(OWNER_A) && ++pendingReads === 2) {
        storage.setItem(key, JSON.stringify({ ...original, baseETag: '"newer"' }));
        candidate = latestCandidate;
      }
      return getItem(key);
    };
    const hydrated = await hydrateRemoteWorkspace(() => candidate, async () => ({
      workspace,
      revision: '"committed"',
      ownerScopeToken: OWNER_A,
    }), storage);
    assert.equal(hydrated.status, 'failed');
    assert.equal(hydrated.recoveryConflict, true);
    assert.deepEqual(hydrated.workspace, latestCandidate);
    assert.equal(JSON.parse(storage.getItem(pendingWorkspaceKey(OWNER_A))!).baseETag, '"newer"');
  });

  it('serializes remote workspace saves and advances the captured revision', async () => {
    const calls: Array<{ body: string; etag: string | null; ownerScope: string | null }> = [];
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false, ownerScopeToken: OWNER_A };
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        body: String(init?.body),
        etag: new Headers(init?.headers).get('if-match'),
        ownerScope: new Headers(init?.headers).get('x-workspace-owner-scope'),
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
    assert.equal(calls[0]?.ownerScope, OWNER_A);
    assert.equal(calls[1]?.ownerScope, OWNER_A);
    assert.equal(sync.etag, '"v3"');
    assert.match(calls[0]?.body ?? '', /"activity":\[\]/);
    assert.match(calls[1]?.body ?? '', /"id":"a1"/);
  });

  it('continues the save queue after a failed request', async () => {
    let attempts = 0;
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false, ownerScopeToken: OWNER_A };
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
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false, ownerScopeToken: OWNER_A };
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

  it('rejects missing or mismatched owner scope on successful PUT responses', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"v1"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(204, undefined, {
        etag: '"v2"',
        'x-workspace-owner-scope': OWNER_B,
      }), storage),
      /owner scope changed/,
    );
    assert.equal(sync.etag, '"v1"');
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));

    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(204, undefined, {
        etag: '"v2"',
        'x-workspace-owner-scope': '',
      }), storage),
      /missing owner scope/,
    );
    assert.equal(sync.etag, '"v1"');
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));
  });

  it('stops automatic saves after a conflict without retrying an overwrite', async () => {
    let attempts = 0;
    const sync: WorkspaceSyncState = { etag: '"stale"', blocked: false, ownerScopeToken: OWNER_A };
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

  it('rejects identity-less workspace responses, including empty responses', async () => {
    await assert.rejects(
      loadRemoteWorkspace(async () => response(204, undefined, { etag: '"empty"', 'x-workspace-owner-scope': '' })),
      /owner scope/,
    );
    await assert.rejects(
      loadRemoteWorkspace(async () => response(200, workspace, { etag: '"v1"', 'x-workspace-owner-scope': '' })),
      /owner scope/,
    );
  });

  it('does not upload or expose an unbound cache for an empty remote owner', async () => {
    const local = {
      ...workspace,
      projects: [{ id: 'account-a-private-data' } as RemoteWorkspace['projects'][number]],
    };
    const storage = memoryStorage();
    storage.setItem('project-board-v1', JSON.stringify(local));
    const hydrated = await hydrateRemoteWorkspace(local, async () => ({
      workspace: null,
      revision: '"owner-b-empty"',
      ownerScopeToken: 'B'.repeat(43),
    }), storage);

    assert.equal(hydrated.shouldSave, false);
    assert.equal(hydrated.recoveryConflict, true);
    assert.equal(hydrated.privateCachePreserved, true);
    assert.deepEqual(hydrated.workspace.projects, []);
    assert.ok([...Array(10).keys()].some((index) => storage.getItem(`project-board-v1-orphan-unbound${index ? `-${index + 1}` : ''}`)));
  });

  it('keeps account A cache and pending journal private when account B is empty', async () => {
    const ownerAWorkspace = {
      ...workspace,
      projects: [{ id: 'account-a-private-data' } as RemoteWorkspace['projects'][number]],
    };
    const storage = memoryStorage();
    storage.setItem('project-board-v1-owner-scope', OWNER_A);
    storage.setItem('project-board-v1', JSON.stringify(ownerAWorkspace));
    let puts = 0;
    const sync: WorkspaceSyncState = { etag: '"owner-a-base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(ownerAWorkspace, sync, async () => {
        puts += 1;
        return response(503);
      }, storage),
      /workspace request failed: 503/,
    );

    const hydrated = await hydrateRemoteWorkspace(ownerAWorkspace, async () => ({
      workspace: null,
      revision: '"owner-b-empty"',
      ownerScopeToken: OWNER_B,
    }), storage);

    assert.equal(puts, 1);
    assert.equal(hydrated.shouldSave, false);
    assert.equal(hydrated.recoveryConflict, true);
    assert.deepEqual(hydrated.workspace.projects, []);
    assert.equal(storage.getItem('project-board-v1'), JSON.stringify(ownerAWorkspace));
    assert.ok(storage.getItem(`project-board-v1-orphan-${OWNER_A}`));
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));
  });

  it('does not acknowledge identical pending content across owner scopes', async () => {
    const storage = memoryStorage();
    const sync: WorkspaceSyncState = { etag: '"owner-a-base"', blocked: false, ownerScopeToken: OWNER_A };
    await assert.rejects(
      queueRemoteWorkspaceSave(workspace, sync, async () => response(503), storage),
      /workspace request failed: 503/,
    );

    const hydrated = await hydrateRemoteWorkspace(workspace, async () => ({
      workspace,
      revision: '"owner-b-identical-content"',
      ownerScopeToken: OWNER_B,
    }), storage);

    assert.equal(hydrated.shouldSave, false);
    assert.deepEqual(hydrated.workspace, workspace);
    assert.ok(storage.getItem(pendingWorkspaceKey(OWNER_A)));
  });
});
