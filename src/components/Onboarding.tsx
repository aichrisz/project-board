import { Link } from 'react-router-dom';
import { useProjects } from '../store/ProjectContext';

type Props = {
  onSkip: () => void;
};

export function Onboarding({ onSkip }: Props) {
  const { loadSeed } = useProjects();

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <p className="onboarding-kicker">Welcome</p>
        <h2 id="onboarding-title" className="onboarding-title">
          Your Project Board is ready
        </h2>
        <p className="onboarding-desc">
          Track side projects in one place — status, steps, notes, and deadlines.
          Everything stays in this browser. Load a realistic inventory that
          mirrors projects on this host, or create your first project.
        </p>
        <div className="onboarding-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => loadSeed('replace')}
          >
            Load realistic inventory
          </button>
          <Link to="/new" className="btn btn-secondary">
            Create project
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </section>
  );
}
