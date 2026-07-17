import type { StatsResult } from '../lib/stats';
import { PROJECT_STATUSES, PROJECT_TYPES, STATUS_LABELS, TYPE_LABELS } from '../types';

type Props = {
  stats: StatsResult;
};

function Bars({
  items,
  total,
}: {
  items: { key: string; label: string; count: number }[];
  total: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="stat-bars">
      {items.map((item) => (
        <li key={item.key} className="stat-bar-row">
          <span className="stat-bar-label">{item.label}</span>
          <div className="stat-bar-track" aria-hidden>
            <div
              className="stat-bar-fill"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="stat-bar-count">
            {item.count}
            {total > 0 ? (
              <span className="stat-bar-pct">
                {' '}
                ({Math.round((item.count / total) * 100)}%)
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatsPanel({ stats }: Props) {
  const byType = PROJECT_TYPES.map((t) => ({
    key: t,
    label: TYPE_LABELS[t],
    count: stats.byType[t],
  }));
  const byStatus = PROJECT_STATUSES.map((s) => ({
    key: s,
    label: STATUS_LABELS[s],
    count: stats.byStatus[s],
  }));

  return (
    <section className="stats-panel" aria-label="Statistics">
      <div className="stats-block">
        <h2 className="stats-title">By type</h2>
        <Bars items={byType} total={stats.total} />
      </div>
      <div className="stats-block">
        <h2 className="stats-title">By status</h2>
        <Bars items={byStatus} total={stats.total} />
      </div>
    </section>
  );
}
