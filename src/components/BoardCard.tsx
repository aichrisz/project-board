import { Link } from 'react-router';
import type { Project } from '../types';
import { TYPE_LABELS } from '../types';

type Props = {
  project: Project;
  idleDays: number;
  draggable?: boolean;
  tabIndex?: number;
  focused?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onDragStart?: (projectId: string) => void;
  onDragEnd?: () => void;
};

export function BoardCard({
  project,
  draggable = true,
  tabIndex = 0,
  focused = false,
  cardRef,
  onFocus,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: Props) {
  return (
    <article
      ref={cardRef}
      className={`board-card${focused ? ' board-card-focused' : ''}`}
      draggable={draggable}
      tabIndex={tabIndex}
      data-project-id={project.id}
      aria-label={`${project.title}, ${TYPE_LABELS[project.type]}, ${project.progress_pct}%`}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', project.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(project.id);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <Link
        to={`/project/${project.id}`}
        className="board-card-link"
        tabIndex={-1}
        draggable={false}
        onClick={(e) => {
          // Allow keyboard Enter on card to navigate; prevent double-nav from link
          if (e.detail === 0) return;
        }}
      >
        <h3 className="board-card-title">{project.title}</h3>
        <div className="board-card-meta">
          <span>{TYPE_LABELS[project.type]} · </span>
          {project.deadline ? (
            <time className="card-deadline" dateTime={project.deadline}>
              Due {project.deadline}
            </time>
          ) : (
            <span>No deadline</span>
          )}
        </div>
        <div className="board-card-progress-line" aria-hidden>
          <span style={{ width: `${project.progress_pct}%` }} />
        </div>
      </Link>
      {draggable ? (
        // A text glyph avoids a decorative gradient while keeping the drag affordance visual-only.
        <span className="board-card-handle" aria-hidden title="Drag to change status">⠿</span>
      ) : null}
    </article>
  );
}
