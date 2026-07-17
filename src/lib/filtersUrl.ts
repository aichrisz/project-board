import { defaultSortDir, type SortDir } from './sort';
import type { ProjectStatus, ProjectType, SortKey } from '../types';
import { PROJECT_STATUSES, PROJECT_TYPES } from '../types';

export type UrlFilterState = {
  status: ProjectStatus | 'all' | 'active';
  type: ProjectType | 'all';
  search: string;
  showCompleted: boolean;
  sort: SortKey;
  sortDir: SortDir;
  tag: string | null;
  /** Focus this week: starred / due soon / in_progress */
  focus: boolean;
};

const SORT_KEYS: SortKey[] = ['updated', 'deadline', 'progress', 'title'];
const SORT_DIRS: SortDir[] = ['asc', 'desc'];

function isStatus(v: string): v is ProjectStatus | 'all' | 'active' {
  return (
    v === 'all' ||
    v === 'active' ||
    (PROJECT_STATUSES as string[]).includes(v)
  );
}

function isType(v: string): v is ProjectType | 'all' {
  return v === 'all' || (PROJECT_TYPES as string[]).includes(v);
}

function isSort(v: string): v is SortKey {
  return (SORT_KEYS as string[]).includes(v);
}

function isDir(v: string): v is SortDir {
  return (SORT_DIRS as string[]).includes(v);
}

export function filtersFromSearchParams(
  params: URLSearchParams,
  fallbackShowCompleted: boolean,
): UrlFilterState {
  const statusRaw = params.get('status') ?? 'active';
  const typeRaw = params.get('type') ?? 'all';
  const sortRaw = params.get('sort') ?? 'updated';
  const dirRaw = params.get('dir');
  const q = params.get('q') ?? '';
  const tag = params.get('tag');
  const showRaw = params.get('showCompleted');
  const focusRaw = params.get('focus');

  const sort: SortKey = isSort(sortRaw) ? sortRaw : 'updated';
  const sortDir: SortDir =
    dirRaw && isDir(dirRaw) ? dirRaw : defaultSortDir(sort);

  let showCompleted = fallbackShowCompleted;
  if (showRaw === '1' || showRaw === 'true') showCompleted = true;
  if (showRaw === '0' || showRaw === 'false') showCompleted = false;

  const focus =
    focusRaw === '1' ||
    focusRaw === 'true' ||
    focusRaw === 'week';

  return {
    status: isStatus(statusRaw) ? statusRaw : 'active',
    type: isType(typeRaw) ? typeRaw : 'all',
    search: q,
    showCompleted,
    sort,
    sortDir,
    tag: tag && tag.trim() ? tag.trim() : null,
    focus,
  };
}

/** Build search params from filters. Omits common defaults to keep URLs clean. */
export function filtersToSearchParams(filters: UrlFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.status !== 'active') {
    params.set('status', filters.status);
  }
  if (filters.type !== 'all') {
    params.set('type', filters.type);
  }
  if (filters.search.trim()) {
    params.set('q', filters.search.trim());
  }
  if (filters.showCompleted) {
    params.set('showCompleted', '1');
  }
  if (filters.sort !== 'updated') {
    params.set('sort', filters.sort);
  }
  if (filters.sortDir !== defaultSortDir(filters.sort)) {
    params.set('dir', filters.sortDir);
  }
  if (filters.tag) {
    params.set('tag', filters.tag);
  }
  if (filters.focus) {
    params.set('focus', '1');
  }

  return params;
}

export function defaultFilterState(showCompleted: boolean): UrlFilterState {
  return {
    status: 'active',
    type: 'all',
    search: '',
    showCompleted,
    sort: 'updated',
    sortDir: defaultSortDir('updated'),
    tag: null,
    focus: false,
  };
}

export function hasActiveFilters(filters: UrlFilterState): boolean {
  return (
    filters.status !== 'active' ||
    filters.type !== 'all' ||
    filters.search.trim() !== '' ||
    filters.tag !== null ||
    filters.focus
  );
}
