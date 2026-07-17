import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BoardColumn } from '../components/BoardColumn';
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

    const key = e.key;
    const colList = byStatus.get(project.status) ?? [];
    const colIndex = colList.findIndex((p) => p.id === projectId);
    const statusIndex = columns.indexOf(project.status);

    // Horizontal: change status among visible columns
    if (
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'h' ||
      key === 'H' ||
      key === 'l' ||
      key === 'L'
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (statusIndex < 0) return;
      const delta =
        key === 'ArrowLeft' || key === 'h' || key === 'H' ? -1 : 1;
      const nextStatusIndex = statusIndex + delta;
      if (nextStatusIndex < 0 || nextStatusIndex >= columns.length) return;
      const nextStatus = columns[nextStatusIndex]!;
      if (nextStatus === project.status) return;
      updateProject(projectId, { status: nextStatus });
      setLiveMessage(`Moved to ${STATUS_LABELS[nextStatus]}`);
      setFocusedId(projectId);
      // Refocus after re-render into new column
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          cardEls.current.get(projectId)?.focus();
        });
      });
      return;
    }

    // Vertical: move focus within column
    if (
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'k' ||
      key === 'K' ||
      key === 'j' ||
      key === 'J'
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (colIndex < 0) return;
      const delta =
        key === 'ArrowUp' || key === 'k' || key === 'K' ? -1 : 1;
      const nextIndex = colIndex + delta;
      if (nextIndex < 0 || nextIndex >= colList.length) return;
      const next = colList[nextIndex]!;
      focusCard(next.id);
      return;
    }

    // Open detail
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/project/${projectId}`);
    }
  }

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="board-page">
      <div className="page-header board-page-header">
        <div>
          <h1 className="page-title">Board</h1>
          <p className="page-subtitle">
            Kanban by status. Drag a card to change status. Keyboard: ←→ change
            status, ↑↓ move focus, Enter open.
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

      <div className="board-scroll" role="region" aria-label="Status board">
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
