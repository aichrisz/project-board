import type { Project } from '../types';
import { ACTIVE_STATUSES } from '../types';
import { isIdle, isOverdue, isTerminal } from './health';

export type HygieneCounts = {
  noSteps: number;
  idleInProgress: number;
  overdue: number;
  emptyTags: number;
};

function isActive(project: Project): boolean {
  return (ACTIVE_STATUSES as string[]).includes(project.status);
}

/** Active projects with zero steps. */
export function getNoStepsProjects(projects: Project[]): Project[] {
  return projects
    .filter((p) => isActive(p) && p.steps.length === 0)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** In-progress projects past the idle threshold. */
export function getIdleInProgressProjects(
  projects: Project[],
  idleDays: number,
  now = new Date(),
): Project[] {
  return projects
    .filter((p) => isIdle(p, idleDays, now))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Non-terminal projects with a past deadline. */
export function getOverdueProjects(
  projects: Project[],
  now = new Date(),
): Project[] {
  return projects
    .filter((p) => isOverdue(p, now))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Active projects with no tags. */
export function getEmptyTagsProjects(projects: Project[]): Project[] {
  return projects
    .filter((p) => isActive(p) && (!p.tags || p.tags.length === 0))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function computeHygieneCounts(
  projects: Project[],
  idleDays: number,
  now = new Date(),
): HygieneCounts {
  return {
    noSteps: getNoStepsProjects(projects).length,
    idleInProgress: getIdleInProgressProjects(projects, idleDays, now).length,
    overdue: getOverdueProjects(projects, now).length,
    emptyTags: getEmptyTagsProjects(projects).length,
  };
}

/** Plain-text hygiene report for clipboard. */
export function formatHygieneReport(
  projects: Project[],
  idleDays: number,
  now = new Date(),
): string {
  const counts = computeHygieneCounts(projects, idleDays, now);
  const noSteps = getNoStepsProjects(projects);
  const idle = getIdleInProgressProjects(projects, idleDays, now);
  const overdue = getOverdueProjects(projects, now);
  const emptyTags = getEmptyTagsProjects(projects);
  const active = projects.filter((p) => !isTerminal(p.status));

  const lines: string[] = [
    'Project Board — Hygiene report',
    `Generated: ${now.toLocaleString()}`,
    `Idle threshold: ${idleDays} days`,
    '',
    'Counts',
    `  Active projects: ${active.length}`,
    `  No steps (active): ${counts.noSteps}`,
    `  Idle in progress: ${counts.idleInProgress}`,
    `  Overdue: ${counts.overdue}`,
    `  Empty tags (active): ${counts.emptyTags}`,
    '',
  ];

  function section(title: string, list: Project[]) {
    lines.push(title);
    if (list.length === 0) {
      lines.push('  (none)');
    } else {
      for (const p of list) {
        lines.push(`  - ${p.title} [${p.status}]`);
      }
    }
    lines.push('');
  }

  section('No steps', noSteps);
  section('Idle in progress', idle);
  section('Overdue', overdue);
  section('Empty tags', emptyTags);

  return lines.join('\n').trimEnd() + '\n';
}
