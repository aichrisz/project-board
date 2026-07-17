export type ProjectType =
  | 'game'
  | 'web'
  | 'tool'
  | 'learning'
  | 'infra'
  | 'other';

export type ProjectStatus =
  | 'idea'
  | 'planned'
  | 'in_progress'
  | 'paused'
  | 'done'
  | 'archived';

export type HealthSignal = 'at_risk' | 'idle' | null;

export type ThemeMode = 'dark' | 'light' | 'system';

export type ActivityType =
  | 'project_created'
  | 'status_changed'
  | 'step_toggled'
  | 'project_deleted'
  | 'import'
  | 'seed'
  | 'reset';

export interface Step {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  type: ProjectType;
  status: ProjectStatus;
  summary: string;
  progress_pct: number;
  steps: Step[];
  notes_md: string;
  links: LinkItem[];
  tags: string[];
  deadline: string | null;
  stack: string[];
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  /** Pin to top of sorted lists when true. Defaults false on migrate. */
  starred?: boolean;
}

export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityType;
  projectId?: string;
  message: string;
}

export interface AppSettings {
  showCompleted: boolean;
  idleDays: number;
  theme: ThemeMode;
  /** ISO timestamp of last successful JSON export; null if never. */
  lastExportAt: string | null;
}

export interface StorageBlob {
  version: 1;
  projects: Project[];
  settings: AppSettings;
}

export type SortKey = 'updated' | 'deadline' | 'progress' | 'title';

export const PROJECT_TYPES: ProjectType[] = [
  'game',
  'web',
  'tool',
  'learning',
  'infra',
  'other',
];

export const PROJECT_STATUSES: ProjectStatus[] = [
  'idea',
  'planned',
  'in_progress',
  'paused',
  'done',
  'archived',
];

export const ACTIVE_STATUSES: ProjectStatus[] = [
  'idea',
  'planned',
  'in_progress',
  'paused',
];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In progress',
  paused: 'Paused',
  done: 'Done',
  archived: 'Archived',
};

export const TYPE_LABELS: Record<ProjectType, string> = {
  game: 'Game',
  web: 'Web',
  tool: 'Tool',
  learning: 'Learning',
  infra: 'Infra',
  other: 'Other',
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

export const DEFAULT_SETTINGS: AppSettings = {
  showCompleted: false,
  idleDays: 14,
  theme: 'system',
  lastExportAt: null,
};

export const ACTIVITY_CAP = 100;
