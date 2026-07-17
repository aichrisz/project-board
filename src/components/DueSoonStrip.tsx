import { Link } from 'react-router-dom';
import { daysUntil } from '../lib/dueSoon';
import type { Project } from '../types';

type Props = {
  projects: Project[];
};

function dueLabel(deadline: string): string {
  const d = daysUntil(deadline);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d}d`;
}

export function DueSoonStrip({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <section className="due-soon-strip" aria-label="Due soon">
      <div className="due-soon-header">
        <h2 className="due-soon-title">Due soon</h2>
        <span className="due-soon-count">{projects.length}</span>
      </div>
      <ul className="due-soon-list">
        {projects.map((p) => {
          const d = daysUntil(p.deadline!);
          const urgency = d < 0 ? 'overdue' : d <= 3 ? 'soon' : 'week';
          return (
            <li key={p.id}>
              <Link
                to={`/project/${p.id}`}
                className={`due-soon-item due-${urgency}`}
              >
                <span className="due-soon-item-title">{p.title}</span>
                <time
                  className="due-soon-item-meta"
                  dateTime={p.deadline!}
                >
                  {dueLabel(p.deadline!)}
                </time>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
