import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeReviewBuckets,
  computeReviewKpis,
  suggestReviewActions,
} from '../lib/review';
import { openWeeklySnapshot } from '../lib/snapshot';
import { useProjects } from '../store/ProjectContext';
import { STATUS_LABELS, TYPE_LABELS } from '../types';
import type { Project } from '../types';

function ProjectListSection({
  title,
  projects,
  emptyLabel = 'None — nice.',
}: {
  title: string;
  projects: Project[];
  emptyLabel?: string;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">
        {title}
        <span className="review-section-count">{projects.length}</span>
      </h2>
      {projects.length === 0 ? (
        <p className="muted review-empty">{emptyLabel}</p>
      ) : (
        <ul className="review-project-list">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/project/${p.id}`} className="review-project-link">
                <span className="review-project-title">{p.title}</span>
                <span className="review-project-meta muted">
                  {STATUS_LABELS[p.status]} · {TYPE_LABELS[p.type]}
                  {p.deadline ? ` · ${p.deadline}` : ''}
                  {p.progress_pct != null ? ` · ${p.progress_pct}%` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Review() {
  const { projects, settings, softArchiveIdle, exportData, ready } =
    useProjects();
  const [message, setMessage] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeReviewKpis(projects, settings.idleDays),
    [projects, settings.idleDays],
  );
  const buckets = useMemo(
    () => computeReviewBuckets(projects, settings.idleDays),
    [projects, settings.idleDays],
  );
  const suggestions = useMemo(
    () => suggestReviewActions(projects, settings),
    [projects, settings],
  );

  function handleSoftArchiveIdle() {
    const n = buckets.staleInProgress.length;
    if (n === 0) return;
    if (
      !window.confirm(
        `Soft-archive ${n} idle in-progress project${n === 1 ? '' : 's'}? They move to Archived (not deleted).`,
      )
    ) {
      return;
    }
    const count = softArchiveIdle();
    setMessage(
      count > 0
        ? `Soft-archived ${count} idle project${count === 1 ? '' : 's'}.`
        : 'No idle in-progress projects to archive.',
    );
  }

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="review-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Weekly review</h1>
          <p className="page-subtitle">
            Steady ritual: overdue, due soon, idle work, missing steps, and a few
            rule-based nudges. Nothing leaves the browser.
          </p>
        </div>
      </div>

      {message && (
        <p className="banner success" role="status">
          {message}
        </p>
      )}

      <div className="kpi-row review-kpi-row" role="group" aria-label="Review KPIs">
        <div className="kpi-card">
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{kpis.active}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">In progress</div>
          <div className="kpi-value">{kpis.inProgress}</div>
        </div>
        <div className={`kpi-card${kpis.overdue > 0 ? ' kpi-danger' : ''}`}>
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value">{kpis.overdue}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Idle</div>
          <div className="kpi-value">{kpis.idle}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Starred</div>
          <div className="kpi-value">{kpis.starred}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Due ≤7d</div>
          <div className="kpi-value">{kpis.dueSoon}</div>
        </div>
      </div>

      <div className="settings-actions review-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={buckets.staleInProgress.length === 0}
          onClick={handleSoftArchiveIdle}
        >
          Soft-archive all idle in progress
          {buckets.staleInProgress.length > 0
            ? ` (${buckets.staleInProgress.length})`
            : ''}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => openWeeklySnapshot(projects)}
        >
          Open weekly snapshot
        </button>
        <button type="button" className="btn btn-primary" onClick={exportData}>
          Export JSON
        </button>
      </div>

      <section className="panel">
        <h2 className="panel-title">Suggested actions</h2>
        <ul className="review-suggestions">
          {suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <div className="review-sections">
        <ProjectListSection title="Overdue" projects={buckets.overdue} />
        <ProjectListSection title="Due soon" projects={buckets.dueSoon} />
        <ProjectListSection
          title="Stale in progress"
          projects={buckets.staleInProgress}
        />
        <ProjectListSection title="No steps" projects={buckets.noSteps} />
      </div>
    </div>
  );
}
