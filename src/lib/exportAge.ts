const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const EXPORT_STALE_DAYS = 7;

/** True when never exported or last export is older than EXPORT_STALE_DAYS. */
export function isExportStale(
  lastExportAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastExportAt) return true;
  const t = Date.parse(lastExportAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > EXPORT_STALE_DAYS * MS_PER_DAY;
}

/** Human-relative label for last export time. */
export function formatExportRelative(
  lastExportAt: string | null | undefined,
  now = new Date(),
): string {
  if (!lastExportAt) return 'Never';
  const t = Date.parse(lastExportAt);
  if (Number.isNaN(t)) return 'Never';
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}

export function formatExportAbsolute(
  lastExportAt: string | null | undefined,
): string | null {
  if (!lastExportAt) return null;
  const t = Date.parse(lastExportAt);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleString();
}
