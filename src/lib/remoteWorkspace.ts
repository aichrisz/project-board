import type { ActivityEvent, StorageBlob } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { parseImportJson, MAX_IMPORT_BYTES } from './export';
import { ACTIVITY_KEY } from './activity';
import { ORPHAN_STORAGE_PREFIX, STORAGE_KEY, STORAGE_OWNER_SCOPE_KEY } from './storage';

export type RemoteWorkspace = StorageBlob & { activity: ActivityEvent[] };
export type WorkspaceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type WorkspaceSnapshot = {
  workspace: RemoteWorkspace | null;
  revision: string;
  ownerScopeToken: string;
};
export type WorkspaceSyncState = {
  etag: string;
  blocked: boolean;
  ownerScopeToken: string;
};
export type HydratedWorkspace = {
  workspace: RemoteWorkspace;
  status: 'ready' | 'failed';
  shouldSave: boolean;
  revision: string;
  reloadRequired: boolean;
  recoveryConflict?: boolean;
  privateCachePreserved?: boolean;
  ownerScopeToken?: string;
};

type PendingWorkspaceJournal = {
  version: 1;
  ownerScopeToken: string;
  baseETag: string;
  operationId?: string;
  workspaceDigest?: string;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StorageObservation = {
  ownerScope: string | null;
  workspace: string | null;
  activity: string | null;
  legacyJournal: string | null;
  scopedJournal: string | null;
};
type PendingJournalRead =
  | { kind: 'none' }
  | { kind: 'valid'; journal: PendingWorkspaceJournal }
  | { kind: 'invalid' };

export const CREATION_ETAG = '"workspace-missing"';
export const PENDING_WORKSPACE_KEY = 'project-board-v1-pending-remote';
export const OWNER_SCOPE_HEADER = 'x-workspace-owner-scope';
export function pendingWorkspaceKey(ownerScopeToken: string): string {
  return `${PENDING_WORKSPACE_KEY}:${ownerScopeToken}`;
}
export const REMOTE_HYDRATION_FAILURE =
  'Remote workspace could not be loaded. Your local data is preserved, but saving is unavailable until you reload.';
export const REMOTE_SAVE_FAILURE =
  'Remote save failed. Your local changes are preserved; reload to retry safely.';
export const REMOTE_RECOVERY_CONFLICT =
  'A pending local save could not be reconciled with the remote workspace. Local data is preserved; export it before resolving the conflict.';
export const REMOTE_PRIVATE_CACHE_CONFLICT =
  'This account has an empty workspace. Data from another account remains in this browser’s private cache and is not available in this account’s export.';

export class WorkspaceConflictError extends Error {
  constructor() {
    super('workspace changed elsewhere; reload required');
    this.name = 'WorkspaceConflictError';
  }
}

const API_PATH = '/api/workspace';
const MAX_JOURNAL_CHARS = 2048;
const OWNER_SCOPE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const LEGACY_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ACTIVITY_TYPES = new Set([
  'project_created',
  'project_updated',
  'status_changed',
  'step_toggled',
  'focus_session',
  'project_deleted',
  'import',
  'seed',
  'reset',
]);
let saveQueue: Promise<unknown> = Promise.resolve();
const hydrationObservations = new WeakMap<HydratedWorkspace, StorageObservation>();

function responseEtag(response: Response): string {
  const etag = response.headers.get('etag');
  if (!etag) throw new Error('workspace response missing ETag');
  return etag;
}

function responseOwnerScope(response: Response): string {
  const token = response.headers.get(OWNER_SCOPE_HEADER);
  if (!token || !OWNER_SCOPE_PATTERN.test(token)) throw new Error('workspace response missing owner scope');
  return token;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function observeStorage(storage: StorageLike | null, scopedOwner?: string): StorageObservation | null {
  if (!storage) return null;
  try {
    const ownerScope = storage.getItem(STORAGE_OWNER_SCOPE_KEY);
    const journalOwner = scopedOwner ?? ownerScope;
    return {
      ownerScope,
      workspace: storage.getItem(STORAGE_KEY),
      activity: storage.getItem(ACTIVITY_KEY),
      legacyJournal: storage.getItem(PENDING_WORKSPACE_KEY),
      scopedJournal: journalOwner ? storage.getItem(pendingWorkspaceKey(journalOwner)) : null,
    };
  } catch {
    return null;
  }
}

function finishHydration(
  result: HydratedWorkspace,
  storage: StorageLike | null,
): HydratedWorkspace {
  const observation = observeStorage(storage, result.ownerScopeToken);
  if (observation) hydrationObservations.set(result, observation);
  return result;
}

export function isHydratedWorkspaceCurrent(
  result: HydratedWorkspace,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  const expected = hydrationObservations.get(result);
  if (!expected) return storage === null;
  const current = observeStorage(storage, result.ownerScopeToken);
  return current !== null && JSON.stringify(current) === JSON.stringify(expected);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    const entries = value.map((item) =>
      item === undefined ? 'null' : stableStringify(item),
    );
    return `[${entries.join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isJournal(value: unknown): value is PendingWorkspaceJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const hasOperationId =
    typeof record.operationId === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(record.operationId);
  const hasLegacyDigest =
    typeof record.workspaceDigest === 'string' && LEGACY_DIGEST_PATTERN.test(record.workspaceDigest);
  return (
    record.version === 1 &&
    typeof record.ownerScopeToken === 'string' && OWNER_SCOPE_PATTERN.test(record.ownerScopeToken) &&
    typeof record.baseETag === 'string' &&
    record.baseETag.length > 0 &&
    record.baseETag.length <= 256 &&
    (hasOperationId || hasLegacyDigest) &&
    (record.operationId === undefined || hasOperationId) &&
    (record.workspaceDigest === undefined || hasLegacyDigest)
  );
}

function readPendingJournal(
  storage: StorageLike | null,
  ownerScopeToken: string,
  capturedRaw?: string | null,
): PendingJournalRead {
  if (!storage) return { kind: 'none' };
  try {
    const raw = capturedRaw === undefined
      ? storage.getItem(pendingWorkspaceKey(ownerScopeToken))
      : capturedRaw;
    if (raw === null) return { kind: 'none' };
    if (raw.length > MAX_JOURNAL_CHARS) return { kind: 'invalid' };
    const value: unknown = JSON.parse(raw);
    return isJournal(value) && value.ownerScopeToken === ownerScopeToken
      ? { kind: 'valid', journal: value }
      : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

function persistPendingJournal(
  ownerScopeToken: string,
  baseETag: string,
  storage: StorageLike | null,
): PendingWorkspaceJournal | null {
  if (!storage) return null;
  const operationId = globalThis.crypto?.randomUUID?.();
  if (!operationId) throw new Error('workspace recovery is unavailable');
  const journal: PendingWorkspaceJournal = {
    version: 1,
    ownerScopeToken,
    baseETag,
    operationId,
  };
  const serialized = JSON.stringify(journal);
  if (serialized.length > MAX_JOURNAL_CHARS) {
    throw new Error('pending workspace journal exceeds limit');
  }
  storage.setItem(pendingWorkspaceKey(ownerScopeToken), serialized);
  return journal;
}

function workspaceMatches(left: RemoteWorkspace, right: RemoteWorkspace): boolean {
  return stableStringify(left) === stableStringify(right);
}

function clearPendingJournal(
  storage: StorageLike | null,
  expected: PendingWorkspaceJournal,
): boolean {
  if (!storage) return true;
  const key = pendingWorkspaceKey(expected.ownerScopeToken);
  const current = readPendingJournal(storage, expected.ownerScopeToken);
  if (current.kind === 'valid' && JSON.stringify(current.journal) === JSON.stringify(expected)) {
    storage.removeItem(key);
    return true;
  }
  return false;
}

function emptyWorkspace(): RemoteWorkspace {
  return {
    version: 1,
    projects: [],
    settings: { ...DEFAULT_SETTINGS },
    focus: { active: null, history: [] },
    activity: [],
  };
}

function preserveOrphanCandidate(storage: StorageLike | null, scope: string | null): boolean {
  if (!storage) return true;
  try {
    const workspace = storage.getItem(STORAGE_KEY);
    const activity = storage.getItem(ACTIVITY_KEY);
    const legacyJournal = storage.getItem(PENDING_WORKSPACE_KEY);
    if (workspace === null && activity === null && legacyJournal === null) return true;
    const candidate = JSON.stringify({ workspace, activity, legacyJournal });
    const suffix = scope && OWNER_SCOPE_PATTERN.test(scope) ? scope : 'unbound';
    const baseKey = `${ORPHAN_STORAGE_PREFIX}${suffix}`;
    for (let index = 0; index < 100; index += 1) {
      const key = index === 0 ? baseKey : `${baseKey}-${index + 1}`;
      const existing = storage.getItem(key);
      if (existing === candidate) return true;
      if (existing === null) {
        storage.setItem(key, candidate);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function setOwnerScope(storage: StorageLike | null, ownerScopeToken: string): boolean {
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_OWNER_SCOPE_KEY, ownerScopeToken);
    return true;
  } catch {
    return false;
  }
}

function isLocalCacheValid(storage: StorageLike | null): boolean {
  if (!storage) return true;
  try {
    const workspaceRaw = storage.getItem(STORAGE_KEY);
    if (workspaceRaw !== null) parseImportJson(workspaceRaw);
    const activityRaw = storage.getItem(ACTIVITY_KEY);
    if (activityRaw !== null) {
      const activity: unknown = JSON.parse(activityRaw);
      if (!Array.isArray(activity) || !activity.every((event) => {
        if (!event || typeof event !== 'object') return false;
        const item = event as ActivityEvent;
        return typeof item.id === 'string' && typeof item.at === 'string' &&
          Number.isFinite(Date.parse(item.at)) && ACTIVITY_TYPES.has(item.type) &&
          typeof item.message === 'string' &&
          (item.projectId === undefined || typeof item.projectId === 'string');
      })) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validateRemoteWorkspace(value: unknown): RemoteWorkspace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid workspace response');
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !Array.isArray(record.projects) ||
    !record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings) ||
    !Array.isArray(record.activity) || record.activity.length > 100
  ) {
    throw new Error('invalid workspace response');
  }
  const activity = record.activity;
  const validActivity = activity.every((event) => {
    if (!event || typeof event !== 'object') return false;
    const activityEvent = event as ActivityEvent;
    return (
      typeof activityEvent.id === 'string' &&
      typeof activityEvent.at === 'string' &&
      Number.isFinite(Date.parse(activityEvent.at)) &&
      ACTIVITY_TYPES.has(activityEvent.type) &&
      typeof activityEvent.message === 'string' &&
      (activityEvent.projectId === undefined || typeof activityEvent.projectId === 'string')
    );
  });
  if (!validActivity) {
    throw new Error('invalid workspace response');
  }
  try {
    const blob = parseImportJson(JSON.stringify(record));
    return { ...blob, activity: activity as ActivityEvent[] };
  } catch {
    throw new Error('invalid workspace response');
  }
}

export async function loadRemoteWorkspace(
  fetcher: WorkspaceFetch = fetch,
): Promise<WorkspaceSnapshot> {
  const response = await fetcher(API_PATH, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status !== 204 && !response.ok) throw new Error(`workspace request failed: ${response.status}`);
  const ownerScopeToken = responseOwnerScope(response);
  if (response.status === 204) {
    return { workspace: null, revision: responseEtag(response), ownerScopeToken };
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) {
    throw new Error('workspace response exceeds limit');
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('workspace response exceeds limit');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('invalid workspace response');
  }
  return { workspace: validateRemoteWorkspace(value), revision: responseEtag(response), ownerScopeToken };
}

export async function hydrateRemoteWorkspace(
  localWorkspace: RemoteWorkspace | (() => RemoteWorkspace),
  loader: () => Promise<WorkspaceSnapshot> = loadRemoteWorkspace,
  storage: StorageLike | null = defaultStorage(),
): Promise<HydratedWorkspace> {
  const initialStorage = observeStorage(storage);
  const finish = (result: HydratedWorkspace) => finishHydration(result, storage);
  try {
    const remote = await loader();
    const storageAfterLoad = observeStorage(storage, initialStorage?.ownerScope ?? undefined);
    if (initialStorage && storageAfterLoad && JSON.stringify(initialStorage) !== JSON.stringify(storageAfterLoad)) {
      const ownerChanged = initialStorage.ownerScope !== storageAfterLoad.ownerScope;
      let candidate = emptyWorkspace();
      if (!ownerChanged) {
        try {
          candidate = typeof localWorkspace === 'function' ? localWorkspace() : localWorkspace;
        } catch {
          candidate = emptyWorkspace();
        }
      }
      return finish({
        workspace: candidate,
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
        ...(ownerChanged || !initialStorage.ownerScope
          ? {}
          : { ownerScopeToken: initialStorage.ownerScope }),
      });
    }
    const local = typeof localWorkspace === 'function' ? localWorkspace() : localWorkspace;
    let storedOwnerScope: string | null = null;
    let cacheExists = false;
    try {
      storedOwnerScope = storage?.getItem(STORAGE_OWNER_SCOPE_KEY) ?? null;
      cacheExists = Boolean(
        storage?.getItem(STORAGE_KEY) ?? storage?.getItem(ACTIVITY_KEY) ??
        storage?.getItem(PENDING_WORKSPACE_KEY),
      );
    } catch {
      return finish({
        workspace: emptyWorkspace(),
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
      });
    }
    const ownerMatches = storedOwnerScope === remote.ownerScopeToken;
    let pendingRaw: string | null = null;
    if (ownerMatches) {
      try {
        pendingRaw = storage?.getItem(pendingWorkspaceKey(remote.ownerScopeToken)) ?? null;
      } catch {
        return finish({
          workspace: local,
          status: 'failed',
          shouldSave: false,
          revision: remote.revision,
          reloadRequired: true,
          recoveryConflict: true,
          ownerScopeToken: remote.ownerScopeToken,
        });
      }
    }
    const unboundCache = !ownerMatches && (cacheExists || storedOwnerScope !== null);
    const cacheValid = isLocalCacheValid(storage);
    if ((unboundCache || !cacheValid) && !preserveOrphanCandidate(storage, storedOwnerScope)) {
      return finish({
        workspace: remote.workspace ?? emptyWorkspace(),
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
      });
    }
    const pending = ownerMatches
      ? readPendingJournal(storage, remote.ownerScopeToken, pendingRaw)
      : { kind: 'none' as const };
    if (!remote.workspace && unboundCache) {
      return finish({
        workspace: emptyWorkspace(),
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
        privateCachePreserved: true,
      });
    }
    if (!remote.workspace && ownerMatches && !cacheValid) {
      return finish({
        workspace: emptyWorkspace(),
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
      });
    }
    if (!setOwnerScope(storage, remote.ownerScopeToken)) {
      return finish({
        workspace: remote.workspace ?? emptyWorkspace(),
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
      });
    }
    const latestLocal = (): RemoteWorkspace => {
      try {
        if (storage && storage.getItem(STORAGE_OWNER_SCOPE_KEY) !== remote.ownerScopeToken) {
          return local;
        }
        return typeof localWorkspace === 'function' ? localWorkspace() : local;
      } catch {
        return local;
      }
    };
    const journalChanged = (): boolean => {
      try {
        return (storage?.getItem(pendingWorkspaceKey(remote.ownerScopeToken)) ?? null) !== pendingRaw;
      } catch {
        return true;
      }
    };
    const changedJournalResult = (): HydratedWorkspace => finish({
      workspace: latestLocal(),
      status: 'failed',
      shouldSave: false,
      revision: remote.revision,
      reloadRequired: true,
      recoveryConflict: true,
      ownerScopeToken: remote.ownerScopeToken,
    });
    if (pending.kind === 'invalid') {
      return finish({
        workspace: local,
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
        ownerScopeToken: remote.ownerScopeToken,
      });
    }
    if (pending.kind === 'valid') {
      if (pending.journal.ownerScopeToken !== remote.ownerScopeToken) {
        return finish({
          workspace: remote.workspace ?? emptyWorkspace(),
          status: 'failed',
          shouldSave: false,
          revision: remote.revision,
          reloadRequired: true,
          recoveryConflict: true,
          ownerScopeToken: remote.ownerScopeToken,
        });
      }
      if (journalChanged()) return changedJournalResult();
      if (remote.workspace && workspaceMatches(remote.workspace, local)) {
        if (!clearPendingJournal(storage, pending.journal)) {
          return finish({
            workspace: latestLocal(),
            status: 'failed',
            shouldSave: false,
            revision: remote.revision,
            reloadRequired: true,
            recoveryConflict: true,
            ownerScopeToken: remote.ownerScopeToken,
          });
        }
        return finish({
          workspace: remote.workspace,
          status: 'ready',
          shouldSave: false,
          revision: remote.revision,
          reloadRequired: false,
          ownerScopeToken: remote.ownerScopeToken,
        });
      }
      if (remote.revision === pending.journal.baseETag) {
        return finish({
          workspace: local,
          status: 'ready',
          shouldSave: true,
          revision: remote.revision,
          reloadRequired: false,
          ownerScopeToken: remote.ownerScopeToken,
        });
      }
      return finish({
        workspace: local,
        status: 'failed',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: true,
        recoveryConflict: true,
        ownerScopeToken: remote.ownerScopeToken,
      });
    }
    if (remote.workspace) {
      return finish({
        workspace: remote.workspace,
        status: 'ready',
        shouldSave: false,
        revision: remote.revision,
        reloadRequired: false,
        ownerScopeToken: remote.ownerScopeToken,
      });
    }
    if (cacheExists && ownerMatches) {
      return finish({
        workspace: local,
        status: 'ready',
        shouldSave: true,
        revision: remote.revision,
        reloadRequired: false,
        ownerScopeToken: remote.ownerScopeToken,
      });
    }
    return finish({
      workspace: emptyWorkspace(),
      status: 'ready',
      shouldSave: false,
      revision: remote.revision,
      reloadRequired: false,
      ownerScopeToken: remote.ownerScopeToken,
    });
  } catch {
    const candidate = typeof localWorkspace === 'function' ? emptyWorkspace() : localWorkspace;
    return finish({
      workspace: candidate,
      status: 'failed',
      shouldSave: false,
      revision: CREATION_ETAG,
      reloadRequired: true,
    });
  }
}

export function queueRemoteWorkspaceSave(
  workspace: RemoteWorkspace,
  sync: WorkspaceSyncState,
  fetcher: WorkspaceFetch = fetch,
  storage: StorageLike | null = defaultStorage(),
): Promise<RemoteWorkspace> {
  const save = async (): Promise<RemoteWorkspace> => {
    if (sync.blocked) throw new WorkspaceConflictError();
    if (!OWNER_SCOPE_PATTERN.test(sync.ownerScopeToken)) {
      throw new Error('workspace owner scope unavailable');
    }
    if (typeof window !== 'undefined' && !storage) {
      throw new Error('workspace recovery storage unavailable');
    }
    if (storage) {
      const storedOwnerScope = storage.getItem(STORAGE_OWNER_SCOPE_KEY);
      if (storedOwnerScope && storedOwnerScope !== sync.ownerScopeToken) {
        throw new Error('workspace owner scope changed');
      }
      if (!storedOwnerScope && !setOwnerScope(storage, sync.ownerScopeToken)) {
        throw new Error('workspace recovery storage unavailable');
      }
    }
    const baseETag = sync.etag;
    persistPendingJournal(sync.ownerScopeToken, baseETag, storage);
    const response = await fetcher(API_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'if-match': baseETag,
        [OWNER_SCOPE_HEADER]: sync.ownerScopeToken,
      },
      body: JSON.stringify(workspace),
    });
    if (response.status === 412) {
      sync.blocked = true;
      throw new WorkspaceConflictError();
    }
    if (!response.ok) throw new Error(`workspace request failed: ${response.status}`);
    if (responseOwnerScope(response) !== sync.ownerScopeToken) {
      throw new Error('workspace owner scope changed');
    }
    sync.etag = responseEtag(response);
    return workspace;
  };
  const next = saveQueue.then(save, save);
  saveQueue = next.catch(() => undefined);
  return next;
}
