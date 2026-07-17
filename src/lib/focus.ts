import type { Project } from '../types';
import { daysUntil } from './dueSoon';
import { isTerminal } from './health';

/**
 * Project is in "Focus this week" set:
 * starred OR due within 7 days / overdue OR status in_progress.
 * Caller still applies show-completed / status / type filters.
 */
export function matchesFocusThisWeek(
  project: Project,
  now = new Date(),
): boolean {
  if (project.starred) return true;
  if (project.status === 'in_progress') return true;
  if (project.deadline) {
    const d = daysUntil(project.deadline, now);
    if (d <= 7) return true;
  }
  return false;
}

/** Optional: exclude terminal when show completed is off (helper). */
export function isFocusCandidate(
  project: Project,
  showCompleted: boolean,
  now = new Date(),
): boolean {
  if (!showCompleted && isTerminal(project.status)) return false;
  return matchesFocusThisWeek(project, now);
}
