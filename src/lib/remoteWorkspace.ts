import type { ActivityEvent, StorageBlob } from '../types';

export type RemoteWorkspace = StorageBlob & { activity: ActivityEvent[] };
export type WorkspaceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type HydratedWorkspace = {
  workspace: RemoteWorkspace;
  status: 'ready' | 'failed';
  shouldSave: boolean;
};

const API_PATH = '/api/workspace';
let saveQueue = Promise.resolve();

export async function loadRemoteWorkspace(
  fetcher: WorkspaceFetch = fetch,
): Promise<RemoteWorkspace | null> {
  const response = await fetcher(API_PATH, { credentials: 'same-origin' });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`workspace request failed: ${response.status}`);
  return (await response.json()) as RemoteWorkspace;
}

export async function hydrateRemoteWorkspace(
  localWorkspace: RemoteWorkspace,
  loader: () => Promise<RemoteWorkspace | null> = loadRemoteWorkspace,
): Promise<HydratedWorkspace> {
  try {
    const remoteWorkspace = await loader();
    if (remoteWorkspace) {
      return { workspace: remoteWorkspace, status: 'ready', shouldSave: false };
    }
    return { workspace: localWorkspace, status: 'ready', shouldSave: true };
  } catch {
    return { workspace: localWorkspace, status: 'failed', shouldSave: false };
  }
}

export function queueRemoteWorkspaceSave(
  workspace: RemoteWorkspace,
  fetcher: WorkspaceFetch = fetch,
): Promise<void> {
  const save = async () => {
    const response = await fetcher(API_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workspace),
    });
    if (!response.ok) throw new Error(`workspace request failed: ${response.status}`);
  };
  const next = saveQueue.then(save, save);
  saveQueue = next.catch(() => undefined);
  return next;
}
