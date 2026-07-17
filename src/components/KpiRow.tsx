import type { StatsResult } from '../lib/stats';

type Props = {
  stats: StatsResult;
  showCompleted: boolean;
};

export function KpiRow({ stats, showCompleted }: Props) {
  return (
    <section className="kpi-row" aria-label="Key metrics">
      <div className="kpi-card">
        <span className="kpi-label">Active</span>
        <span className="kpi-value">{stats.active}</span>
      </div>
      <div className="kpi-card">
        <span className="kpi-label">Ideas</span>
        <span className="kpi-value">{stats.ideas}</span>
      </div>
      <div className={`kpi-card ${stats.overdue > 0 ? 'kpi-danger' : ''}`}>
        <span className="kpi-label">Overdue</span>
        <span className="kpi-value">{stats.overdue}</span>
      </div>
      <div className="kpi-card">
        <span className="kpi-label">Completed</span>
        <span className="kpi-value">
          {stats.completed}
          {!showCompleted && stats.completed > 0 ? (
            <span className="kpi-hint"> hidden</span>
          ) : null}
        </span>
      </div>
    </section>
  );
}
