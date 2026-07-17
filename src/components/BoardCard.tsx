import { Link } from 'react-router-dom';
import type { Project } from '../types';
import { TYPE_LABELS } from '../types';
import { HealthBadges } from './HealthBadges';

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
  idleDays,
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
        <div className="board-card-top">
          <span className="type-chip">{TYPE_LABELS[project.type]}</span>
          <span className="board-card-progress">{project.progress_pct}%</span>
        </div>
        <h3 className="board-card-title">{project.title}</h3>
        {project.summary ? (
          <p className="board-card-summary">{project.summary}</p>
        ) : null}
        <div className="board-card-footer">
          <HealthBadges project={project} idleDays={idleDays} />
          {project.deadline ? (
            <time className="card-deadline" dateTime={project.deadline}>
              {project.deadline}
            </time>
          ) : null}
        </div>
      </Link>
      {draggable ? (
        <span className="board-card-handle" aria-hidden title="Drag to change status">
          ⋮⋮
        </span>
      ) : null}
    </article>
  );
}
