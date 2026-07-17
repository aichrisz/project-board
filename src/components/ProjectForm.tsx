import { useState } from 'react';
import type { Project, ProjectStatus, ProjectType } from '../types';
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../types';
import type { ProjectInput } from '../store/ProjectContext';

type Props = {
  initial?: Project;
  submitLabel?: string;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
};

export function ProjectForm({ initial, submitLabel = 'Save', onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<ProjectType>(initial?.type ?? 'other');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'idea');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [notes_md, setNotes] = useState(initial?.notes_md ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [stack, setStack] = useState((initial?.stack ?? []).join(', '));
  const [progress_pct, setProgress] = useState(initial?.progress_pct ?? 0);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    onSubmit({
      title: title.trim(),
      type,
      status,
      summary: summary.trim(),
      notes_md,
      deadline: deadline || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      stack: stack
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      progress_pct: Number.isFinite(progress_pct) ? progress_pct : 0,
      steps: initial?.steps,
      links: initial?.links,
    });
  }

  const hasSteps = (initial?.steps.length ?? 0) > 0;

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="field">
        <span>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          placeholder="Project name"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Summary</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line description"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Deadline</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Progress {hasSteps ? '(from steps)' : '%'}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={hasSteps ? initial?.progress_pct ?? 0 : progress_pct}
            disabled={hasSteps}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="field">
        <span>Tags (comma-separated)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="canvas, mvp" />
      </label>

      <label className="field">
        <span>Stack (comma-separated)</span>
        <input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="react, vite" />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          value={notes_md}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Operational notes…"
        />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
