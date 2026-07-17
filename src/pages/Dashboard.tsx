import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DueSoonStrip } from '../components/DueSoonStrip';
import { EmptyState } from '../components/EmptyState';
import { Filters, type FilterState } from '../components/Filters';
import { KpiRow } from '../components/KpiRow';
import { Onboarding } from '../components/Onboarding';
import { ProjectCard } from '../components/ProjectCard';
import { RecentActivity } from '../components/RecentActivity';
import { StatsPanel } from '../components/StatsPanel';
import { Toast } from '../components/Toast';
import { getDueSoonProjects } from '../lib/dueSoon';
import { isExportStale } from '../lib/exportAge';
import {
  defaultFilterState,
  filtersFromSearchParams,
  filtersToSearchParams,
  hasActiveFilters,
} from '../lib/filtersUrl';
import { matchesFocusThisWeek } from '../lib/focus';
import { defaultSortDir, sortProjects } from '../lib/sort';
import { computeStats } from '../lib/stats';
import { useProjects } from '../store/ProjectContext';
import type { ProjectStatus } from '../types';
import { ACTIVE_STATUSES } from '../types';

const BACKUP_NUDGE_DISMISS_KEY = 'project-board-backup-nudge-dismissed';

type UndoToast = {
  message: string;
  previousStatus: ProjectStatus;
  projectId: string;
};

function readNudgeDismissed(): boolean {
  try {
    return sessionStorage.getItem(BACKUP_NUDGE_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeNudgeDismissed() {
  try {
    sessionStorage.setItem(BACKUP_NUDGE_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function Dashboard() {
  const {
    projects,
    settings,
    setShowCompleted,
    ready,
    updateProject,
    addStep,
    duplicateProject,
    exportData,
  } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(readNudgeDismissed);
  const hydrated = useRef(false);

  const [filters, setFilters] = useState<FilterState>({
    status: 'active',
    type: 'all',
    search: '',
    showCompleted: false,
    sort: 'updated',
    sortDir: defaultSortDir('updated'),
    tag: null,
    focus: false,
  });

  // Hydrate filters from URL once storage is ready
  useEffect(() => {
    if (!ready || hydrated.current) return;
    hydrated.current = true;
    const fromUrl = filtersFromSearchParams(searchParams, settings.showCompleted);
    setFilters({
      status: fromUrl.status,
      type: fromUrl.type,
      search: fromUrl.search,
      showCompleted: fromUrl.showCompleted,
      sort: fromUrl.sort,
      sortDir: fromUrl.sortDir,
      tag: fromUrl.tag,
      focus: fromUrl.focus,
    });
    if (fromUrl.showCompleted !== settings.showCompleted) {
      setShowCompleted(fromUrl.showCompleted);
    }
  }, [ready, searchParams, settings.showCompleted, setShowCompleted]);

  // Sync showCompleted from settings (e.g. Settings page) into filters
  useEffect(() => {
    if (!hydrated.current) return;
    setFilters((f) =>
      f.showCompleted === settings.showCompleted
        ? f
        : { ...f, showCompleted: settings.showCompleted },
    );
  }, [settings.showCompleted]);

  // Sync filters → URL
  useEffect(() => {
    if (!ready || !hydrated.current) return;
    const params = filtersToSearchParams({
      status: filters.status,
      type: filters.type,
      search: filters.search,
      showCompleted: filters.showCompleted,
      sort: filters.sort,
      sortDir: filters.sortDir,
      tag: filters.tag,
      focus: filters.focus,
    });
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
  }, [filters, ready, searchParams, setSearchParams]);

  const showCompleted = settings.showCompleted;

  const exportStale = isExportStale(settings.lastExportAt);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      for (const t of p.tags) {
        const trimmed = t.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const stats = useMemo(() => computeStats(projects), [projects]);

  const dueSoon = useMemo(
    () =>
      getDueSoonProjects(projects, {
        withinDays: 7,
        includeTerminal: showCompleted,
      }),
    [projects, showCompleted],
  );

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const explicitCompletedFilter =
      filters.status === 'done' ||
      filters.status === 'archived' ||
      filters.status === 'all';

    const list = projects.filter((p) => {
      const isCompleted = p.status === 'done' || p.status === 'archived';

      if (isCompleted && !showCompleted && !explicitCompletedFilter) {
        return false;
      }

      if (filters.status === 'active') {
        if (!ACTIVE_STATUSES.includes(p.status)) return false;
      } else if (filters.status !== 'all' && p.status !== filters.status) {
        return false;
      }

      if (filters.type !== 'all' && p.type !== filters.type) return false;

      if (filters.tag) {
        const tagLower = filters.tag.toLowerCase();
        if (!p.tags.some((t) => t.toLowerCase() === tagLower)) return false;
      }

      if (filters.focus && !matchesFocusThisWeek(p)) {
        return false;
      }

      if (q) {
        const hay =
          `${p.title} ${p.summary} ${p.tags.join(' ')} ${p.notes_md}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    return sortProjects(list, filters.sort, filters.sortDir);
  }, [projects, filters, showCompleted]);

  const canClear = hasActiveFilters({
    status: filters.status,
    type: filters.type,
    search: filters.search,
    showCompleted: filters.showCompleted,
    sort: filters.sort,
    sortDir: filters.sortDir,
    tag: filters.tag,
    focus: filters.focus,
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.status !== 'active') n += 1;
    if (filters.type !== 'all') n += 1;
    if (filters.search.trim()) n += 1;
    if (filters.tag) n += 1;
    if (filters.focus) n += 1;
    return n;
  }, [filters]);

  const onFilterChange = useCallback(
    (next: Partial<FilterState>) => {
      if (typeof next.showCompleted === 'boolean') {
        setShowCompleted(next.showCompleted);
        setFilters((f) => ({
          ...f,
          ...next,
          status:
            next.showCompleted === false &&
            (f.status === 'done' ||
              f.status === 'archived' ||
              f.status === 'all')
              ? 'active'
              : (next.status ?? f.status),
        }));
        return;
      }

      if (next.sort && next.sortDir === undefined) {
        setFilters((f) => ({
          ...f,
          ...next,
          sortDir: defaultSortDir(next.sort!),
        }));
        return;
      }

      setFilters((f) => ({ ...f, ...next }));
    },
    [setShowCompleted],
  );

  const onClearFilters = useCallback(() => {
    setFilters((f) => ({
      ...defaultFilterState(settings.showCompleted),
      showCompleted: f.showCompleted,
    }));
  }, [settings.showCompleted]);

  const onToggleStar = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      updateProject(id, { starred: !p.starred });
    },
    [projects, updateProject],
  );

  const onArchive = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p || p.status === 'archived') return;
      const previousStatus = p.status;
      updateProject(id, { status: 'archived' });
      setUndoToast({
        message: 'Archived',
        previousStatus,
        projectId: id,
      });
    },
    [projects, updateProject],
  );

  const onDuplicate = useCallback(
    (id: string) => {
      duplicateProject(id);
    },
    [duplicateProject],
  );

  const dismissToast = useCallback(() => setUndoToast(null), []);

  const undoArchive = useCallback(() => {
    if (!undoToast) return;
    updateProject(undoToast.projectId, { status: undoToast.previousStatus });
    setUndoToast(null);
  }, [undoToast, updateProject]);

  const dismissBackupNudge = useCallback(() => {
    writeNudgeDismissed();
    setNudgeDismissed(true);
  }, []);

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }

  const isEmptyBoard = projects.length === 0;
  const showOnboarding = isEmptyBoard && !onboardingSkipped;
  const showBackupNudge = !isEmptyBoard && exportStale && !nudgeDismissed;

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Track progress, notes, and deadlines for your projects.
          </p>
        </div>
      </div>

      {showOnboarding ? (
        <Onboarding onSkip={() => setOnboardingSkipped(true)} />
      ) : (
        <>
          {showBackupNudge && (
            <div className="banner banner-nudge" role="status">
              <p>
                {settings.lastExportAt
                  ? 'Your last backup is over a week old. Export a backup so clearing browser storage does not lose your board.'
                  : 'Export a backup so clearing browser storage does not lose your board.'}
              </p>
              <div className="banner-nudge-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={exportData}
                >
                  Export JSON
                </button>
                <Link to="/settings" className="btn btn-ghost btn-sm">
                  Settings
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={dismissBackupNudge}
                  aria-label="Dismiss backup reminder for this session"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!isEmptyBoard && (
            <KpiRow stats={stats} showCompleted={showCompleted} />
          )}

          {!isEmptyBoard && <DueSoonStrip projects={dueSoon} />}

          {!isEmptyBoard && (
            <Filters
              filters={{ ...filters, showCompleted }}
              tags={allTags}
              onChange={onFilterChange}
              onClear={onClearFilters}
              canClear={canClear}
              activeCount={activeFilterCount}
            />
          )}

          <section className="card-grid" aria-label="Projects">
            {isEmptyBoard ? (
              <EmptyState
                title="No projects yet"
                description="Create your first project or load realistic inventory from Settings."
                action={
                  <div className="empty-action-row">
                    <Link to="/new" className="btn btn-primary">
                      + New project
                    </Link>
                    <Link to="/settings" className="btn btn-secondary">
                      Settings
                    </Link>
                  </div>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title={
                  filters.focus
                    ? 'Nothing in focus'
                    : 'No projects match'
                }
                description={
                  filters.focus
                    ? 'Nothing in focus — star a project or set a deadline.'
                    : 'Nothing matches your current filters. Clear them to see all active projects.'
                }
                action={
                  <div className="empty-action-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onClearFilters}
                    >
                      Clear filters
                    </button>
                    <Link to="/new" className="btn btn-secondary">
                      + New project
                    </Link>
                  </div>
                }
              />
            ) : (
              visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  idleDays={settings.idleDays}
                  onToggleStar={onToggleStar}
                  onAddStep={addStep}
                  onArchive={onArchive}
                  onDuplicate={onDuplicate}
                />
              ))
            )}
          </section>

          {!isEmptyBoard && <RecentActivity limit={5} />}

          {!isEmptyBoard && <StatsPanel stats={stats} />}
        </>
      )}

      {undoToast && (
        <Toast
          message={`${undoToast.message} —`}
          action={{ label: 'Undo', onClick: undoArchive }}
          onDismiss={dismissToast}
          durationMs={5000}
        />
      )}
    </div>
  );
}
