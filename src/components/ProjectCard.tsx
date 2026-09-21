import { useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { Project } from '../types';
import { ACTIVE_STATUSES, STATUS_LABELS, TYPE_LABELS } from '../types';
import { getFreshness, getNextAction } from '../lib/projectSignals';
import { LinkChips } from './LinkChips';

type Props = {
  project: Project;
  idleDays: number;
  onToggleStar: (id: string) => void;
  onAddStep: (projectId: string, title: string) => void;
  onArchive: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onStartFocus?: (id: string) => void;
};

export function ProjectCard({
  project,
  onToggleStar,
  onAddStep,
  onArchive,
  onDuplicate,
  onStartFocus,
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
  const canStartFocus = ACTIVE_STATUSES.includes(project.status);
  const nextAction = getNextAction(project);
  const freshness = getFreshness(project);

  return (
    <article
      className={`project-card${project.starred ? ' project-card-starred' : ''}`}
      data-status={project.status}
    >
      <div className="card-head">
        <Link to={`/project/${project.id}`} className="card-main-link">
          <h3 className="card-title">{project.title}</h3>
        </Link>
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

      <div className="card-meta">
        <span>{STATUS_LABELS[project.status]}</span>
        <span>{TYPE_LABELS[project.type]}</span>
        {project.tags.map((tag) => (
          <span key={tag} className="card-tag">{tag}</span>
        ))}
      </div>

      <Link to={`/project/${project.id}`} className="card-progress-link">

        <div className="progress-block">
          <div className="progress-meta">
            <span>
              {project.steps.filter((step) => step.done).length}/{project.steps.length}{' '}
              steps · {project.progress_pct}%
            </span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className="progress-fill"
              style={{ width: `${project.progress_pct}%` }}
            />
          </div>
        </div>
      </Link>

      {(nextAction || freshness) && (
        <div className="card-signals">
          {nextAction && (
            <div className="card-next-action">
              <span className="card-signal-label">Next action</span>
              <span className="card-next-action-value">{nextAction.title}</span>
            </div>
          )}
          {freshness && <span className="card-freshness">{freshness}</span>}
        </div>
      )}

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
            {onStartFocus && canStartFocus && (
              <button
                type="button"
                className="btn btn-ghost btn-sm focus-session-start"
                onClick={(e) => {
                  stop(e);
                  onStartFocus(project.id);
                }}
              >
                Start focus
              </button>
            )}
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
