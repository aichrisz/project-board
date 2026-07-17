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
  saveActivity,
} from '../lib/activity';
import { downloadJson, parseImportJson, toExportJson } from '../lib/export';
import { isIdle } from '../lib/health';
import { createId, slugify } from '../lib/id';
import { withAutoProgress } from '../lib/progress';
import { loadStorage, migrateProject, saveStorage } from '../lib/storage';
import { applyTheme } from '../lib/theme';
import type {
  ActivityEvent,
  AppSettings,
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
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProject(project: Project): Project {
  return migrateProject(withAutoProgress(project));
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
  const [ready, setReady] = useState(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const pushActivity = useCallback((event: ActivityEvent) => {
    setActivity((prev) => {
      const next = prependActivity(prev, event);
      saveActivity(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const stored = loadStorage();
    if (stored) {
      setProjects(stored.projects.map(normalizeProject));
      setSettings({ ...DEFAULT_SETTINGS, ...stored.settings });
    } else {
      // First visit: empty board so onboarding can run (no auto-seed)
      setProjects([]);
      setSettings(DEFAULT_SETTINGS);
    }
    setActivity(loadActivity());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const blob: StorageBlob = { version: 1, projects, settings };
    saveStorage(blob);
  }, [projects, settings, ready]);

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
      setProjects((prev) => [project, ...prev]);
      pushActivity(
        makeActivity(
          'project_created',
          `Created project “${project.title}”`,
          project.id,
        ),
      );
      return project;
    },
    [pushActivity],
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

      setProjects((prev) =>
        prev.map((p) => {
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
        }),
      );
    },
    [pushActivity],
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
      setProjects((prev) => prev.filter((p) => p.id !== id));
    },
    [pushActivity],
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
      setProjects((prev) => [project, ...prev]);
      pushActivity(
        makeActivity(
          'project_created',
          `Duplicated “${source.title}” → “${project.title}”`,
          project.id,
        ),
      );
      return project;
    },
    [pushActivity],
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
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const steps = p.steps.map((s) =>
            s.id === stepId ? { ...s, done: !s.done } : s,
          );
          return normalizeProject({
            ...p,
            steps,
            updated_at: nowIso(),
          });
        }),
      );
    },
    [pushActivity],
  );

  const addStep = useCallback((projectId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const order =
          p.steps.length === 0
            ? 1
            : Math.max(...p.steps.map((s) => s.order)) + 1;
        const steps = [
          ...p.steps,
          { id: createId('step'), title: trimmed, done: false, order },
        ];
        return normalizeProject({
          ...p,
          steps,
          updated_at: nowIso(),
        });
      }),
    );
  }, []);

  const removeStep = useCallback((projectId: string, stepId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return normalizeProject({
          ...p,
          steps: p.steps.filter((s) => s.id !== stepId),
          updated_at: nowIso(),
        });
      }),
    );
  }, []);

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
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          return normalizeProject({
            ...p,
            steps,
            updated_at: nowIso(),
          });
        }),
      );
      pushActivity(
        makeActivity(
          'step_toggled',
          `Reordered steps on “${current.title}”`,
          projectId,
        ),
      );
    },
    [pushActivity],
  );

  const setAllStepsDone = useCallback(
    (projectId: string, done: boolean) => {
      const current = projectsRef.current.find((p) => p.id === projectId);
      if (!current || current.steps.length === 0) return;
      const needsChange = current.steps.some((s) => s.done !== done);
      if (!needsChange) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          return normalizeProject({
            ...p,
            steps: p.steps.map((s) => ({ ...s, done })),
            updated_at: nowIso(),
          });
        }),
      );
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
    [pushActivity],
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

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          return normalizeProject({
            ...p,
            steps,
            updated_at: nowIso(),
          });
        }),
      );
      pushActivity(
        makeActivity(
          'step_toggled',
          `Removed ${removed} completed step${removed === 1 ? '' : 's'} on “${current.title}”`,
          projectId,
        ),
      );
    },
    [pushActivity],
  );

  const softArchiveIdle = useCallback((): number => {
    const idleDays = settings.idleDays;
    const idleIds = projectsRef.current
      .filter((p) => isIdle(p, idleDays))
      .map((p) => p.id);
    if (idleIds.length === 0) return 0;

    const idSet = new Set(idleIds);
    const ts = nowIso();
    setProjects((prev) =>
      prev.map((p) => {
        if (!idSet.has(p.id)) return p;
        return normalizeProject({
          ...p,
          status: 'archived',
          updated_at: ts,
        });
      }),
    );
    pushActivity(
      makeActivity(
        'status_changed',
        `Soft-archived ${idleIds.length} idle in-progress project${idleIds.length === 1 ? '' : 's'}`,
      ),
    );
    return idleIds.length;
  }, [pushActivity, settings.idleDays]);

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
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`project-board-${date}.json`, toExportJson(blob));
    setSettings(nextSettings);
  }, [projects, settings]);

  const importData = useCallback(
    (jsonText: string, options: ImportOptions = { mode: 'replace' }) => {
      const blob = parseImportJson(jsonText);
      const mode = options.mode ?? 'replace';

      if (mode === 'replace') {
        setProjects(blob.projects.map(normalizeProject));
        setSettings({ ...DEFAULT_SETTINGS, ...blob.settings });
        pushActivity(
          makeActivity(
            'import',
            `Imported ${blob.projects.length} project${blob.projects.length === 1 ? '' : 's'} from JSON (replace)`,
          ),
        );
        return;
      }

      // Merge by id: add only projects with new ids; skip existing ids
      const existingIds = new Set(projectsRef.current.map((p) => p.id));
      const toAdd = blob.projects
        .filter((p) => !existingIds.has(p.id))
        .map(normalizeProject);
      setProjects((prev) => [...toAdd, ...prev]);
      if (options.applySettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...blob.settings });
      }
      pushActivity(
        makeActivity(
          'import',
          toAdd.length > 0
            ? `Merged ${toAdd.length} new project${toAdd.length === 1 ? '' : 's'} from JSON${options.applySettings ? ' (settings applied)' : ''}`
            : 'Merge import: no new projects (all ids already present)',
        ),
      );
    },
    [pushActivity],
  );

  const loadSeed = useCallback(
    (mode: 'merge' | 'replace') => {
      if (mode === 'replace') {
        setProjects(SEED_PROJECTS.map(normalizeProject));
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
      setProjects((prev) => [...toAdd, ...prev]);
      pushActivity(
        makeActivity(
          'seed',
          toAdd.length > 0
            ? `Merged ${toAdd.length} seed project${toAdd.length === 1 ? '' : 's'}`
            : 'Seed merge: no new projects (ids already present)',
        ),
      );
    },
    [pushActivity],
  );

  const resetAll = useCallback(() => {
    setProjects(SEED_PROJECTS.map(normalizeProject));
    setSettings(DEFAULT_SETTINGS);
    pushActivity(makeActivity('reset', 'Board reset to seed defaults'));
  }, [pushActivity]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      settings,
      activity,
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
    }),
    [
      projects,
      settings,
      activity,
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
