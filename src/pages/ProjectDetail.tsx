import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LinkChips } from '../components/LinkChips';
import { ProjectForm } from '../components/ProjectForm';
import { StepList } from '../components/StepList';
import { Toast } from '../components/Toast';
import { daysUntilDeadline, getHealth, isOverdue } from '../lib/health';
import { createId } from '../lib/id';
import { renderMarkdownSafe } from '../lib/markdown';
import { useProjects } from '../store/ProjectContext';
import type { LinkItem, ProjectStatus, ProjectType } from '../types';
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../types';

type UndoToast = {
  message: string;
  previousStatus: ProjectStatus;
  projectId: string;
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    getProject,
    updateProject,
    deleteProject,
    duplicateProject,
    toggleStep,
    addStep,
    removeStep,
    reorderSteps,
    setAllStepsDone,
    removeCompletedSteps,
    settings,
  } = useProjects();
  const project = id ? getProject(id) : undefined;
  const [editing, setEditing] = useState(false);
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('edit');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);

  const dismissToast = useCallback(() => setUndoToast(null), []);

  const health = useMemo(
    () => (project ? getHealth(project, settings.idleDays) : null),
    [project, settings.idleDays],
  );
  const days = project ? daysUntilDeadline(project) : null;

  if (!project) {
    return (
      <div className="detail-page">
        <p className="muted">Project not found.</p>
        <Link to="/" className="btn btn-ghost">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="detail-page">
        <div className="page-header">
          <h1 className="page-title">Edit project</h1>
        </div>
        <ProjectForm
          initial={project}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(input) => {
            updateProject(project.id, {
              title: input.title,
              type: input.type,
              status: input.status,
              summary: input.summary ?? '',
              notes_md: input.notes_md ?? '',
              deadline: input.deadline ?? null,
              tags: input.tags ?? [],
              stack: input.stack ?? [],
              progress_pct: input.progress_pct ?? project.progress_pct,
            });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    const next: LinkItem[] = [
      ...project!.links,
      { id: createId('link'), label: linkLabel.trim(), url: linkUrl.trim() },
    ];
    updateProject(project!.id, { links: next });
    setLinkLabel('');
    setLinkUrl('');
  }

  function removeLink(linkId: string) {
    updateProject(project!.id, {
      links: project!.links.filter((l) => l.id !== linkId),
    });
  }

  function softArchive() {
    if (!project || project.status === 'archived') return;
    const previousStatus = project.status;
    updateProject(project.id, { status: 'archived' });
    setUndoToast({
      message: 'Archived',
      previousStatus,
      projectId: project.id,
    });
  }

  function undoArchive() {
    if (!undoToast) return;
    updateProject(undoToast.projectId, { status: undoToast.previousStatus });
    setUndoToast(null);
  }

  return (
    <div className="detail-page">
      <div className="detail-nav">
        <Link to="/" className="back-link">
          ← Dashboard
        </Link>
        <div className="detail-actions">
          <button
            type="button"
            className={`btn btn-ghost star-btn${project.starred ? ' starred' : ''}`}
            aria-label={project.starred ? 'Unstar project' : 'Star project'}
            aria-pressed={!!project.starred}
            onClick={() =>
              updateProject(project.id, { starred: !project.starred })
            }
          >
            {project.starred ? '★ Starred' : '☆ Star'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const copy = duplicateProject(project.id);
              if (copy) navigate(`/project/${copy.id}`);
            }}
          >
            Duplicate
          </button>
          {project.status !== 'archived' && (
            <button type="button" className="btn btn-ghost" onClick={softArchive}>
              Archive
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm(`Delete “${project.title}”? This cannot be undone.`)) {
                deleteProject(project.id);
                navigate('/');
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <header className="detail-header">
        <div className="card-top">
          <span className={`status-chip status-${project.status}`}>
            {STATUS_LABELS[project.status]}
          </span>
          <span className="type-chip">{TYPE_LABELS[project.type]}</span>
          {project.starred && (
            <span className="badge badge-starred" aria-label="Starred">
              ★ Starred
            </span>
          )}
          {health === 'at_risk' && (
            <span className="badge badge-risk">
              {isOverdue(project) ? 'Overdue' : 'At risk'}
            </span>
          )}
          {health === 'idle' && <span className="badge badge-idle">Idle</span>}
        </div>
        <h1 className="page-title">{project.title}</h1>
        {project.summary ? <p className="page-subtitle">{project.summary}</p> : null}
      </header>

      <div className="detail-grid">
        <section className="panel">
          <h2 className="panel-title">Progress</h2>
          <div className="progress-block large">
            <div className="progress-meta">
              <span>
                {project.steps.length > 0
                  ? 'Auto from steps'
                  : 'Manual (add steps to auto-calculate)'}
              </span>
              <span>{project.progress_pct}%</span>
            </div>
            <div className="progress-track" aria-hidden>
              <div
                className="progress-fill"
                style={{ width: `${project.progress_pct}%` }}
              />
            </div>
          </div>
          {!project.steps.length && (
            <label className="field">
              <span>Manual progress %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={project.progress_pct}
                onChange={(e) =>
                  updateProject(project.id, {
                    progress_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
              />
            </label>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Meta</h2>
          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select
                value={project.status}
                onChange={(e) =>
                  updateProject(project.id, {
                    status: e.target.value as ProjectStatus,
                  })
                }
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Type</span>
              <select
                value={project.type}
                onChange={(e) =>
                  updateProject(project.id, {
                    type: e.target.value as ProjectType,
                  })
                }
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Deadline</span>
            <div className="deadline-row">
              <input
                type="date"
                value={project.deadline ?? ''}
                onChange={(e) =>
                  updateProject(project.id, {
                    deadline: e.target.value || null,
                  })
                }
              />
              {project.deadline && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => updateProject(project.id, { deadline: null })}
                >
                  Clear
                </button>
              )}
            </div>
            {days !== null && (
              <p className={`deadline-hint ${days < 0 ? 'danger' : days <= 3 ? 'warn' : ''}`}>
                {days < 0
                  ? `${Math.abs(days)} day(s) overdue`
                  : days === 0
                    ? 'Due today'
                    : `${days} day(s) remaining`}
              </p>
            )}
          </label>
          {project.tags.length > 0 && (
            <div className="tag-list">
              {project.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          {project.stack.length > 0 && (
            <p className="muted stack-line">Stack: {project.stack.join(', ')}</p>
          )}
        </section>

        <section className="panel panel-wide">
          <h2 className="panel-title">Steps</h2>
          <StepList
            steps={project.steps}
            onToggle={(stepId) => toggleStep(project.id, stepId)}
            onAdd={(title) => addStep(project.id, title)}
            onRemove={(stepId) => removeStep(project.id, stepId)}
            onReorder={(orderedIds) => reorderSteps(project.id, orderedIds)}
            onMarkAllDone={() => setAllStepsDone(project.id, true)}
            onClearAllDone={() => setAllStepsDone(project.id, false)}
            onRemoveCompleted={() => removeCompletedSteps(project.id)}
          />
        </section>

        <section className="panel panel-wide">
          <div className="panel-title-row">
            <h2 className="panel-title">Notes</h2>
            <div className="segmented" role="group" aria-label="Notes mode">
              <button
                type="button"
                className={`seg-btn ${notesMode === 'edit' ? 'active' : ''}`}
                onClick={() => setNotesMode('edit')}
              >
                Edit
              </button>
              <button
                type="button"
                className={`seg-btn ${notesMode === 'preview' ? 'active' : ''}`}
                onClick={() => setNotesMode('preview')}
              >
                Preview
              </button>
            </div>
          </div>
          {notesMode === 'edit' ? (
            <textarea
              className="notes-area"
              value={project.notes_md}
              onChange={(e) => updateProject(project.id, { notes_md: e.target.value })}
              rows={8}
              placeholder="Markdown subset: **bold**, *italic*, `code`, lists, [links](https://…)"
            />
          ) : project.notes_md.trim() ? (
            <div
              className="md-preview"
              dangerouslySetInnerHTML={{
                __html: renderMarkdownSafe(project.notes_md),
              }}
            />
          ) : (
            <p className="muted">No notes yet. Switch to Edit to add some.</p>
          )}
        </section>

        <section className="panel panel-wide">
          <h2 className="panel-title">Links</h2>
          {project.links.length === 0 ? (
            <p className="muted">No links yet.</p>
          ) : (
            <div className="detail-links">
              <LinkChips
                links={project.links}
                onRemove={(linkId) => removeLink(linkId)}
              />
              <ul className="link-url-list muted" aria-label="Link URLs">
                {project.links.map((l) => (
                  <li key={l.id}>
                    <span className="link-url-label">{l.label}:</span>{' '}
                    <span className="link-url">{l.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form className="link-add" onSubmit={addLink}>
            <input
              type="text"
              placeholder="Label"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              aria-label="Link label"
            />
            <input
              type="text"
              placeholder="https://… or /local/path"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              aria-label="Link URL"
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={!linkLabel.trim() || !linkUrl.trim()}
            >
              Add link
            </button>
          </form>
        </section>
      </div>

      <p className="meta-timestamps muted">
        Updated {new Date(project.updated_at).toLocaleString()} · Created{' '}
        {new Date(project.created_at).toLocaleString()}
      </p>

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
