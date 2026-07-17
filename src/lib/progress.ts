import type { Project, Step } from '../types';

export function calcProgressFromSteps(steps: Step[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.done).length;
  return Math.round((done / steps.length) * 100);
}

/** When steps exist, progress is derived from them; otherwise keep manual value. */
export function resolveProgress(project: Pick<Project, 'steps' | 'progress_pct'>): number {
  if (project.steps.length > 0) {
    return calcProgressFromSteps(project.steps);
  }
  return Math.min(100, Math.max(0, project.progress_pct));
}

export function withAutoProgress<T extends Pick<Project, 'steps' | 'progress_pct'>>(project: T): T {
  if (project.steps.length === 0) return project;
  return {
    ...project,
    progress_pct: calcProgressFromSteps(project.steps),
  };
}
