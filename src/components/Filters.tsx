import { useEffect, useId, useState } from 'react';
import type { SortDir } from '../lib/sort';
import type { ProjectStatus, ProjectType, SortKey } from '../types';
import {
  ACTIVE_STATUSES,
  PROJECT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../types';

export type FilterState = {
  status: ProjectStatus | 'all' | 'active';
  type: ProjectType | 'all';
  search: string;
  showCompleted: boolean;
  sort: SortKey;
  sortDir: SortDir;
  tag: string | null;
  focus: boolean;
};

type Props = {
  filters: FilterState;
  tags: string[];
  onChange: (next: Partial<FilterState>) => void;
  onClear: () => void;
  canClear: boolean;
  /** Count of non-default active filters (for badge). */
  activeCount?: number;
};

const FILTERS_OPEN_KEY = 'project-board-filters-open';
const DESKTOP_MQ = '(min-width: 768px)';

function readStoredOpen(): boolean | null {
  try {
    const v = localStorage.getItem(FILTERS_OPEN_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredOpen(open: boolean) {
  try {
    localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function defaultOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = readStoredOpen();
  if (stored !== null) return stored;
  // Mobile: collapsed by default; desktop: open
  return window.matchMedia(DESKTOP_MQ).matches;
}

export function Filters({
  filters,
  tags,
  onChange,
  onClear,
  canClear,
  activeCount = 0,
}: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  // Persist preference
  useEffect(() => {
    writeStoredOpen(open);
  }, [open]);

  const toggle = () => setOpen((o) => !o);

  return (
    <section className={`filters${open ? ' filters-open' : ' filters-collapsed'}`} aria-label="Filters">
      <div className="filters-toolbar">
        <button
          type="button"
          className="filters-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="filters-toggle-label">Filters</span>
          {activeCount > 0 && (
            <span className="filters-badge" aria-label={`${activeCount} active`}>
              {activeCount}
            </span>
          )}
          <span className="filters-chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {!open && canClear && (
          <button
            type="button"
            className="btn btn-ghost btn-clear-filters"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>

      <div id={panelId} className="filters-body" hidden={!open}>
        <div className="filter-row">
          <div className="chip-group" role="group" aria-label="Status filter">
            <button
              type="button"
              className={`chip ${filters.status === 'active' ? 'active' : ''}`}
              onClick={() => onChange({ status: 'active' })}
            >
              Active
            </button>
            {ACTIVE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${filters.status === s ? 'active' : ''}`}
                onClick={() => onChange({ status: s })}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            {(filters.showCompleted ||
              filters.status === 'done' ||
              filters.status === 'archived') && (
              <>
                <button
                  type="button"
                  className={`chip ${filters.status === 'done' ? 'active' : ''}`}
                  onClick={() => onChange({ status: 'done' })}
                >
                  Done
                </button>
                <button
                  type="button"
                  className={`chip ${filters.status === 'archived' ? 'active' : ''}`}
                  onClick={() => onChange({ status: 'archived' })}
                >
                  Archived
                </button>
                <button
                  type="button"
                  className={`chip ${filters.status === 'all' ? 'active' : ''}`}
                  onClick={() => onChange({ status: 'all' })}
                >
                  All
                </button>
              </>
            )}
          </div>

          <div className="filter-row-end">
            <button
              type="button"
              className={`chip chip-focus${filters.focus ? ' active' : ''}`}
              aria-pressed={filters.focus}
              onClick={() => onChange({ focus: !filters.focus })}
            >
              Focus this week
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.showCompleted}
                onChange={(e) => onChange({ showCompleted: e.target.checked })}
              />
              <span>Show completed</span>
            </label>
            {canClear && (
              <button
                type="button"
                className="btn btn-ghost btn-clear-filters"
                onClick={onClear}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="filter-row filter-row-secondary">
          <div className="chip-group" role="group" aria-label="Type filter">
            <button
              type="button"
              className={`chip ${filters.type === 'all' ? 'active' : ''}`}
              onClick={() => onChange({ type: 'all' })}
            >
              All types
            </button>
            {PROJECT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip chip-type ${filters.type === t ? 'active' : ''}`}
                onClick={() => onChange({ type: t })}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="filter-controls">
            <label className="field-inline">
              <span className="sr-only">Sort</span>
              <select
                value={filters.sort}
                onChange={(e) => onChange({ sort: e.target.value as SortKey })}
                aria-label="Sort projects"
              >
                <option value="updated">Updated</option>
                <option value="deadline">Deadline</option>
                <option value="progress">Progress</option>
                <option value="title">Title</option>
              </select>
            </label>
            <label className="field-inline">
              <span className="sr-only">Sort direction</span>
              <select
                value={filters.sortDir}
                onChange={(e) => onChange({ sortDir: e.target.value as SortDir })}
                aria-label="Sort direction"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <label className="search-field">
              <span className="sr-only">Search</span>
              <input
                id="board-search"
                type="search"
                placeholder="Search projects…"
                value={filters.search}
                onChange={(e) => onChange({ search: e.target.value })}
                aria-label="Search projects"
              />
            </label>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="filter-row filter-row-tags">
            <div className="chip-group" role="group" aria-label="Tag filter">
              <span className="filter-tags-label">Tags</span>
              <button
                type="button"
                className={`chip ${filters.tag === null ? 'active' : ''}`}
                onClick={() => onChange({ tag: null })}
              >
                All tags
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip chip-tag ${filters.tag === t ? 'active' : ''}`}
                  onClick={() =>
                    onChange({ tag: filters.tag === t ? null : t })
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
