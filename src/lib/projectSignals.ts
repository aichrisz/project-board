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

export function getFreshness(project: Project, now = new Date()): Freshness | null {
  if (isTerminal(project.status)) return null;

  const daysSinceUpdate =
    calendarDayNumber(now) - calendarDayNumber(new Date(project.updated_at));
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
