import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SEED_PROJECTS } from '../data/seed';
import {
  loadActivity,
  prependActivity,
  prependActivityEvents,
  saveActivity,
} from '../lib/activity';
import { downloadJson, parseImportJson, toExportJson } from '../lib/export';
import {
  DEFAULT_FOCUS_STATE,
  applyFocusFinalize,
  applyFocusKeepWorking,
  applyFocusStart,
  applyFocusStop,
  canMarkLinkedStepDone,
  hydrateFocusState,
  mergeFocusState,
  pruneFocusState,
  type FocusEventDescriptor,
  type FocusPreset,
} from '../lib/focusSession';
import { isIdle } from '../lib/health';
import { createId, slugify } from '../lib/id';
import { withAutoProgress } from '../lib/progress';
import { loadStorage, migrateProject, saveStorage } from '../lib/storage';
import { applyTheme } from '../lib/theme';
import type {
  ActivityEvent,
  ActiveFocusSession,
  AppSettings,
  FocusSessionRecord,
  FocusState,
  LinkItem,
  Project,
  ProjectStatus,
  ProjectType,
  Step,
  StorageBlob,
  ThemeMode,
} from '../types';
import { DEFAULT_SETTINGS, STATUS_LABELS } from '../types';

export type ImportMode = 'replace' | 'merge';

export type ImportOptions = {
  mode: ImportMode;
  /** When merging, also apply imported settings (default false). Replace always applies settings. */
  applySettings?: boolean;
};

export type ProjectInput = {
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  summary?: string;
  progress_pct?: number;
  steps?: Step[];
  notes_md?: string;
  links?: LinkItem[];
  tags?: string[];
  deadline?: string | null;
  stack?: string[];
};

type ProjectContextValue = {
  projects: Project[];
  settings: AppSettings;
  activity: ActivityEvent[];
  focus: FocusState;
  ready: boolean;
  getProject: (id: string) => Project | undefined;
  createProject: (input: ProjectInput) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => Project | undefined;
  toggleStep: (projectId: string, stepId: string) => void;
  addStep: (projectId: string, title: string) => void;
  removeStep: (projectId: string, stepId: string) => void;
  reorderSteps: (projectId: string, orderedIds: string[]) => void;
  setAllStepsDone: (projectId: string, done: boolean) => void;
  removeCompletedSteps: (projectId: string) => void;
  softArchiveIdle: () => number;
  setShowCompleted: (value: boolean) => void;
  setIdleDays: (value: number) => void;
  setTheme: (value: ThemeMode) => void;
  exportData: () => void;
  importData: (jsonText: string, options?: ImportOptions) => void;
  loadSeed: (mode: 'merge' | 'replace') => void;
  resetAll: () => void;
  startFocusSession: (input: {
    projectId: string;
    stepId?: string;
    plannedMinutes: FocusPreset;
  }) => { started: boolean; replacedActive: boolean };
  stopFocusSession: () => boolean;
  finalizeActiveFocus: (input: {
    markStepDone?: boolean;
    note?: string;
  }) => FocusSessionRecord | null;
  keepWorkingFocus: (input: {
    plannedMinutes: FocusPreset;
    note?: string;
  }) => { record: FocusSessionRecord | null; active: ActiveFocusSession | null };
  canMarkFocusStepDone: boolean;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProject(project: Project): Project {
  return migrateProject(withAutoProgress(project));
}

function toggleStepInProjects(
  projects: readonly Project[],
  projectId: string,
  stepId: string,
): readonly Project[] {
  return projects.map((project) => {
    if (project.id !== projectId) return project;
    return normalizeProject({
      ...project,
      steps: project.steps.map((step) =>
        step.id === stepId ? { ...step, done: true } : step,
      ),
      updated_at: nowIso(),
    });
  });
}

function makeActivity(
  type: ActivityEvent['type'],
  message: string,
  projectId?: string,
): ActivityEvent {
  return {
    id: createId('act'),
    at: nowIso(),
    type,
    projectId,
    message,
  };
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [focus, setFocus] = useState<FocusState>(DEFAULT_FOCUS_STATE);
  const [ready, setReady] = useState(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const activityRef = useRef(activity);
  activityRef.current = activity;

  const pushActivity = useCallback((event: ActivityEvent) => {
    const next = prependActivity(activityRef.current, event);
    activityRef.current = next;
    setActivity(next);
    saveActivity(next);
  }, []);

  const focusActivityMessage = useCallback(
    (descriptor: Extract<FocusEventDescriptor, { kind: 'focus_session' }>, events: readonly FocusEventDescriptor[]) => {
      const record = descriptor.record;
      const project = projectsRef.current.find((item) => item.id === record.projectId);
      const projectTitle = project?.title ?? record.projectId;
      let message: string;
      if (record.outcome === 'completed') {
        const stepEvent = events.find(
          (event): event is Extract<FocusEventDescriptor, { kind: 'step_toggled' }> =>
            event.kind === 'step_toggled' &&
            event.projectId === record.projectId &&
            event.stepId === record.stepId,
        );
        const stepTitle = stepEvent?.stepTitle ?? record.stepId ?? 'step';
        message = `Focus ${record.plannedMinutes}m on “${projectTitle}” — step “${stepTitle}” done`;
      } else if (record.outcome === 'expired') {
        message = `Focus ${record.plannedMinutes}m on “${projectTitle}” — timer complete`;
      } else {
        const elapsedMinutes = Math.floor(record.elapsedSeconds / 60);
        message = `Focus ${elapsedMinutes}m of ${record.plannedMinutes}m on “${projectTitle}” — stopped early`;
      }
      return record.note ? `${message} · note saved` : message;
    },
    [],
  );

  const appendActivityEvents = useCallback(
    (events: readonly FocusEventDescriptor[]) => {
      if (events.length === 0) return;
      const activityEvents = events.map((descriptor) => {
        if (descriptor.kind === 'step_toggled') {
          const project = projectsRef.current.find(
            (item) => item.id === descriptor.projectId,
          );
          return makeActivity(
            'step_toggled',
            descriptor.done
              ? `Completed step “${descriptor.stepTitle}” on “${project?.title ?? descriptor.projectId}”`
              : `Reopened step “${descriptor.stepTitle}” on “${project?.title ?? descriptor.projectId}”`,
            descriptor.projectId,
          );
        }
        return makeActivity(
          'focus_session',
          focusActivityMessage(descriptor, events),
          descriptor.projectId,
        );
      });
      const next = prependActivityEvents(activityRef.current, activityEvents);
      activityRef.current = next;
      setActivity(next);
      saveActivity(next);
    },
    [focusActivityMessage],
  );

  const commitProjectSnapshot = useCallback(
    (nextProjects: Project[], nextFocus: FocusState = pruneFocusState(focusRef.current, nextProjects)) => {
      const previousFocus = focusRef.current;
      projectsRef.current = nextProjects;
      focusRef.current = nextFocus;
      setProjects(nextProjects);
      if (nextFocus !== previousFocus) setFocus(nextFocus);
    },
    [],
  );

  useEffect(() => {
    const stored = loadStorage();
    const hydratedProjects = stored
      ? stored.projects.map(normalizeProject)
      : [];
    const hydratedFocus = hydrateFocusState({
      raw: stored?.focus,
      hydratedProjects,
    });
    const hydratedActivity = loadActivity();
    projectsRef.current = hydratedProjects;
    focusRef.current = hydratedFocus;
    activityRef.current = hydratedActivity;
    if (stored) {
      setProjects(hydratedProjects);
      setSettings({ ...DEFAULT_SETTINGS, ...stored.settings });
    } else {
      // First visit: empty board so onboarding can run (no auto-seed)
      setProjects(hydratedProjects);
      setSettings(DEFAULT_SETTINGS);
    }
    setFocus(hydratedFocus);
    setActivity(hydratedActivity);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const blob: StorageBlob = { version: 1, projects, settings, focus };
    saveStorage(blob);
  }, [projects, settings, focus, ready]);

  useEffect(() => {
    if (!ready) return;
    applyTheme(settings.theme);
  }, [settings.theme, ready]);

  useEffect(() => {
    if (!ready || settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme, ready]);

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  const applyFocusTransition = useCallback(
    (transition: {
      nextProjects: readonly Project[];
      nextFocus: FocusState;
      record: FocusSessionRecord | null;
      events: FocusEventDescriptor[];
    }) => {
      const previousProjects = projectsRef.current;
      const nextProjects = transition.nextProjects as Project[];
      projectsRef.current = nextProjects;
      focusRef.current = transition.nextFocus;
      if (nextProjects !== previousProjects) setProjects(nextProjects);
      setFocus(transition.nextFocus);
      if (transition.events.length > 0) {
        appendActivityEvents(transition.events);
      }
    },
    [appendActivityEvents],
  );

  const startFocusSession = useCallback(
    (input: {
      projectId: string;
      stepId?: string;
      plannedMinutes: FocusPreset;
    }) => {
      const transition = applyFocusStart({
        projects: projectsRef.current,
        focus: focusRef.current,
        request: {
          ...input,
          id: createId('focus'),
        },
        nowMs: Date.now(),
      });
      if ('reason' in transition) {
        return { started: false, replacedActive: false };
      }
      applyFocusTransition(transition);
      return { started: true, replacedActive: transition.record !== null };
    },
    [applyFocusTransition],
  );

  const stopFocusSession = useCallback(() => {
    const transition = applyFocusStop({
      projects: projectsRef.current,
      focus: focusRef.current,
      nowMs: Date.now(),
    });
    if (!transition) return false;
    applyFocusTransition(transition);
    return true;
  }, [applyFocusTransition]);

  const finalizeActiveFocus = useCallback(
    (input: { markStepDone?: boolean; note?: string }) => {
      const transition = applyFocusFinalize({
        projects: projectsRef.current,
        focus: focusRef.current,
        markStepDone: input.markStepDone,
        note: input.note,
        nowMs: Date.now(),
        toggleStepInProjects,
      });
      if (!transition) return null;
      applyFocusTransition(transition);
      return transition.record;
    },
    [applyFocusTransition],
  );

  const keepWorkingFocus = useCallback(
    (input: { plannedMinutes: FocusPreset; note?: string }) => {
      const transition = applyFocusKeepWorking({
        projects: projectsRef.current,
        focus: focusRef.current,
        next: { id: createId('focus'), plannedMinutes: input.plannedMinutes },
        note: input.note,
        nowMs: Date.now(),
      });
      if (!transition) {
        return { record: null, active: focusRef.current.active };
      }
      applyFocusTransition(transition);
      return {
        record: transition.record,
        active: transition.nextFocus.active,
      };
    },
    [applyFocusTransition],
  );

  const createProject = useCallback(
    (input: ProjectInput): Project => {
      const ts = nowIso();
      const project = normalizeProject({
        id: createId('proj'),
        title: input.title.trim(),
        slug: slugify(input.title),
        type: input.type,
        status: input.status,
        summary: input.summary?.trim() ?? '',
        progress_pct: input.progress_pct ?? 0,
        steps: input.steps ?? [],
        notes_md: input.notes_md ?? '',
        links: input.links ?? [],
        tags: input.tags ?? [],
        deadline: input.deadline ?? null,
        stack: input.stack ?? [],
        created_at: ts,
        updated_at: ts,
        started_at: input.status === 'in_progress' ? ts : null,
        starred: false,
      });
      commitProjectSnapshot([project, ...projectsRef.current], focusRef.current);
      pushActivity(
        makeActivity(
          'project_created',
          `Created project “${project.title}”`,
          project.id,
        ),
      );
      return project;
    },
    [commitProjectSnapshot, pushActivity],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      const current = projectsRef.current.find((p) => p.id === id);
      if (!current) return;

      if (patch.status !== undefined && patch.status !== current.status) {
        pushActivity(
          makeActivity(
            'status_changed',
            `“${current.title}” → ${STATUS_LABELS[patch.status]}`,
            id,
          ),
        );
      }

      const nextProjects = projectsRef.current.map((p) => {
        if (p.id !== id) return p;
        const next = normalizeProject({
          ...p,
          ...patch,
          id: p.id,
          updated_at: nowIso(),
        });
        if (patch.title && patch.title !== p.title) {
          next.slug = slugify(patch.title);
        }
        if (patch.status === 'in_progress' && !p.started_at) {
          next.started_at = nowIso();
        }
        return next;
      });
      const nextFocus =
        patch.steps === undefined
          ? focusRef.current
          : pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
    },
    [commitProjectSnapshot, pushActivity],
  );

  const deleteProject = useCallback(
    (id: string) => {
      const current = projectsRef.current.find((p) => p.id === id);
      if (current) {
        pushActivity(
          makeActivity(
            'project_deleted',
            `Deleted project “${current.title}”`,
            id,
          ),
        );
      }
      const nextProjects = projectsRef.current.filter((p) => p.id !== id);
      const nextFocus = pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
    },
    [commitProjectSnapshot, pushActivity],
  );

  const duplicateProject = useCallback(
    (id: string): Project | undefined => {
      const source = projectsRef.current.find((p) => p.id === id);
      if (!source) return undefined;
      const ts = nowIso();
      const newTitle = `${source.title} (copy)`;
      const project = normalizeProject({
        id: createId('proj'),
        title: newTitle,
        slug: slugify(newTitle),
        type: source.type,
        status: 'idea',
        summary: source.summary,
        progress_pct: 0,
        steps: source.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s, i) => ({
            id: createId('step'),
            title: s.title,
            done: false,
            order: i + 1,
          })),
        notes_md: source.notes_md,
        links: source.links.map((l) => ({
          id: createId('link'),
          label: l.label,
          url: l.url,
        })),
        tags: [...source.tags],
        deadline: source.deadline,
        stack: [...source.stack],
        created_at: ts,
        updated_at: ts,
        started_at: null,
        starred: false,
      });
      commitProjectSnapshot([project, ...projectsRef.current], focusRef.current);
      pushActivity(
        makeActivity(
          'project_created',
          `Duplicated “${source.title}” → “${project.title}”`,
          project.id,
        ),
      );
      return project;
    },
    [commitProjectSnapshot, pushActivity],
  );

  const toggleStep = useCallback(
    (projectId: string, stepId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const step = current.steps.find((s) => s.id === stepId);
      if (!step) return;
      const nextDone = !step.done;
      pushActivity(
        makeActivity(
          'step_toggled',
          nextDone
            ? `Completed step “${step.title}” on “${current.title}”`
            : `Reopened step “${step.title}” on “${current.title}”`,
          projectId,
        ),
      );
      const nextProjects = projectsRef.current.map((p) => {
        if (p.id !== projectId) return p;
        const steps = p.steps.map((s) =>
          s.id === stepId ? { ...s, done: !s.done } : s,
        );
        return normalizeProject({
          ...p,
          steps,
          updated_at: nowIso(),
        });
      });
      const nextFocus = pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
    },
    [commitProjectSnapshot, pushActivity],
  );

  const addStep = useCallback(
    (projectId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const order =
        current.steps.length === 0
          ? 1
          : Math.max(...current.steps.map((s) => s.order)) + 1;
      const steps = [
        ...current.steps,
        { id: createId('step'), title: trimmed, done: false, order },
      ];
      const nextProjects = projectsRef.current.map((p) =>
        p.id === projectId
          ? normalizeProject({ ...p, steps, updated_at: nowIso() })
          : p,
      );
      commitProjectSnapshot(nextProjects, focusRef.current);
    },
    [commitProjectSnapshot],
  );

  const removeStep = useCallback(
    (projectId: string, stepId: string) => {
      const nextProjects = projectsRef.current.map((p) =>
        p.id === projectId
          ? normalizeProject({
              ...p,
              steps: p.steps.filter((s) => s.id !== stepId),
              updated_at: nowIso(),
            })
          : p,
      );
      const nextFocus = pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
    },
    [commitProjectSnapshot],
  );

  const reorderSteps = useCallback(
    (projectId: string, orderedIds: string[]) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current || orderedIds.length === 0) return;

      const byId = new Map(current.steps.map((s) => [s.id, s]));
      // Only accept ids that exist; drop unknowns; append any missing at end
      const seen = new Set<string>();
      const ordered: typeof current.steps = [];
      for (const id of orderedIds) {
        const step = byId.get(id);
        if (step && !seen.has(id)) {
          ordered.push(step);
          seen.add(id);
        }
      }
      for (const step of current.steps) {
        if (!seen.has(step.id)) ordered.push(step);
      }

      // No-op if order unchanged (compare against sorted current order)
      const prevOrder = current.steps
        .slice()
        .sort((a, b) => a.order - b.order);
      const same =
        ordered.length === prevOrder.length &&
        ordered.every((s, i) => s.id === prevOrder[i]?.id);
      if (same) return;

      const steps = ordered.map((s, i) => ({ ...s, order: i + 1 }));
      const nextProjects = projectsRef.current.map((p) =>
        p.id === projectId
          ? normalizeProject({ ...p, steps, updated_at: nowIso() })
          : p,
      );
      commitProjectSnapshot(nextProjects, focusRef.current);
      pushActivity(
        makeActivity(
          'step_toggled',
          `Reordered steps on “${current.title}”`,
          projectId,
        ),
      );
    },
    [commitProjectSnapshot, pushActivity],
  );

  const setAllStepsDone = useCallback(
    (projectId: string, done: boolean) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current || current.steps.length === 0) return;
      const needsChange = current.steps.some((s) => s.done !== done);
      if (!needsChange) return;

      const nextProjects = projectsRef.current.map((p) =>
        p.id === projectId
          ? normalizeProject({
              ...p,
              steps: p.steps.map((s) => ({ ...s, done })),
              updated_at: nowIso(),
            })
          : p,
      );
      const nextFocus = pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
      pushActivity(
        makeActivity(
          'step_toggled',
          done
            ? `Marked all steps done on “${current.title}”`
            : `Cleared all step completion on “${current.title}”`,
          projectId,
        ),
      );
    },
    [commitProjectSnapshot, pushActivity],
  );

  const removeCompletedSteps = useCallback(
    (projectId: string) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current) return;
      const remaining = current.steps.filter((s) => !s.done);
      if (remaining.length === current.steps.length) return;
      const removed = current.steps.length - remaining.length;
      const steps = remaining
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i + 1 }));

      const nextProjects = projectsRef.current.map((p) =>
        p.id === projectId
          ? normalizeProject({ ...p, steps, updated_at: nowIso() })
          : p,
      );
      const nextFocus = pruneFocusState(focusRef.current, nextProjects);
      commitProjectSnapshot(nextProjects, nextFocus);
      pushActivity(
        makeActivity(
          'step_toggled',
          `Removed ${removed} completed step${removed === 1 ? '' : 's'} on “${current.title}”`,
          projectId,
        ),
      );
    },
    [commitProjectSnapshot, pushActivity],
  );

  const softArchiveIdle = useCallback((): number => {
    const idleDays = settings.idleDays;
    const idleIds = projectsRef.current
      .filter((p) => isIdle(p, idleDays))
      .map((p) => p.id);
    if (idleIds.length === 0) return 0;

    const idSet = new Set(idleIds);
    const ts = nowIso();
    const nextProjects = projectsRef.current.map((p) =>
      idSet.has(p.id)
        ? normalizeProject({
            ...p,
            status: 'archived',
            updated_at: ts,
          })
        : p,
    );
    commitProjectSnapshot(nextProjects, focusRef.current);
    pushActivity(
      makeActivity(
        'status_changed',
        `Soft-archived ${idleIds.length} idle in-progress project${idleIds.length === 1 ? '' : 's'}`,
      ),
    );
    return idleIds.length;
  }, [commitProjectSnapshot, pushActivity, settings.idleDays]);

  const setShowCompleted = useCallback((value: boolean) => {
    setSettings((s) => ({ ...s, showCompleted: value }));
  }, []);

  const setIdleDays = useCallback((value: number) => {
    setSettings((s) => ({
      ...s,
      idleDays: Math.min(90, Math.max(1, Math.round(value) || 14)),
    }));
  }, []);

  const setTheme = useCallback((value: ThemeMode) => {
    setSettings((s) => ({ ...s, theme: value }));
  }, []);

  const exportData = useCallback(() => {
    const exportedAt = nowIso();
    const nextSettings: AppSettings = {
      ...settings,
      lastExportAt: exportedAt,
    };
    const blob: StorageBlob = {
      version: 1,
      projects,
      settings: nextSettings,
      focus,
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`project-board-${date}.json`, toExportJson(blob));
    setSettings(nextSettings);
  }, [focus, projects, settings]);

  const importData = useCallback(
    (jsonText: string, options: ImportOptions = { mode: 'replace' }) => {
      const blob = parseImportJson(jsonText);
      const mode = options.mode ?? 'replace';

      if (mode === 'replace') {
        const incomingFocus = blob.focus ?? DEFAULT_FOCUS_STATE;
        const nextProjects = blob.projects.map(normalizeProject);
        const nextFocus = mergeFocusState({
          local: focusRef.current,
          incoming: incomingFocus,
          projects: nextProjects,
          mode: 'replace',
        });
        const focusContext =
          incomingFocus.active !== null || incomingFocus.history.length > 0
            ? ' · focus state replaced'
            : '';
        commitProjectSnapshot(nextProjects, nextFocus);
        setSettings({ ...DEFAULT_SETTINGS, ...blob.settings });
        pushActivity(
          makeActivity(
            'import',
            `Imported ${blob.projects.length} project${blob.projects.length === 1 ? '' : 's'} from JSON (replace)${focusContext}`,
          ),
        );
        return;
      }

      // Merge by id: add only projects with new ids; skip existing ids
      const existingIds = new Set(projectsRef.current.map((p) => p.id));
      const toAdd = blob.projects
        .filter((p) => !existingIds.has(p.id))
        .map(normalizeProject);
      const postMergeProjects = [...toAdd, ...projectsRef.current];
      const incomingFocus = blob.focus ?? DEFAULT_FOCUS_STATE;
      const localFocus = focusRef.current;
      const nextFocus = mergeFocusState({
        local: localFocus,
        incoming: incomingFocus,
        projects: postMergeProjects,
        mode: 'merge',
      });
      const localHistoryIds = new Set(
        localFocus.history.map((record) => record.id),
      );
      const newFocusCount = nextFocus.history.filter(
        (record) => !localHistoryIds.has(record.id),
      ).length;
      const focusContext =
        newFocusCount > 0
          ? ` · focus history merged (${newFocusCount} new)`
          : '';
      commitProjectSnapshot(postMergeProjects, nextFocus);
      if (options.applySettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...blob.settings });
      }
      pushActivity(
        makeActivity(
          'import',
          toAdd.length > 0
            ? `Merged ${toAdd.length} new project${toAdd.length === 1 ? '' : 's'} from JSON${options.applySettings ? ' (settings applied)' : ''}${focusContext}`
            : `Merge import: no new projects (all ids already present)${focusContext}`,
        ),
      );
    },
    [commitProjectSnapshot, pushActivity],
  );

  const loadSeed = useCallback(
    (mode: 'merge' | 'replace') => {
      if (mode === 'replace') {
        const seedProjects = SEED_PROJECTS.map(normalizeProject);
        const nextFocus = pruneFocusState(focusRef.current, seedProjects);
        commitProjectSnapshot(seedProjects, nextFocus);
        pushActivity(
          makeActivity(
            'seed',
            `Replaced board with ${SEED_PROJECTS.length} seed projects`,
          ),
        );
        return;
      }
      const ids = new Set(projectsRef.current.map((p) => p.id));
      const toAdd = SEED_PROJECTS.filter((p) => !ids.has(p.id)).map(
        normalizeProject,
      );
      commitProjectSnapshot([...toAdd, ...projectsRef.current], focusRef.current);
      pushActivity(
        makeActivity(
          'seed',
          toAdd.length > 0
            ? `Merged ${toAdd.length} seed project${toAdd.length === 1 ? '' : 's'}`
            : 'Seed merge: no new projects (ids already present)',
        ),
      );
    },
    [commitProjectSnapshot, pushActivity],
  );

  const resetAll = useCallback(() => {
    const seedProjects = SEED_PROJECTS.map(normalizeProject);
    commitProjectSnapshot(seedProjects, DEFAULT_FOCUS_STATE);
    setSettings(DEFAULT_SETTINGS);
    pushActivity(makeActivity('reset', 'Board reset to seed defaults'));
  }, [commitProjectSnapshot, pushActivity]);

  const canMarkFocusStepDone = useMemo(
    () => canMarkLinkedStepDone({ projects, active: focus.active }),
    [focus.active, projects],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      settings,
      activity,
      focus,
      ready,
      getProject,
      createProject,
      updateProject,
      deleteProject,
      duplicateProject,
      toggleStep,
      addStep,
      removeStep,
      reorderSteps,
      setAllStepsDone,
      removeCompletedSteps,
      softArchiveIdle,
      setShowCompleted,
      setIdleDays,
      setTheme,
      exportData,
      importData,
      loadSeed,
      resetAll,
      startFocusSession,
      stopFocusSession,
      finalizeActiveFocus,
      keepWorkingFocus,
      canMarkFocusStepDone,
    }),
    [
      projects,
      settings,
      activity,
      focus,
      ready,
      getProject,
      createProject,
      updateProject,
      deleteProject,
      duplicateProject,
      toggleStep,
      addStep,
      removeStep,
      reorderSteps,
      setAllStepsDone,
      removeCompletedSteps,
      softArchiveIdle,
      setShowCompleted,
      setIdleDays,
      setTheme,
      exportData,
      importData,
      loadSeed,
      resetAll,
      startFocusSession,
      stopFocusSession,
      finalizeActiveFocus,
      keepWorkingFocus,
      canMarkFocusStepDone,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjects(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProjects must be used within ProjectProvider');
  }
  return ctx;
}
