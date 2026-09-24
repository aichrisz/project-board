import type { ActivityEvent, Project } from '../types';
import { isCanonicalInstant } from './focusSession';
import { isTerminal } from './health';
import {
  getBlocker,
  getFocusProjects,
  getFreshness,
  getNextAction,
  type Freshness,
} from './projectSignals';

const MILESTONE_PATTERN = /^milestone\s+(\d{4})-(\d{2})-(\d{2})\s*:\s*(\S.*)$/i;
const COMPLETED_STEP_PREFIX = 'Completed step ';
const ALL_STEPS_DONE_PREFIX = 'Marked all steps done on ';
const STATUS_DONE_PATTERN = /→\s*done$/i;
const ATTENTION_LIMIT = 5;
const WINS_LIMIT = 5;

export type DigestFocusItem = {
  projectId: string;
  title: string;
  nextAction: string | null;
  blocker: string | null;
  freshness: Freshness | null;
};

export type DigestAttentionItem = {
  projectId: string;
  title: string;
  blocker: string | null;
  freshness: Freshness | null;
};

export type DigestWin = {
  key: string;
  at: string;
  projectId?: string;
  text: string;
};

export function deriveKeepMoving(projects: Project[]): DigestFocusItem[] {
  return getFocusProjects(projects).projects.map((project) => ({
    projectId: project.id,
    title: project.title,
    nextAction: getNextAction(project)?.title ?? null,
    blocker: getBlocker(project),
    freshness: getFreshness(project),
  }));
}

function attentionSeverity(
  blocker: string | null,
  freshness: Freshness | null,
): number {
  if (blocker && freshness === 'Review') return 0;
  if (blocker) return 1;
  if (freshness === 'Review') return 2;
  return 3;
}

export function deriveNeedsAttention(projects: Project[]): DigestAttentionItem[] {
  return projects
    .filter((project) => !isTerminal(project.status))
    .map((project) => ({
      project,
      blocker: getBlocker(project),
      freshness: getFreshness(project),
    }))
    .filter((item) => item.blocker !== null || item.freshness !== null)
    .sort((a, b) => {
      const severityDifference =
        attentionSeverity(a.blocker, a.freshness) -
        attentionSeverity(b.blocker, b.freshness);
      if (severityDifference !== 0) return severityDifference;

      const aUpdated = new Date(a.project.updated_at).getTime();
      const bUpdated = new Date(b.project.updated_at).getTime();
      const aInvalid = Number.isNaN(aUpdated);
      const bInvalid = Number.isNaN(bUpdated);

      if (aInvalid !== bInvalid) return aInvalid ? 1 : -1;
      if (!aInvalid && aUpdated !== bUpdated) return bUpdated - aUpdated;
      return a.project.id.localeCompare(b.project.id);
    })
    .slice(0, ATTENTION_LIMIT)
    .map((item) => ({
      projectId: item.project.id,
      title: item.project.title,
      blocker: item.blocker,
      freshness: item.freshness,
    }));
}

function timestampValue(at: string): number {
  const value = Date.parse(at);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function milestoneWins(projects: Project[]): DigestWin[] {
  const wins: DigestWin[] = [];

  for (const project of projects) {
    for (const line of project.notes_md.split(/\r?\n/)) {
      const match = line.trim().match(MILESTONE_PATTERN);
      if (!match) continue;

      const text = match[4].trim();
      const at = `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
      if (!text || !isCanonicalInstant(at)) continue;

      const date = `${match[1]}-${match[2]}-${match[3]}`;
      wins.push({
        key: `milestone:${project.id}:${date}:${text}`,
        at,
        projectId: project.id,
        text,
      });
    }
  }

  return wins;
}

function isActivityWin(event: ActivityEvent): boolean {
  if (!isCanonicalInstant(event.at)) return false;
  if (event.type === 'step_toggled') {
    return (
      event.message.startsWith(COMPLETED_STEP_PREFIX) ||
      event.message.startsWith(ALL_STEPS_DONE_PREFIX)
    );
  }
  return (
    event.type === 'status_changed' &&
    STATUS_DONE_PATTERN.test(event.message.trim())
  );
}

function activityWins(activity: ActivityEvent[]): DigestWin[] {
  const wins: DigestWin[] = [];

  for (const event of activity) {
    if (!isActivityWin(event)) continue;

    wins.push({
      key: `activity:${event.id}`,
      at: event.at,
      projectId: event.projectId,
      text: event.message,
    });
  }

  return wins;
}

export function deriveLatestWins(
  projects: Project[],
  activity: ActivityEvent[],
): DigestWin[] {
  const unique = new Map<string, DigestWin>();
  for (const win of [...milestoneWins(projects), ...activityWins(activity)]) {
    if (!unique.has(win.key)) unique.set(win.key, win);
  }

  return [...unique.values()]
    .sort((a, b) => {
      const difference = timestampValue(b.at) - timestampValue(a.at);
      if (difference !== 0) return difference;
      return a.key.localeCompare(b.key);
    })
    .slice(0, WINS_LIMIT);
}
