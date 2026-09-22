import type { Project, Step } from '../types';
import { isTerminal } from './health';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const IDEAL_ACTIVE_PROJECTS = 3;

export type Freshness = 'Quiet' | 'Review';

export type ActiveProjectAdvisory = {
  count: number;
  idealMaximum: number;
  tone: 'neutral' | 'supportive';
  message: string;
};

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

export function getNextAction(project: Project): Step | null {
  return (
    [...project.steps]
      .filter((step) => !step.done)
      .sort((a, b) => a.order - b.order)[0] ?? null
  );
}

export function getBlocker(project: Project): string | null {
  for (const line of project.notes_md.split(/\r?\n/).reverse()) {
    const match = line.match(/^blocker:(.*)$/i);
    const value = match?.[1].trim();
    const normalized = value?.toLowerCase().replace(/\.$/, '');
    if (normalized === 'none') return null;
    if (value) return value;
  }

  return null;
}

export function getFocusProjects(projects: Project[]): {
  projects: Project[];
  total: number;
} {
  const activeProjects = projects.filter((project) => project.status === 'in_progress');
  const sortedProjects = [...activeProjects].sort((a, b) => {
    const aUpdated = new Date(a.updated_at).getTime();
    const bUpdated = new Date(b.updated_at).getTime();
    const aInvalid = Number.isNaN(aUpdated);
    const bInvalid = Number.isNaN(bUpdated);

    if (aInvalid !== bInvalid) return aInvalid ? 1 : -1;
    if (!aInvalid && aUpdated !== bUpdated) return bUpdated - aUpdated;
    return a.id.localeCompare(b.id);
  });

  return {
    projects: sortedProjects.slice(0, IDEAL_ACTIVE_PROJECTS),
    total: activeProjects.length,
  };
}

export function getFreshness(project: Project, now = new Date()): Freshness | null {
  if (isTerminal(project.status)) return null;

  const updatedAt = new Date(project.updated_at);
  if (Number.isNaN(updatedAt.getTime())) return null;

  const daysSinceUpdate = calendarDayNumber(now) - calendarDayNumber(updatedAt);
  if (daysSinceUpdate < 30) return null;
  return daysSinceUpdate < 60 ? 'Quiet' : 'Review';
}

export function getActiveProjectAdvisory(
  projects: Project[],
): ActiveProjectAdvisory {
  const count = projects.filter((project) => project.status === 'in_progress').length;

  if (count <= IDEAL_ACTIVE_PROJECTS) {
    return {
      count,
      idealMaximum: IDEAL_ACTIVE_PROJECTS,
      tone: 'neutral',
      message: `${count} projects in progress (ideal maximum: ${IDEAL_ACTIVE_PROJECTS}).`,
    };
  }

  return {
    count,
    idealMaximum: IDEAL_ACTIVE_PROJECTS,
    tone: 'supportive',
    message:
      `${count} projects in progress. Consider continuing, pausing, or finishing one project.`,
  };
}
