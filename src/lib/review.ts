import type { AppSettings, Project } from '../types';
import { isExportStale } from './exportAge';
import {
  getDueSoonProjects,
  daysUntil,
} from './dueSoon';
import { isIdle, isOverdue, isTerminal } from './health';
import {
  getIdleInProgressProjects,
  getNoStepsProjects,
  getOverdueProjects,
} from './hygiene';

export type ReviewBuckets = {
  overdue: Project[];
  dueSoon: Project[];
  staleInProgress: Project[];
  noSteps: Project[];
};

export type ReviewKpis = {
  active: number;
  inProgress: number;
  overdue: number;
  idle: number;
  starred: number;
  dueSoon: number;
};

export function computeReviewBuckets(
  projects: Project[],
  idleDays: number,
  now = new Date(),
): ReviewBuckets {
  const overdue = getOverdueProjects(projects, now);
  // Due soon: deadline within 7 days, not already overdue (overdue section owns those)
  const dueSoon = getDueSoonProjects(projects, {
    withinDays: 7,
    includeTerminal: false,
    now,
  }).filter((p) => {
    if (!p.deadline) return false;
    return daysUntil(p.deadline, now) >= 0;
  });
  const staleInProgress = getIdleInProgressProjects(projects, idleDays, now);
  const noSteps = getNoStepsProjects(projects);
  return { overdue, dueSoon, staleInProgress, noSteps };
}

export function computeReviewKpis(
  projects: Project[],
  idleDays: number,
  now = new Date(),
): ReviewKpis {
  let active = 0;
  let inProgress = 0;
  let overdue = 0;
  let idle = 0;
  let starred = 0;
  let dueSoon = 0;

  for (const p of projects) {
    if (!isTerminal(p.status)) active += 1;
    if (p.status === 'in_progress') inProgress += 1;
    if (isOverdue(p, now)) overdue += 1;
    if (isIdle(p, idleDays, now)) idle += 1;
    if (p.starred) starred += 1;
  }

  dueSoon = getDueSoonProjects(projects, {
    withinDays: 7,
    includeTerminal: false,
    now,
  }).filter((p) => p.deadline && daysUntil(p.deadline, now) >= 0).length;

  return { active, inProgress, overdue, idle, starred, dueSoon };
}

/** Rule-based suggested actions (3–5 short bullets). No LLM. */
export function suggestReviewActions(
  projects: Project[],
  settings: AppSettings,
  now = new Date(),
): string[] {
  const buckets = computeReviewBuckets(projects, settings.idleDays, now);
  const suggestions: string[] = [];

  if (buckets.staleInProgress.length > 0) {
    suggestions.push(
      `Archive ${buckets.staleInProgress.length} idle in-progress project${buckets.staleInProgress.length === 1 ? '' : 's'}`,
    );
  }

  if (buckets.overdue.length > 0) {
    const sample = buckets.overdue[0]!;
    suggestions.push(
      buckets.overdue.length === 1
        ? `Update deadline or status for overdue “${sample.title}”`
        : `Triage ${buckets.overdue.length} overdue projects (start with “${sample.title}”)`,
    );
  }

  if (buckets.noSteps.length > 0) {
    const sample = buckets.noSteps[0]!;
    suggestions.push(
      buckets.noSteps.length === 1
        ? `Add steps to “${sample.title}”`
        : `Add steps to ${buckets.noSteps.length} projects without milestones`,
    );
  }

  if (buckets.dueSoon.length > 0) {
    suggestions.push(
      `Review ${buckets.dueSoon.length} deadline${buckets.dueSoon.length === 1 ? '' : 's'} due within 7 days`,
    );
  }

  if (isExportStale(settings.lastExportAt, now)) {
    suggestions.push(
      settings.lastExportAt
        ? 'Export a JSON backup — last export is older than 7 days'
        : 'Export a JSON backup — none recorded yet',
    );
  }

  const inProgressNoStar = projects.filter(
    (p) => p.status === 'in_progress' && !p.starred && !isIdle(p, settings.idleDays, now),
  );
  if (suggestions.length < 3 && inProgressNoStar.length > 0) {
    suggestions.push('Star the projects you want to focus on this week');
  }

  if (suggestions.length === 0) {
    suggestions.push('Board looks steady — keep shipping or export a backup for peace of mind');
  }

  return suggestions.slice(0, 5);
}
