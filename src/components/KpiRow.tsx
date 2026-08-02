import type { StatsResult } from '../lib/stats';

type Props = {
  stats: StatsResult;
  showCompleted: boolean;
};

export function KpiRow({ stats, showCompleted }: Props) {
  return (
    <section className="kpi-ledger" aria-label="Key metrics">
      <div className="kpi-cell">
        <span className="kpi-label">Active</span>
        <span className="kpi-figure">{stats.active}</span>
      </div>
      <div className="kpi-cell">
        <span className="kpi-label">Ideas</span>
        <span className="kpi-figure">{stats.ideas}</span>
      </div>
      <div className={`kpi-cell ${stats.overdue > 0 ? 'kpi-cell-danger' : ''}`}>
        <span className="kpi-label">Overdue</span>
        <span className="kpi-figure">{stats.overdue}</span>
      </div>
      <div className="kpi-cell">
        <span className="kpi-label">Completed</span>
        <span className="kpi-figure">
          {stats.completed}
          {!showCompleted && stats.completed > 0 ? (
            <span className="kpi-hint"> hidden</span>
          ) : null}
        </span>
      </div>
    </section>
  );
}
