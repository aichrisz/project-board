import { Link } from 'react-router-dom';
import { useProjects } from '../store/ProjectContext';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

type Props = {
  limit?: number;
};

export function RecentActivity({ limit = 5 }: Props) {
  const { activity } = useProjects();
  const items = activity.slice(0, limit);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="recent-activity" aria-label="Recent activity">
      <div className="recent-activity-header">
        <h2 className="recent-activity-title">Recent</h2>
        <Link to="/activity" className="recent-activity-link">
          View all
        </Link>
      </div>
      <ul className="recent-activity-list">
        {items.map((e) => (
          <li key={e.id} className="recent-activity-item">
            <span className="recent-activity-msg">
              {e.projectId ? (
                <Link to={`/project/${e.projectId}`}>{e.message}</Link>
              ) : (
                e.message
              )}
            </span>
            <time
              className="recent-activity-time"
              dateTime={e.at}
              title={new Date(e.at).toLocaleString()}
            >
              {formatRelative(e.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
