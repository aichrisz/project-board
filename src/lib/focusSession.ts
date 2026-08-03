import type {
  ActiveFocusSession,
  FocusOutcome,
  FocusSessionRecord,
  FocusState,
} from '../types';

export const FOCUS_PRESETS = [15, 25, 45, 60] as const;
export type FocusPreset = (typeof FOCUS_PRESETS)[number];
export const DEFAULT_FOCUS_PRESET: FocusPreset = 25;
export const FOCUS_HISTORY_CAP = 250;
export const MAX_FOCUS_NOTE_CHARS = 200;
export const DEFAULT_FOCUS_STATE: FocusState = { active: null, history: [] };

export const CANONICAL_INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isValidCalendarDate(text: string): boolean {
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

export function isFocusPreset(value: unknown): value is FocusPreset {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (FOCUS_PRESETS as readonly number[]).includes(value)
  );
}

export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_INSTANT_RE.test(value)) {
    return false;
  }
  return isValidCalendarDate(value) && Number.isFinite(Date.parse(value));
}

export function toCanonicalInstant(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new Error('Focus instant must be finite.');
  }
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Focus instant is outside the supported date range.');
  }
  return date.toISOString();
}

export function getRemainingSeconds(
  endsAt: string,
  nowMs = Date.now(),
): number {
  if (!isCanonicalInstant(endsAt) || !Number.isFinite(nowMs)) return 0;
  const endsAtMs = Date.parse(endsAt);
  if (!Number.isFinite(endsAtMs)) return 0;
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1_000));
}

export function isReadyToResolve(
  active: ActiveFocusSession | null,
  nowMs = Date.now(),
): boolean {
  if (!active) return false;
  return active.stoppedAt !== undefined || getRemainingSeconds(active.endsAt, nowMs) === 0;
}

export function focusPhase(input: {
  active: ActiveFocusSession | null;
  projectId: string;
  nowMs: number;
}): 'setup' | 'running' | 'resolve' {
  if (!input.active || input.active.projectId !== input.projectId) return 'setup';
  if (isReadyToResolve(input.active, input.nowMs)) return 'resolve';
  return 'running';
}

export function createActiveSession(input: {
  id: string;
  projectId: string;
  stepId?: string;
  plannedMinutes: FocusPreset;
  startedAtMs?: number;
}): ActiveFocusSession {
  if (!isFocusPreset(input.plannedMinutes)) {
    throw new Error('Focus preset is invalid.');
  }
  const startedAtMs = input.startedAtMs ?? Date.now();
  if (!Number.isFinite(startedAtMs)) {
    throw new Error('Focus start instant must be finite.');
  }
  const active: ActiveFocusSession = {
    id: input.id,
    projectId: input.projectId,
    startedAt: toCanonicalInstant(startedAtMs),
    endsAt: toCanonicalInstant(
      startedAtMs + input.plannedMinutes * 60_000,
    ),
    plannedMinutes: input.plannedMinutes,
  };
  if (input.stepId !== undefined) active.stepId = input.stepId;
  return active;
}

export function normalizeFocusNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const note = value.trim();
  return note || undefined;
}

export function isValidFocusNote(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const note = value.trim();
  return note.length >= 1 && note.length <= MAX_FOCUS_NOTE_CHARS;
}

export type FocusProjectRef = {
  id: string;
  steps: readonly { id: string; done: boolean }[];
};

export function canMarkLinkedStepDone(input: {
  projects: readonly FocusProjectRef[];
  active: ActiveFocusSession | null;
}): boolean {
  if (!input.active?.stepId) return false;
  const project = input.projects.find((candidate) => candidate.id === input.active?.projectId);
  const step = project?.steps.find((candidate) => candidate.id === input.active?.stepId);
  return step?.done === false;
}

export function clampToSessionWindow(input: {
  active: ActiveFocusSession;
  nowMs: number;
}): number {
  const startedAtMs = Date.parse(input.active.startedAt);
  const endsAtMs = Date.parse(input.active.endsAt);
  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(endsAtMs) ||
    !Number.isFinite(input.nowMs)
  ) {
    throw new Error('Focus session boundary is invalid.');
  }
  return Math.min(Math.max(input.nowMs, startedAtMs), endsAtMs);
}

export function focusBoundaryMs(
  active: ActiveFocusSession,
  nowMs = Date.now(),
): number {
  if (active.stoppedAt !== undefined) {
    const stoppedAtMs = Date.parse(active.stoppedAt);
    if (Number.isFinite(stoppedAtMs)) return stoppedAtMs;
  }
  return clampToSessionWindow({ active, nowMs });
}

export function resolveOutcome(input: {
  active: ActiveFocusSession;
  markStepDone: boolean;
  canMarkStepDone: boolean;
  nowMs?: number;
}): 'completed' | 'stopped' | 'expired' {
  if (input.markStepDone && input.canMarkStepDone) return 'completed';
  if (input.active.stoppedAt !== undefined) return 'stopped';
  const nowMs = input.nowMs ?? Date.now();
  const endsAtMs = Date.parse(input.active.endsAt);
  return Number.isFinite(nowMs) && Number.isFinite(endsAtMs) && nowMs >= endsAtMs
    ? 'expired'
    : 'stopped';
}

export function expectedElapsedSeconds(input: {
  startedAtMs: number;
  endedAtMs: number;
  plannedMinutes: FocusPreset;
}): number {
  if (
    !Number.isFinite(input.startedAtMs) ||
    !Number.isFinite(input.endedAtMs) ||
    !isFocusPreset(input.plannedMinutes)
  ) {
    return 0;
  }
  const seconds = (input.endedAtMs - input.startedAtMs) / 1_000;
  return Math.floor(Math.min(Math.max(seconds, 0), input.plannedMinutes * 60));
}

export function elapsedSecondsFor(input: {
  active: ActiveFocusSession;
  endedAtMs: number;
}): number {
  return expectedElapsedSeconds({
    startedAtMs: Date.parse(input.active.startedAt),
    endedAtMs: input.endedAtMs,
    plannedMinutes: input.active.plannedMinutes,
  });
}

export function finalizeSession(input: {
  active: ActiveFocusSession;
  outcome: FocusOutcome;
  note?: string;
  endedAtMs: number;
}): FocusSessionRecord {
  const startedAtMs = Date.parse(input.active.startedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(input.endedAtMs)) {
    throw new Error('Focus session record boundary is invalid.');
  }
  if (input.endedAtMs < startedAtMs) {
    throw new Error('Focus session record ended before it started.');
  }
  const endedAtMs =
    input.outcome === 'expired'
      ? startedAtMs + input.active.plannedMinutes * 60_000
      : input.endedAtMs;
  const record: FocusSessionRecord = {
    id: input.active.id,
    projectId: input.active.projectId,
    startedAt: input.active.startedAt,
    endedAt: toCanonicalInstant(endedAtMs),
    plannedMinutes: input.active.plannedMinutes,
    elapsedSeconds: expectedElapsedSeconds({
      startedAtMs,
      endedAtMs,
      plannedMinutes: input.active.plannedMinutes,
    }),
    outcome: input.outcome,
  };
  if (input.active.stepId !== undefined) record.stepId = input.active.stepId;
  const note = normalizeFocusNote(input.note);
  if (note !== undefined && isValidFocusNote(note)) record.note = note;
  return record;
}

export function sortFocusHistory(
  history: readonly FocusSessionRecord[],
): FocusSessionRecord[] {
  return [...history].sort((a, b) => {
    const endedDifference = Date.parse(b.endedAt) - Date.parse(a.endedAt);
    if (endedDifference !== 0) return endedDifference;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function dedupeFocusHistory(
  history: readonly FocusSessionRecord[],
): FocusSessionRecord[] {
  const seen = new Set<string>();
  return sortFocusHistory(history).filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function addFocusRecord(
  history: readonly FocusSessionRecord[],
  record: FocusSessionRecord,
): FocusSessionRecord[] {
  return dedupeFocusHistory([...history, record]).slice(0, FOCUS_HISTORY_CAP);
}

export function mergeFocusHistories(
  local: readonly FocusSessionRecord[],
  incoming: readonly FocusSessionRecord[],
): FocusSessionRecord[] {
  const byId = new Map<string, FocusSessionRecord>();
  for (const record of dedupeFocusHistory(local)) byId.set(record.id, record);
  for (const record of dedupeFocusHistory(incoming)) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return sortFocusHistory([...byId.values()]).slice(0, FOCUS_HISTORY_CAP);
}

export function pruneFocusState(
  state: FocusState,
  projects: readonly FocusProjectRef[],
): FocusState {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  let nextActive = state.active;
  let activeChanged = false;

  if (state.active) {
    const project = projectById.get(state.active.projectId);
    if (!project) {
      nextActive = null;
      activeChanged = true;
    } else if (state.active.stepId !== undefined) {
      const step = project.steps.find((candidate) => candidate.id === state.active?.stepId);
      if (!step || step.done) {
        nextActive = { ...state.active };
        delete nextActive.stepId;
        activeChanged = true;
      }
    }
  }

  let historyChanged = false;
  const nextHistory: FocusSessionRecord[] = [];
  for (const record of state.history) {
    const project = projectById.get(record.projectId);
    if (!project) {
      historyChanged = true;
      continue;
    }
    if (record.stepId !== undefined && !project.steps.some((step) => step.id === record.stepId)) {
      const nextRecord = { ...record };
      delete nextRecord.stepId;
      nextHistory.push(nextRecord);
      historyChanged = true;
      continue;
    }
    nextHistory.push(record);
  }

  if (!activeChanged && !historyChanged) return state;
  return {
    active: nextActive,
    history: historyChanged ? nextHistory : state.history,
  };
}

export function startOfLocalWeek(now = new Date()): Date {
  const start = new Date(now);
  const day = start.getDay();
  const daysFromMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + daysFromMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

function recordsInLocalWeek(
  history: readonly FocusSessionRecord[],
  options: { projectId?: string; now?: Date } = {},
): FocusSessionRecord[] {
  const start = startOfLocalWeek(options.now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return history.filter((record) => {
    if (options.projectId !== undefined && record.projectId !== options.projectId) {
      return false;
    }
    const endedAtMs = Date.parse(record.endedAt);
    return endedAtMs >= start.getTime() && endedAtMs < end.getTime();
  });
}

export function focusMinutesInLocalWeek(
  history: readonly FocusSessionRecord[],
  options: { projectId?: string; now?: Date } = {},
): number {
  const seconds = recordsInLocalWeek(history, options).reduce(
    (total, record) => total + record.elapsedSeconds,
    0,
  );
  return Math.round(seconds / 60);
}

export function focusWeekSummary(
  history: readonly FocusSessionRecord[],
  options: { projectId?: string; now?: Date } = {},
): {
  minutes: number;
  sessions: number;
  completed: number;
  stopped: number;
  expired: number;
} {
  const records = recordsInLocalWeek(history, options);
  return {
    minutes: Math.round(
      records.reduce((total, record) => total + record.elapsedSeconds, 0) / 60,
    ),
    sessions: records.length,
    completed: records.filter((record) => record.outcome === 'completed').length,
    stopped: records.filter((record) => record.outcome === 'stopped').length,
    expired: records.filter((record) => record.outcome === 'expired').length,
  };
}

function isFocusObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeActiveFocus(raw: unknown): ActiveFocusSession | null {
  if (raw === null || raw === undefined || !isFocusObject(raw)) return null;
  if (!isNonBlankString(raw.id) || !isNonBlankString(raw.projectId)) return null;
  if (!isFocusPreset(raw.plannedMinutes)) return null;
  if (!isCanonicalInstant(raw.startedAt) || !isCanonicalInstant(raw.endsAt)) return null;

  const startedAtMs = Date.parse(raw.startedAt);
  const endsAtMs = Date.parse(raw.endsAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startedAtMs) {
    return null;
  }

  const active: ActiveFocusSession = {
    id: raw.id,
    projectId: raw.projectId,
    startedAt: raw.startedAt,
    endsAt: raw.endsAt,
    plannedMinutes: raw.plannedMinutes,
  };
  if (isNonBlankString(raw.stepId)) active.stepId = raw.stepId;

  if (raw.stoppedAt !== undefined) {
    const stoppedAt = raw.stoppedAt;
    if (isCanonicalInstant(stoppedAt)) {
      const stoppedAtMs = Date.parse(stoppedAt);
      if (
        Number.isFinite(stoppedAtMs) &&
        stoppedAtMs >= startedAtMs &&
        stoppedAtMs <= endsAtMs
      ) {
        active.stoppedAt = stoppedAt;
      }
    }
  }
  return active;
}

function normalizeFocusRecord(raw: unknown): FocusSessionRecord | null {
  if (!isFocusObject(raw)) return null;
  if (!isNonBlankString(raw.id) || !isNonBlankString(raw.projectId)) return null;
  if (!isFocusPreset(raw.plannedMinutes)) return null;
  if (raw.outcome !== 'completed' && raw.outcome !== 'stopped' && raw.outcome !== 'expired') {
    return null;
  }
  if (!isCanonicalInstant(raw.startedAt) || !isCanonicalInstant(raw.endedAt)) return null;
  if (
    typeof raw.elapsedSeconds !== 'number' ||
    !Number.isInteger(raw.elapsedSeconds) ||
    raw.elapsedSeconds < 0 ||
    raw.elapsedSeconds > raw.plannedMinutes * 60
  ) {
    return null;
  }
  const startedAtMs = Date.parse(raw.startedAt);
  const endedAtMs = Date.parse(raw.endedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) {
    return null;
  }
  if (
    raw.elapsedSeconds !==
    expectedElapsedSeconds({
      startedAtMs,
      endedAtMs,
      plannedMinutes: raw.plannedMinutes,
    })
  ) {
    return null;
  }
  if (
    raw.outcome === 'expired' &&
    (endedAtMs !== startedAtMs + raw.plannedMinutes * 60_000 ||
      raw.elapsedSeconds !== raw.plannedMinutes * 60)
  ) {
    return null;
  }
  if (raw.stepId !== undefined && !isNonBlankString(raw.stepId)) return null;
  if (raw.note !== undefined && !isValidFocusNote(raw.note)) {
    return null;
  }

  const record: FocusSessionRecord = {
    id: raw.id,
    projectId: raw.projectId,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    plannedMinutes: raw.plannedMinutes,
    elapsedSeconds: raw.elapsedSeconds,
    outcome: raw.outcome,
  };
  if (raw.stepId !== undefined) record.stepId = raw.stepId;
  const note = normalizeFocusNote(raw.note);
  if (note !== undefined) record.note = note;
  return record;
}

export function normalizeFocusState(raw: unknown): FocusState {
  if (!isFocusObject(raw)) return DEFAULT_FOCUS_STATE;

  const active = normalizeActiveFocus(raw.active);
  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const history = rawHistory
    .map((record) => normalizeFocusRecord(record))
    .filter((record): record is FocusSessionRecord => record !== null);
  return {
    active,
    history: dedupeFocusHistory(history).slice(0, FOCUS_HISTORY_CAP),
  };
}

export function hydrateFocusState<P extends FocusProjectRef>(input: {
  raw: unknown;
  hydratedProjects: readonly P[];
}): FocusState {
  return pruneFocusState(normalizeFocusState(input.raw), input.hydratedProjects);
}

export function mergeFocusState<P extends FocusProjectRef>(input: {
  local: FocusState;
  incoming: FocusState;
  projects: readonly P[];
  mode: 'replace' | 'merge';
}): FocusState {
  const state =
    input.mode === 'replace'
      ? input.incoming
      : {
          active: input.local.active,
          history: mergeFocusHistories(
            input.local.history,
            input.incoming.history,
          ),
        };
  return pruneFocusState(state, input.projects);
}

export type FocusEventDescriptor =
  | { kind: 'focus_session'; projectId: string; record: FocusSessionRecord }
  | {
      kind: 'step_toggled';
      projectId: string;
      stepId: string;
      stepTitle: string;
      done: true;
    };

export interface FocusTransition<P> {
  nextProjects: readonly P[];
  nextFocus: FocusState;
  record: FocusSessionRecord | null;
  events: FocusEventDescriptor[];
}

export type FocusStartRejection =
  | { reason: 'missing_project' }
  | { reason: 'invalid_preset' };

function focusSessionEvent(record: FocusSessionRecord): FocusEventDescriptor {
  return { kind: 'focus_session', projectId: record.projectId, record };
}

function validStepForProject<P extends FocusProjectRef>(
  project: P,
  stepId: string | undefined,
): string | undefined {
  if (stepId === undefined) return undefined;
  return project.steps.some((step) => step.id === stepId && step.done === false)
    ? stepId
    : undefined;
}

function activeAfterStart<P extends FocusProjectRef>(
  project: P,
  request: {
    id: string;
    projectId: string;
    stepId?: string;
    plannedMinutes: FocusPreset;
  },
  nowMs: number,
): ActiveFocusSession {
  const stepId = validStepForProject(project, request.stepId);
  return createActiveSession({
    id: request.id,
    projectId: request.projectId,
    ...(stepId === undefined ? {} : { stepId }),
    plannedMinutes: request.plannedMinutes,
    startedAtMs: nowMs,
  });
}

export function applyFocusStart<P extends FocusProjectRef>(input: {
  projects: readonly P[];
  focus: FocusState;
  request: {
    id: string;
    projectId: string;
    stepId?: string;
    plannedMinutes: FocusPreset;
  };
  nowMs: number;
}): FocusTransition<P> | FocusStartRejection {
  const project = input.projects.find((candidate) => candidate.id === input.request.projectId);
  if (!project) return { reason: 'missing_project' };
  if (!isFocusPreset(input.request.plannedMinutes)) return { reason: 'invalid_preset' };

  let history = input.focus.history;
  let record: FocusSessionRecord | null = null;
  const events: FocusEventDescriptor[] = [];
  if (input.focus.active) {
    const active = input.focus.active;
    record = finalizeSession({
      active,
      outcome: 'stopped',
      endedAtMs: focusBoundaryMs(active, input.nowMs),
    });
    history = addFocusRecord(history, record);
    events.push(focusSessionEvent(record));
  }

  return {
    nextProjects: input.projects,
    nextFocus: {
      active: activeAfterStart(project, input.request, input.nowMs),
      history,
    },
    record,
    events,
  };
}

export function applyFocusStop<P extends FocusProjectRef>(input: {
  projects: readonly P[];
  focus: FocusState;
  nowMs: number;
}): FocusTransition<P> | null {
  const active = input.focus.active;
  if (!active) return null;
  if (active.stoppedAt !== undefined) {
    return {
      nextProjects: input.projects,
      nextFocus: input.focus,
      record: null,
      events: [],
    };
  }
  const stoppedAt = toCanonicalInstant(clampToSessionWindow({ active, nowMs: input.nowMs }));
  return {
    nextProjects: input.projects,
    nextFocus: {
      active: { ...active, stoppedAt },
      history: input.focus.history,
    },
    record: null,
    events: [],
  };
}

export function applyFocusFinalize<P extends FocusProjectRef>(input: {
  projects: readonly P[];
  focus: FocusState;
  markStepDone?: boolean;
  note?: string;
  nowMs: number;
  toggleStepInProjects: (
    projects: readonly P[],
    projectId: string,
    stepId: string,
  ) => readonly P[];
}): FocusTransition<P> | null {
  const active = input.focus.active;
  if (!active) return null;
  const canMarkStepDone = canMarkLinkedStepDone({
    projects: input.projects,
    active,
  });
  const outcome = resolveOutcome({
    active,
    markStepDone: input.markStepDone === true,
    canMarkStepDone,
    nowMs: input.nowMs,
  });
  const endedAtMs = focusBoundaryMs(active, input.nowMs);
  const record = finalizeSession({
    active,
    outcome,
    note: input.note,
    endedAtMs,
  });
  let nextProjects = input.projects;
  const events: FocusEventDescriptor[] = [];
  if (outcome === 'completed' && active.stepId !== undefined) {
    const project = input.projects.find((candidate) => candidate.id === active.projectId);
    const step = project?.steps.find((candidate) => candidate.id === active.stepId);
    nextProjects = input.toggleStepInProjects(input.projects, active.projectId, active.stepId);
    events.push({
      kind: 'step_toggled',
      projectId: active.projectId,
      stepId: active.stepId,
      stepTitle:
        step && 'title' in step && typeof step.title === 'string' ? step.title : '',
      done: true,
    });
  }
  events.push(focusSessionEvent(record));
  return {
    nextProjects,
    nextFocus: {
      active: null,
      history: addFocusRecord(input.focus.history, record),
    },
    record,
    events,
  };
}

export function applyFocusKeepWorking<P extends FocusProjectRef>(input: {
  projects: readonly P[];
  focus: FocusState;
  next: { id: string; plannedMinutes: FocusPreset };
  note?: string;
  nowMs: number;
}): FocusTransition<P> | null {
  const active = input.focus.active;
  if (!active || !isFocusPreset(input.next.plannedMinutes)) return null;
  const record = finalizeSession({
    active,
    outcome: resolveOutcome({
      active,
      markStepDone: false,
      canMarkStepDone: false,
      nowMs: input.nowMs,
    }),
    note: input.note,
    endedAtMs: focusBoundaryMs(active, input.nowMs),
  });
  const project = input.projects.find((candidate) => candidate.id === active.projectId);
  if (!project) return null;
  const stepId = validStepForProject(project, active.stepId);
  const nextActive = createActiveSession({
    id: input.next.id,
    projectId: active.projectId,
    ...(stepId === undefined ? {} : { stepId }),
    plannedMinutes: input.next.plannedMinutes,
    startedAtMs: input.nowMs,
  });
  return {
    nextProjects: input.projects,
    nextFocus: {
      active: nextActive,
      history: addFocusRecord(input.focus.history, record),
    },
    record,
    events: [focusSessionEvent(record)],
  };
}
