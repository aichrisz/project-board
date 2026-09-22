import { Link } from 'react-router';
import type { Project } from '../types';
import {
  getBlocker,
  getFreshness,
  getFocusProjects,
  getNextAction,
} from '../lib/projectSignals';

type Props = {
  projects: Project[];
};

export function FocusProjects({ projects }: Props) {
  const focus = getFocusProjects(projects);

  return (
    <section className="focus-projects" aria-labelledby="focus-projects-title">
      <div className="section-head">
        <h2 id="focus-projects-title" className="section-label">
          Focus
        </h2>
        {focus.total > focus.projects.length && (
          <Link to="/review" className="focus-projects-overflow">
            {focus.total - focus.projects.length} more active{' '}
            {focus.total - focus.projects.length === 1 ? 'project' : 'projects'} in Review
          </Link>
        )}
      </div>

      {focus.projects.length === 0 ? (
        <div className="focus-projects-empty">
          <p>No active projects to focus on.</p>
          <Link to="/board" className="focus-projects-empty-link">
            Open board
          </Link>
        </div>
      ) : (
        <div className="focus-project-grid">
          {focus.projects.map((project) => {
            const nextAction = getNextAction(project);
            const blocker = getBlocker(project);
            const freshness = getFreshness(project);

            return (
              <article key={project.id} className="focus-project-card">
                <Link to={`/project/${project.id}`} className="focus-project-link">
                  <h3 className="focus-project-title">{project.title}</h3>
                  <div className="focus-project-signals">
                    <div className="focus-project-signal">
                      <span className="focus-project-signal-label">Next action</span>
                      <span className="focus-project-signal-value">
                        {nextAction?.title ?? 'No next action recorded'}
                      </span>
                    </div>
                    <div className="focus-project-signal">
                      <span className="focus-project-signal-label">Blocker</span>
                      <span className="focus-project-signal-value">
                        {blocker ?? 'No blocker recorded'}
                      </span>
                    </div>
                    {freshness && (
                      <div className="focus-project-signal">
                        <span className="focus-project-signal-label">Freshness</span>
                        <span className="focus-project-signal-value">{freshness}</span>
                      </div>
                    )}
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
