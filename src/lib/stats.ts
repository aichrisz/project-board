import type { Project, ProjectStatus, ProjectType } from '../types';
import { PROJECT_STATUSES, PROJECT_TYPES } from '../types';
import { isOverdue } from './health';

export interface StatsResult {
  total: number;
  active: number;
  ideas: number;
  overdue: number;
  completed: number;
  byType: Record<ProjectType, number>;
  byStatus: Record<ProjectStatus, number>;
}

export function computeStats(projects: Project[]): StatsResult {
  const byType = Object.fromEntries(PROJECT_TYPES.map((t) => [t, 0])) as Record<
    ProjectType,
    number
  >;
  const byStatus = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, 0])) as Record<
    ProjectStatus,
    number
  >;

  let active = 0;
  let ideas = 0;
  let overdue = 0;
  let completed = 0;

  for (const p of projects) {
    byType[p.type] += 1;
    byStatus[p.status] += 1;

    if (p.status === 'idea') ideas += 1;
    if (p.status === 'done' || p.status === 'archived') {
      completed += 1;
    } else {
      active += 1;
    }
    if (isOverdue(p)) overdue += 1;
  }

  return {
    total: projects.length,
    active,
    ideas,
    overdue,
    completed,
    byType,
    byStatus,
  };
}
