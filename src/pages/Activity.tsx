import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useProjects } from '../store/ProjectContext';
import type { ActivityType } from '../types';

const TYPE_LABELS: Record<ActivityType, string> = {
  project_created: 'Created',
  status_changed: 'Status',
  step_toggled: 'Step',
  project_deleted: 'Deleted',
  import: 'Import',
  seed: 'Seed',
  reset: 'Reset',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Activity() {
  const { activity, ready } = useProjects();

  if (!ready) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="activity-page">
      <div className="page-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle">
          Recent changes on this board (last {activity.length} events, capped at
          100). Stored locally in your browser.
        </p>
      </div>

      {activity.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Create a project, change a status, or toggle a step to see events here."
          action={
            <Link to="/new" className="btn btn-primary">
              + New project
            </Link>
          }
        />
      ) : (
        <ol className="activity-feed" aria-label="Activity log">
          {activity.map((e) => (
            <li key={e.id} className="activity-feed-item">
              <span className={`activity-type activity-type-${e.type}`}>
                {TYPE_LABELS[e.type] ?? e.type}
              </span>
              <div className="activity-feed-body">
                <p className="activity-feed-msg">
                  {e.projectId ? (
                    <Link to={`/project/${e.projectId}`}>{e.message}</Link>
                  ) : (
                    e.message
                  )}
                </p>
                <time
                  className="activity-feed-time"
                  dateTime={e.at}
                  title={new Date(e.at).toLocaleString()}
                >
                  {formatWhen(e.at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
