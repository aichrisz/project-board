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
  reloadRequired: boolean;
};

export const CREATION_ETAG = '"workspace-missing"';
export const REMOTE_HYDRATION_FAILURE =
  'Remote workspace could not be loaded. Your local data is preserved, but saving is unavailable until you reload.';
export const REMOTE_SAVE_FAILURE =
  'Remote save failed. Your local changes are preserved; make another change to retry.';

export class WorkspaceConflictError extends Error {
  constructor() {
    super('workspace changed elsewhere; reload required');
    this.name = 'WorkspaceConflictError';
  }
}

const API_PATH = '/api/workspace';
let saveQueue: Promise<unknown> = Promise.resolve();

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
        reloadRequired: false,
      };
    }
    return {
      workspace: localWorkspace,
      status: 'ready',
      shouldSave: true,
      revision: remote.revision,
      reloadRequired: false,
    };
  } catch {
    return {
      workspace: localWorkspace,
      status: 'failed',
      shouldSave: false,
      revision: CREATION_ETAG,
      reloadRequired: true,
    };
  }
}

export function queueRemoteWorkspaceSave(
  workspace: RemoteWorkspace,
  sync: WorkspaceSyncState,
  fetcher: WorkspaceFetch = fetch,
): Promise<RemoteWorkspace> {
  const save = async (): Promise<RemoteWorkspace> => {
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
    return workspace;
  };
  const next = saveQueue.then(save, save);
  saveQueue = next.catch(() => undefined);
  return next;
}
