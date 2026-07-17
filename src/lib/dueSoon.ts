import type { Project } from '../types';
import { isTerminal } from './health';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days until deadline (negative = overdue). Null if no deadline. */
export function daysUntil(deadline: string, now = new Date()): number {
  const end = startOfDay(new Date(deadline));
  const today = startOfDay(now);
  return Math.ceil((end.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Projects with a deadline in the next `withinDays` days or overdue.
 * Excludes done/archived unless `includeTerminal` is true.
 * Sorted soonest first (most overdue first).
 */
export function getDueSoonProjects(
  projects: Project[],
  options: { withinDays?: number; includeTerminal?: boolean; now?: Date } = {},
): Project[] {
  const withinDays = options.withinDays ?? 7;
  const includeTerminal = options.includeTerminal ?? false;
  const now = options.now ?? new Date();

  return projects
    .filter((p) => {
      if (!p.deadline) return false;
      if (!includeTerminal && isTerminal(p.status)) return false;
      const d = daysUntil(p.deadline, now);
      return d <= withinDays;
    })
    .sort((a, b) => {
      const da = daysUntil(a.deadline!, now);
      const db = daysUntil(b.deadline!, now);
      if (da !== db) return da - db;
      return a.title.localeCompare(b.title);
    });
}
