import type {
  AppSettings,
  LinkItem,
  Project,
  ProjectStatus,
  ProjectType,
  Step,
  StorageBlob,
  ThemeMode,
} from '../types';
import {
  DEFAULT_SETTINGS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from '../types';
import { migrateProject } from './storage';

/** Hard cap on import payload size (5 MB of UTF-8 encoded text) to bound parse work. */
export const MAX_IMPORT_BYTES = 5_000_000;
/** Hard cap on projects per import file. */
export const MAX_IMPORT_PROJECTS = 5000;
/** Hard cap on steps or links per project. */
export const MAX_ITEMS_PER_PROJECT = 500;
/** Hard cap on tags or stack entries per project. */
export const MAX_TAGS_PER_PROJECT = 50;

const MAX_ID_CHARS = 200;
const MAX_TITLE_CHARS = 400;
const MAX_SHORT_TEXT_CHARS = 2000;
const MAX_NOTES_CHARS = 200_000;
const MAX_URL_CHARS = 4000;
const MIN_IDLE_DAYS = 1;
const MAX_IDLE_DAYS = 365;

const THEMES: ThemeMode[] = ['dark', 'light', 'system'];

/** User-facing import rejection. Message is safe to render verbatim. */
export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

function fail(message: string): never {
  throw new ImportValidationError(message);
}

function failTooLarge(): never {
  fail(
    `Import failed: file is too large (limit ${Math.floor(MAX_IMPORT_BYTES / 1_000_000)} MB).`,
  );
}

const utf8Encoder = new TextEncoder();

/** Actual UTF-8 byte length, not JS string length (UTF-16 code units). */
export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).length;
}

/**
 * Read import text from a File, rejecting oversized files by their reported
 * byte size *before* the contents are pulled into memory.
 */
export async function readImportFileText(file: File): Promise<string> {
  if (typeof file?.size === 'number' && file.size > MAX_IMPORT_BYTES) {
    failTooLarge();
  }
  return file.text();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  where: string,
  field: string,
  max: number,
  { allowBlank = false }: { allowBlank?: boolean } = {},
): string {
  if (typeof value !== 'string') {
    fail(`${where}: "${field}" must be text.`);
  }
  if (!allowBlank && !value.trim()) {
    fail(`${where}: "${field}" must not be blank.`);
  }
  if (value.length > max) {
    fail(`${where}: "${field}" is too long (limit ${max} characters).`);
  }
  return value;
}

/**
 * ISO-8601 calendar date, optionally with a time part and offset.
 * Groups: 1=year, 2=month, 3=day. Matches the formats v1 exports produce
 * (`YYYY-MM-DD` deadlines and `Date#toISOString()` timestamps).
 */
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * True only for real calendar dates. `Date.parse` alone is not enough: it
 * normalizes impossible dates such as 2026-02-30 into 2026-03-02.
 */
export function isValidCalendarDateString(text: string): boolean {
  const match = ISO_DATE_RE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return false;
  return !Number.isNaN(Date.parse(text));
}

function requireIsoDate(
  value: unknown,
  where: string,
  field: string,
): string {
  const text = requireString(value, where, field, MAX_SHORT_TEXT_CHARS);
  if (!isValidCalendarDateString(text)) {
    fail(`${where}: "${field}" must be a valid date.`);
  }
  return text;
}

function requireStringArray(
  value: unknown,
  where: string,
  field: string,
): string[] {
  if (!Array.isArray(value)) {
    fail(`${where}: "${field}" must be a list.`);
  }
  if (value.length > MAX_TAGS_PER_PROJECT) {
    fail(`${where}: "${field}" has too many entries (limit ${MAX_TAGS_PER_PROJECT}).`);
  }
  return value.map((entry) => {
    if (typeof entry !== 'string') {
      fail(`${where}: "${field}" must contain only text entries.`);
    }
    if (entry.length > MAX_SHORT_TEXT_CHARS) {
      fail(`${where}: "${field}" has an entry that is too long.`);
    }
    return entry;
  });
}

function parseSteps(value: unknown, where: string): Step[] {
  if (!Array.isArray(value)) {
    fail(`${where}: "steps" must be a list.`);
  }
  if (value.length > MAX_ITEMS_PER_PROJECT) {
    fail(`${where}: too many steps (limit ${MAX_ITEMS_PER_PROJECT}).`);
  }
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const at = `${where}, step ${index + 1}`;
    if (!isPlainObject(raw)) {
      fail(`${at}: each step must be an object.`);
    }
    const id = requireString(raw.id, at, 'id', MAX_ID_CHARS);
    if (seen.has(id)) {
      fail(`${at}: duplicate step id "${truncateForMessage(id)}".`);
    }
    seen.add(id);
    if (typeof raw.done !== 'boolean') {
      fail(`${at}: "done" must be true or false.`);
    }
    if (typeof raw.order !== 'number' || !Number.isFinite(raw.order)) {
      fail(`${at}: "order" must be a number.`);
    }
    return {
      id,
      title: requireString(raw.title, at, 'title', MAX_TITLE_CHARS, {
        allowBlank: true,
      }),
      done: raw.done,
      order: raw.order,
    };
  });
}

function parseLinks(value: unknown, where: string): LinkItem[] {
  if (!Array.isArray(value)) {
    fail(`${where}: "links" must be a list.`);
  }
  if (value.length > MAX_ITEMS_PER_PROJECT) {
    fail(`${where}: too many links (limit ${MAX_ITEMS_PER_PROJECT}).`);
  }
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const at = `${where}, link ${index + 1}`;
    if (!isPlainObject(raw)) {
      fail(`${at}: each link must be an object.`);
    }
    const id = requireString(raw.id, at, 'id', MAX_ID_CHARS);
    if (seen.has(id)) {
      fail(`${at}: duplicate link id "${truncateForMessage(id)}".`);
    }
    seen.add(id);
    return {
      id,
      label: requireString(raw.label, at, 'label', MAX_TITLE_CHARS, {
        allowBlank: true,
      }),
      url: requireString(raw.url, at, 'url', MAX_URL_CHARS),
    };
  });
}

function truncateForMessage(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

function parseProject(raw: unknown, index: number): Project {
  const where = `Project ${index + 1}`;
  if (!isPlainObject(raw)) {
    fail(`${where}: each project must be an object.`);
  }

  const id = requireString(raw.id, where, 'id', MAX_ID_CHARS);
  const title = requireString(raw.title, where, 'title', MAX_TITLE_CHARS);

  if (!PROJECT_TYPES.includes(raw.type as ProjectType)) {
    fail(`${where}: "type" is not a supported value.`);
  }
  if (!PROJECT_STATUSES.includes(raw.status as ProjectStatus)) {
    fail(`${where}: "status" is not a supported value.`);
  }

  const progress = raw.progress_pct;
  if (
    typeof progress !== 'number' ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100
  ) {
    fail(`${where}: "progress_pct" must be a number between 0 and 100.`);
  }

  let deadline: string | null = null;
  if (raw.deadline !== null && raw.deadline !== undefined) {
    deadline = requireIsoDate(raw.deadline, where, 'deadline');
  }

  let startedAt: string | null = null;
  if (raw.started_at !== null && raw.started_at !== undefined) {
    startedAt = requireIsoDate(raw.started_at, where, 'started_at');
  }

  if (raw.starred !== undefined && typeof raw.starred !== 'boolean') {
    fail(`${where}: "starred" must be true or false.`);
  }

  const project: Project = {
    id,
    title,
    slug: requireString(raw.slug, where, 'slug', MAX_TITLE_CHARS, {
      allowBlank: true,
    }),
    type: raw.type as ProjectType,
    status: raw.status as ProjectStatus,
    summary: requireString(raw.summary, where, 'summary', MAX_SHORT_TEXT_CHARS, {
      allowBlank: true,
    }),
    progress_pct: progress,
    steps: parseSteps(raw.steps, where),
    notes_md: requireString(raw.notes_md, where, 'notes_md', MAX_NOTES_CHARS, {
      allowBlank: true,
    }),
    links: parseLinks(raw.links, where),
    tags: requireStringArray(raw.tags, where, 'tags'),
    deadline,
    stack: requireStringArray(raw.stack, where, 'stack'),
    created_at: requireIsoDate(raw.created_at, where, 'created_at'),
    updated_at: requireIsoDate(raw.updated_at, where, 'updated_at'),
    started_at: startedAt,
    starred: raw.starred === true,
  };

  return migrateProject(project);
}

function parseSettings(raw: unknown): AppSettings {
  if (raw === undefined || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }
  if (!isPlainObject(raw)) {
    fail('Settings: "settings" must be an object.');
  }

  if (raw.showCompleted !== undefined && typeof raw.showCompleted !== 'boolean') {
    fail('Settings: "showCompleted" must be true or false.');
  }
  if (raw.idleDays !== undefined) {
    const days = raw.idleDays;
    if (
      typeof days !== 'number' ||
      !Number.isInteger(days) ||
      days < MIN_IDLE_DAYS ||
      days > MAX_IDLE_DAYS
    ) {
      fail(
        `Settings: "idleDays" must be a whole number between ${MIN_IDLE_DAYS} and ${MAX_IDLE_DAYS}.`,
      );
    }
  }
  if (raw.theme !== undefined && !THEMES.includes(raw.theme as ThemeMode)) {
    fail('Settings: "theme" must be dark, light, or system.');
  }
  let lastExportAt: string | null = null;
  if (raw.lastExportAt !== undefined && raw.lastExportAt !== null) {
    lastExportAt = requireIsoDate(raw.lastExportAt, 'Settings', 'lastExportAt');
  }

  return {
    showCompleted:
      raw.showCompleted === undefined
        ? DEFAULT_SETTINGS.showCompleted
        : (raw.showCompleted as boolean),
    idleDays:
      raw.idleDays === undefined
        ? DEFAULT_SETTINGS.idleDays
        : (raw.idleDays as number),
    theme:
      raw.theme === undefined
        ? DEFAULT_SETTINGS.theme
        : (raw.theme as ThemeMode),
    lastExportAt,
  };
}

/**
 * Validate untrusted import text into a StorageBlob.
 * Throws ImportValidationError with a user-safe message on any violation.
 */
export function validateImportBlob(text: string): StorageBlob {
  if (typeof text !== 'string') {
    fail('Import failed: no file contents were provided.');
  }
  if (!text.trim()) {
    fail('Import failed: the file is empty.');
  }
  if (utf8ByteLength(text) > MAX_IMPORT_BYTES) {
    failTooLarge();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('Import failed: the file is not valid JSON.');
  }

  if (!isPlainObject(parsed)) {
    fail('Import failed: expected an object at the top level.');
  }
  if (parsed.version !== 1) {
    fail('Import failed: unsupported export version (expected version 1).');
  }
  if (!Array.isArray(parsed.projects)) {
    fail('Import failed: "projects" must be an array.');
  }
  if (parsed.projects.length > MAX_IMPORT_PROJECTS) {
    fail(
      `Import failed: too many projects (limit ${MAX_IMPORT_PROJECTS}).`,
    );
  }

  const seenIds = new Set<string>();
  const projects = parsed.projects.map((raw, index) => {
    const project = parseProject(raw, index);
    if (seenIds.has(project.id)) {
      fail(
        `Project ${index + 1}: duplicate project id "${truncateForMessage(project.id)}".`,
      );
    }
    seenIds.add(project.id);
    return project;
  });

  return {
    version: 1,
    projects,
    settings: parseSettings(parsed.settings),
  };
}
