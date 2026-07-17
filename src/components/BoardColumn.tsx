import type { Project, ProjectStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { BoardCard } from './BoardCard';

type Props = {
  status: ProjectStatus;
  projects: Project[];
  idleDays: number;
  isDropTarget: boolean;
  focusedProjectId: string | null;
  onDragOver: (status: ProjectStatus) => void;
  onDragLeave: () => void;
  onDrop: (status: ProjectStatus, projectId: string | null) => void;
  onCardDragStart: (projectId: string) => void;
  onCardDragEnd: () => void;
  onCardFocus: (projectId: string) => void;
  onCardKeyDown: (projectId: string, e: React.KeyboardEvent) => void;
  registerCardRef: (projectId: string, el: HTMLElement | null) => void;
};

export function BoardColumn({
  status,
  projects,
  idleDays,
  isDropTarget,
  focusedProjectId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardFocus,
  onCardKeyDown,
  registerCardRef,
}: Props) {
  return (
    <section
      className={`board-column ${isDropTarget ? 'board-column-drop' : ''}`}
      aria-label={`${STATUS_LABELS[status]} column`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(status);
      }}
      onDragLeave={() => onDragLeave()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || null;
        onDrop(status, id);
      }}
    >
      <header className="board-column-header">
        <span className={`status-dot status-${status}`} aria-hidden />
        <h2 className="board-column-title">{STATUS_LABELS[status]}</h2>
        <span className="board-column-count">{projects.length}</span>
      </header>
      <div className="board-column-body">
        {projects.length === 0 ? (
          <p className="board-column-empty">No projects</p>
        ) : (
          projects.map((p) => (
            <BoardCard
              key={p.id}
              project={p}
              idleDays={idleDays}
              focused={focusedProjectId === p.id}
              cardRef={(el) => registerCardRef(p.id, el)}
              onFocus={() => onCardFocus(p.id)}
              onKeyDown={(e) => onCardKeyDown(p.id, e)}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </section>
  );
}
