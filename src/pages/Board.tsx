import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BoardColumn } from '../components/BoardColumn';
import {
  isBoardKeyboardKey,
  resolveBoardKeyboardAction,
} from '../lib/boardKeyboard';
import {
  BOARD_HINT_DISMISS_SCROLL,
  BOARD_NARROW_QUERY,
  shouldShowBoardScrollHint,
} from '../lib/boardScrollHint';
import { sortProjects } from '../lib/sort';
import { useProjects } from '../store/ProjectContext';
import type { ProjectStatus } from '../types';
import { ACTIVE_STATUSES, PROJECT_STATUSES, STATUS_LABELS } from '../types';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('[contenteditable="true"]'));
}

export function Board() {
  const { projects, settings, setShowCompleted, updateProject, ready } =
    useProjects();
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<ProjectStatus | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const cardEls = useRef(new Map<string, HTMLElement>());
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [metrics, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });
  const [hintDismissed, setHintDismissed] = useState(false);

  const columns = useMemo(() => {
    return settings.showCompleted ? PROJECT_STATUSES : ACTIVE_STATUSES;
  }, [settings.showCompleted]);

  const byStatus = useMemo(() => {
    const map = new Map<ProjectStatus, typeof projects>();
    for (const status of PROJECT_STATUSES) {
      map.set(status, []);
    }
    for (const p of projects) {
      const list = map.get(p.status);
      if (list) list.push(p);
    }
    for (const status of PROJECT_STATUSES) {
      map.set(status, sortProjects(map.get(status) ?? [], 'updated', 'desc'));
    }
    return map;
  }, [projects]);

  const registerCardRef = useCallback(
    (projectId: string, el: HTMLElement | null) => {
      if (el) cardEls.current.set(projectId, el);
      else cardEls.current.delete(projectId);
    },
    [],
  );

  const focusCard = useCallback((projectId: string) => {
    setFocusedId(projectId);
    requestAnimationFrame(() => {
      cardEls.current.get(projectId)?.focus();
    });
  }, []);

  // Narrow viewport: the hint is scoped to the breakpoint where the board's
  // columns cannot all fit, so desktop never measures or renders it.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(BOARD_NARROW_QUERY);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Measure real overflow while narrow. ResizeObserver catches column count and
  // card height changes; the resize listener covers viewport-only changes on
  // browsers without an observer.
  useEffect(() => {
    if (!narrow) return;
    const el = scrollEl.current;
    if (!el) return;

    const measure = () => {
      setMetrics((prev) =>
        prev.scrollWidth === el.scrollWidth && prev.clientWidth === el.clientWidth
          ? prev
          : { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
      );
    };
    measure();

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    const inner = el.firstElementChild;
    if (inner) observer?.observe(inner);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `ready` is a dependency because the scroll container does not exist during
    // the loading render, so the ref is null on the first pass.
  }, [narrow, ready, columns.length, projects.length]);

  // Once the reader has scrolled far enough to have found the gesture, the hint
  // has done its job and retires for the rest of the session.
  useEffect(() => {
    if (!narrow || hintDismissed) return;
    const el = scrollEl.current;
    if (!el) return;

    const onScroll = () => {
      if (el.scrollLeft >= BOARD_HINT_DISMISS_SCROLL) setHintDismissed(true);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [narrow, ready, hintDismissed]);

  // Drop focus id if project disappeared or is no longer in a visible column
  useEffect(() => {
    if (!focusedId) return;
    const p = projects.find((x) => x.id === focusedId);
    if (!p || !columns.includes(p.status)) {
      setFocusedId(null);
    }
  }, [projects, focusedId, columns]);

  function handleDrop(status: ProjectStatus, projectId?: string | null) {
    const id = projectId || draggingId;
    if (id) {
      const project = projects.find((p) => p.id === id);
      if (project && project.status !== status) {
        updateProject(id, { status });
        setLiveMessage(`Moved to ${STATUS_LABELS[status]}`);
      }
    }
    setDraggingId(null);
    setDropStatus(null);
  }

  function handleCardKeyDown(projectId: string, e: React.KeyboardEvent) {
    if (isTypingTarget(e.target)) return;

    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // Claim every key the Board owns before deciding, so an owned key at a
    // boundary still cannot scroll the page or activate the card.
    if (!isBoardKeyboardKey(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    const colList = byStatus.get(project.status) ?? [];
    const action = resolveBoardKeyboardAction({
      key: e.key,
      projectId,
      status: project.status,
      statuses: columns,
      columnProjectIds: colList.map((p) => p.id),
    });

    if (action.kind === 'none') return;

    if (action.kind === 'move-status') {
      updateProject(projectId, { status: action.status });
      setLiveMessage(action.message);
      setFocusedId(projectId);
      // Refocus after re-render into new column
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          cardEls.current.get(projectId)?.focus();
        });
      });
      return;
    }

    if (action.kind === 'move-focus') {
      focusCard(action.projectId);
      return;
    }

    navigate(`/project/${projectId}`);
  }

  const showScrollHint = shouldShowBoardScrollHint({
    narrow,
    scrollWidth: metrics.scrollWidth,
    clientWidth: metrics.clientWidth,
    dismissed: hintDismissed,
  });

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="board-page">
      <div className="page-header board-page-header">
        <div>
          <h1 className="page-title">Board</h1>
          <p className="page-subtitle">
            Kanban by status. Change status with the keyboard (←→ change status,
            ↑↓ move focus, Enter open) or from a project's detail page. Dragging
            a card is an optional desktop shortcut.
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          <span>Show completed</span>
        </label>
      </div>

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {liveMessage}
      </div>

      {showScrollHint && (
        <p className="board-scroll-hint" id="board-scroll-hint">
          Swipe to view more statuses. Status can be changed with the Board
          keyboard controls or by editing a project from its detail page;
          dragging a card is optional and only needed on desktop.
        </p>
      )}

      <div
        className="board-scroll"
        ref={scrollEl}
        role="region"
        aria-label="Status board"
        aria-describedby={showScrollHint ? 'board-scroll-hint' : undefined}
      >
        <div className="board-columns">
          {columns.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              projects={byStatus.get(status) ?? []}
              idleDays={settings.idleDays}
              isDropTarget={dropStatus === status && draggingId !== null}
              focusedProjectId={focusedId}
              onDragOver={setDropStatus}
              onDragLeave={() => setDropStatus(null)}
              onDrop={handleDrop}
              onCardDragStart={setDraggingId}
              onCardDragEnd={() => {
                setDraggingId(null);
                setDropStatus(null);
              }}
              onCardFocus={setFocusedId}
              onCardKeyDown={handleCardKeyDown}
              registerCardRef={registerCardRef}
            />
          ))}
        </div>
      </div>

      {projects.length === 0 && (
        <p className="muted board-empty-hint">
          No projects yet.{' '}
          <Link to="/new">Create one</Link> or load realistic inventory in
          Settings.
        </p>
      )}
    </div>
  );
}
