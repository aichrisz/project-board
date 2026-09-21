import type { ActivityEvent, StorageBlob } from '../types';

export type RemoteWorkspace = StorageBlob & { activity: ActivityEvent[] };
export type WorkspaceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type WorkspaceSnapshot = {
  workspace: RemoteWorkspace | null;
  revision: string;
};
export type WorkspaceSyncState = {
  etag: string;
  blocked: boolean;
};
export type HydratedWorkspace = {
  workspace: RemoteWorkspace;
  status: 'ready' | 'failed';
  shouldSave: boolean;
  revision: string;
};

export const CREATION_ETAG = '"workspace-missing"';

export class WorkspaceConflictError extends Error {
  constructor() {
    super('workspace changed elsewhere; reload required');
    this.name = 'WorkspaceConflictError';
  }
}

const API_PATH = '/api/workspace';
let saveQueue = Promise.resolve();

function responseEtag(response: Response): string {
  const etag = response.headers.get('etag');
  if (!etag) throw new Error('workspace response missing ETag');
  return etag;
}

export async function loadRemoteWorkspace(
  fetcher: WorkspaceFetch = fetch,
): Promise<WorkspaceSnapshot> {
  const response = await fetcher(API_PATH, { credentials: 'same-origin' });
  if (response.status === 204) {
    return { workspace: null, revision: responseEtag(response) };
  }
  if (!response.ok) throw new Error(`workspace request failed: ${response.status}`);
  return { workspace: (await response.json()) as RemoteWorkspace, revision: responseEtag(response) };
}

export async function hydrateRemoteWorkspace(
  localWorkspace: RemoteWorkspace,
  loader: () => Promise<WorkspaceSnapshot> = loadRemoteWorkspace,
): Promise<HydratedWorkspace> {
  try {
    const remote = await loader();
    if (remote.workspace) {
      return {
        workspace: remote.workspace,
        status: 'ready',
        shouldSave: false,
        revision: remote.revision,
      };
    }
    return {
      workspace: localWorkspace,
      status: 'ready',
      shouldSave: true,
      revision: remote.revision,
    };
  } catch {
    return { workspace: localWorkspace, status: 'failed', shouldSave: false, revision: CREATION_ETAG };
  }
}

export function queueRemoteWorkspaceSave(
  workspace: RemoteWorkspace,
  sync: WorkspaceSyncState,
  fetcher: WorkspaceFetch = fetch,
): Promise<void> {
  const save = async () => {
    if (sync.blocked) throw new WorkspaceConflictError();
    const response = await fetcher(API_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'if-match': sync.etag },
      body: JSON.stringify(workspace),
    });
    if (response.status === 412) {
      sync.blocked = true;
      throw new WorkspaceConflictError();
    }
    if (!response.ok) throw new Error(`workspace request failed: ${response.status}`);
    sync.etag = responseEtag(response);
  };
  const next = saveQueue.then(save, save);
  saveQueue = next.catch(() => undefined);
  return next;
}
