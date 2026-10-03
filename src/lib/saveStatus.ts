export type RemoteSaveStatus =
  | 'loading'
  | 'unavailable'
  | 'conflict'
  | 'failed'
  | 'saving'
  | 'saved';

export function getRemoteSaveStatus(input: {
  loading: boolean;
  failed: boolean;
  conflict: boolean;
  saveError: boolean;
  latestKey: string;
  acknowledgedKey: string | null;
  hasPendingWork: boolean;
}): RemoteSaveStatus {
  if (input.loading) return 'loading';
  if (input.conflict) return 'conflict';
  if (input.failed) return 'unavailable';
  if (input.saveError) return 'failed';
  if (input.hasPendingWork || input.latestKey !== input.acknowledgedKey) {
    return 'saving';
  }
  return 'saved';
}
