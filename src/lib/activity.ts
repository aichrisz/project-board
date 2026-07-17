import type { ActivityEvent } from '../types';
import { ACTIVITY_CAP } from '../types';

export const ACTIVITY_KEY = 'project-board-activity-v1';

export function loadActivity(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ActivityEvent =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as ActivityEvent).id === 'string' &&
          typeof (e as ActivityEvent).at === 'string' &&
          typeof (e as ActivityEvent).type === 'string' &&
          typeof (e as ActivityEvent).message === 'string',
      )
      .slice(0, ACTIVITY_CAP);
  } catch {
    return [];
  }
}

export function saveActivity(events: ActivityEvent[]): void {
  localStorage.setItem(
    ACTIVITY_KEY,
    JSON.stringify(events.slice(0, ACTIVITY_CAP)),
  );
}

export function clearActivity(): void {
  localStorage.removeItem(ACTIVITY_KEY);
}

export function prependActivity(
  existing: ActivityEvent[],
  event: ActivityEvent,
): ActivityEvent[] {
  return [event, ...existing].slice(0, ACTIVITY_CAP);
}
