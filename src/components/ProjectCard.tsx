import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Project } from '../types';
import { STATUS_LABELS, TYPE_LABELS } from '../types';
import { HealthBadges } from './HealthBadges';
import { LinkChips } from './LinkChips';

type Props = {
  project: Project;
  idleDays: number;
  onToggleStar: (id: string) => void;
  onAddStep: (projectId: string, title: string) => void;
  onArchive: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export function ProjectCard({
  project,
  idleDays,
  onToggleStar,
  onAddStep,
  onArchive,
  onDuplicate,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [stepDraft, setStepDraft] = useState('');

  function stop(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function submitStep(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const t = stepDraft.trim();
    if (!t) return;
    onAddStep(project.id, t);
    setStepDraft('');
    setAdding(false);
  }

  const canArchive = project.status !== 'archived';

  return (
    <article
      className={`project-card${project.starred ? ' project-card-starred' : ''}`}
    >
      <div className="card-top">
        <span className={`status-chip status-${project.status}`}>
          {STATUS_LABELS[project.status]}
        </span>
        <span className="type-chip">{TYPE_LABELS[project.type]}</span>
        <div className="card-actions">
          <button
            type="button"
            className={`btn-icon star-btn${project.starred ? ' starred' : ''}`}
            aria-label={project.starred ? 'Unstar project' : 'Star project'}
            aria-pressed={!!project.starred}
            onClick={(e) => {
              stop(e);
              onToggleStar(project.id);
            }}
          >
            {project.starred ? '★' : '☆'}
          </button>
        </div>
      </div>

      <Link to={`/project/${project.id}`} className="card-main-link">
        <h3 className="card-title">{project.title}</h3>
        {project.summary ? (
          <p className="card-summary">{project.summary}</p>
        ) : null}

        <div className="progress-block">
          <div className="progress-meta">
            <span>Progress</span>
            <span>{project.progress_pct}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className="progress-fill"
              style={{ width: `${project.progress_pct}%` }}
            />
          </div>
        </div>

        <div className="card-footer">
          <HealthBadges project={project} idleDays={idleDays} showSteps />
          {project.deadline && (
            <time className="card-deadline" dateTime={project.deadline}>
              {project.deadline}
            </time>
          )}
        </div>
      </Link>

      {project.links.length > 0 && (
        <div
          className="card-links"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <LinkChips links={project.links} max={2} compact />
        </div>
      )}

      <div className="card-quick">
        {adding ? (
          <form className="card-step-add" onSubmit={submitStep}>
            <input
              type="text"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Step title…"
              aria-label="New step title"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setAdding(false);
                  setStepDraft('');
                }
              }}
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={!stepDraft.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                stop(e);
                setAdding(false);
                setStepDraft('');
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="card-quick-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                stop(e);
                setAdding(true);
              }}
            >
              + step
            </button>
            {onDuplicate && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  stop(e);
                  onDuplicate(project.id);
                }}
              >
                Duplicate
              </button>
            )}
            {canArchive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  stop(e);
                  onArchive(project.id);
                }}
              >
                Archive
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
