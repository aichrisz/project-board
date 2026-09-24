import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ActivityEvent, Project } from '../types';
import {
  deriveKeepMoving,
  deriveLatestWins,
  deriveNeedsAttention,
} from '../lib/weeklyDigest';

type Props = {
  projects: Project[];
  activity: ActivityEvent[];
};

function winDate(at: string): string {
  return at.slice(0, 10);
}

export function WeeklyDigest({ projects, activity }: Props) {
  const keepMoving = useMemo(() => deriveKeepMoving(projects), [projects]);
  const attention = useMemo(() => deriveNeedsAttention(projects), [projects]);
  const wins = useMemo(
    () => deriveLatestWins(projects, activity),
    [projects, activity],
  );

  return (
    <section
      className="panel weekly-digest"
      aria-labelledby="weekly-digest-title"
    >
      <h2 id="weekly-digest-title" className="panel-title">
        Weekly digest
      </h2>
      <div className="weekly-digest-grid">
        <div className="weekly-digest-stack">
          <section
            className="weekly-digest-section"
            aria-labelledby="weekly-digest-moving-title"
          >
            <h3 id="weekly-digest-moving-title" className="weekly-digest-subtitle">
              Keep moving
            </h3>
            {keepMoving.length === 0 ? (
              <p className="muted weekly-digest-empty">
                No projects in progress.{' '}
                <Link to="/board" className="weekly-digest-empty-link">
                  Open board
                </Link>{' '}
                to start one.
              </p>
            ) : (
              <ul className="weekly-digest-list">
                {keepMoving.map((item) => (
                  <li key={item.projectId} className="weekly-digest-item">
                    <Link
                      to={`/project/${item.projectId}`}
                      className="weekly-digest-link"
                    >
                      <span className="weekly-digest-name">{item.title}</span>
                      <span className="weekly-digest-signals">
                        <span className="weekly-digest-signal">
                          <span className="weekly-digest-signal-label">
                            Next action
                          </span>
                          <span className="weekly-digest-signal-value">
                            {item.nextAction ?? 'No next action recorded'}
                          </span>
                        </span>
                        <span className="weekly-digest-signal">
                          <span className="weekly-digest-signal-label">
                            Blocker
                          </span>
                          <span className="weekly-digest-signal-value">
                            {item.blocker ?? 'No blocker recorded'}
                          </span>
                        </span>
                        {item.freshness && (
                          <span className="weekly-digest-signal">
                            <span className="weekly-digest-signal-label">
                              Freshness
                            </span>
                            <span className="weekly-digest-signal-value">
                              {item.freshness}
                            </span>
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="weekly-digest-section"
            aria-labelledby="weekly-digest-attention-title"
          >
            <h3
              id="weekly-digest-attention-title"
              className="weekly-digest-subtitle"
            >
              Needs attention
            </h3>
            {attention.length === 0 ? (
              <p className="muted weekly-digest-empty">
                Nothing needs attention.
              </p>
            ) : (
              <ul className="weekly-digest-list">
                {attention.map((item) => (
                  <li key={item.projectId} className="weekly-digest-item">
                    <Link
                      to={`/project/${item.projectId}`}
                      className="weekly-digest-link weekly-digest-attention-link"
                    >
                      <span className="weekly-digest-name">{item.title}</span>
                      {item.blocker && (
                        <span className="weekly-digest-reason">
                          Blocker: {item.blocker}
                        </span>
                      )}
                      {item.freshness && (
                        <span className="weekly-digest-reason">
                          Freshness: {item.freshness}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section
          className="weekly-digest-section weekly-digest-wins"
          aria-labelledby="weekly-digest-wins-title"
        >
          <h3 id="weekly-digest-wins-title" className="weekly-digest-subtitle">
            Latest wins
          </h3>
          {wins.length === 0 ? (
            <p className="muted weekly-digest-empty">No wins recorded yet.</p>
          ) : (
            <ul className="weekly-digest-list">
              {wins.map((win) => (
                <li key={win.key} className="weekly-digest-item">
                  <Link
                    to={win.projectId ? `/project/${win.projectId}` : '/activity'}
                    className="weekly-digest-link weekly-digest-win-link"
                  >
                    <time className="weekly-digest-win-date" dateTime={win.at}>
                      {winDate(win.at)}
                    </time>
                    <span className="weekly-digest-win-text">{win.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
