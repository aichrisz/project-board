import { daysUntilDeadline, getHealth } from '../lib/health';
import type { Project } from '../types';

type Props = {
  project: Project;
  idleDays: number;
  /** Include step count badge (dashboard cards). */
  showSteps?: boolean;
};

/**
 * Clear health signals: Overdue, At risk, Idle.
 * Overdue takes priority over at-risk window; idle is separate.
 */
export function HealthBadges({ project, idleDays, showSteps = false }: Props) {
  const health = getHealth(project, idleDays);
  const days = daysUntilDeadline(project);
  const doneSteps = project.steps.filter((s) => s.done).length;
  const isOverdue = health === 'at_risk' && days !== null && days < 0;

  return (
    <div className="card-badges">
      {isOverdue && (
        <span className="badge badge-overdue" title="Deadline has passed">
          Overdue
        </span>
      )}
      {health === 'at_risk' && !isOverdue && (
        <span className="badge badge-risk" title="Deadline within 3 days">
          At risk
        </span>
      )}
      {health === 'idle' && (
        <span className="badge badge-idle" title={`No updates for ${idleDays}+ days`}>
          Idle
        </span>
      )}
      {showSteps && project.steps.length > 0 && (
        <span className="badge badge-muted">
          {doneSteps}/{project.steps.length} steps
        </span>
      )}
    </div>
  );
}
