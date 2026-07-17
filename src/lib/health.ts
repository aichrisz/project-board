import type { HealthSignal, Project } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isTerminal(status: Project['status']): boolean {
  return status === 'done' || status === 'archived';
}

export function isOverdue(project: Project, now = new Date()): boolean {
  if (!project.deadline || isTerminal(project.status)) return false;
  const deadline = startOfDay(new Date(project.deadline));
  return deadline.getTime() < startOfDay(now).getTime();
}

export function isAtRisk(project: Project, now = new Date()): boolean {
  if (!project.deadline || isTerminal(project.status)) return false;
  const deadline = startOfDay(new Date(project.deadline));
  const today = startOfDay(now);
  const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / MS_PER_DAY);
  return daysUntil <= 3;
}

export function isIdle(project: Project, idleDays: number, now = new Date()): boolean {
  if (project.status !== 'in_progress') return false;
  const updated = new Date(project.updated_at).getTime();
  const threshold = now.getTime() - idleDays * MS_PER_DAY;
  return updated < threshold;
}

export function getHealth(
  project: Project,
  idleDays: number,
  now = new Date(),
): HealthSignal {
  if (isAtRisk(project, now)) return 'at_risk';
  if (isIdle(project, idleDays, now)) return 'idle';
  return null;
}

export function daysUntilDeadline(project: Project, now = new Date()): number | null {
  if (!project.deadline) return null;
  const deadline = startOfDay(new Date(project.deadline));
  const today = startOfDay(now);
  return Math.ceil((deadline.getTime() - today.getTime()) / MS_PER_DAY);
}
