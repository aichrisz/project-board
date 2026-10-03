import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Link } from 'react-router';
import type { Project } from '../types';
import { ACTIVE_STATUSES, STATUS_LABELS, TYPE_LABELS } from '../types';
import type { BlockerNoteResult } from '../lib/blocker';
import type { NextActionEditResult } from '../lib/projectSignals';
import { getBlocker, getFreshness, getNextAction } from '../lib/projectSignals';
import { LinkChips } from './LinkChips';

type BlockerUpdateResult = BlockerNoteResult | { kind: 'missing' | 'not-ready' };
type NextActionUpdateResult = NextActionEditResult | { kind: 'missing' | 'not-ready' };

type Props = {
  project: Project;
  idleDays: number;
  onToggleStar: (id: string) => void;
  onAddStep: (projectId: string, title: string) => void;
  onUpdateBlocker: (
    projectId: string,
    text: string | null,
  ) => BlockerUpdateResult;
  onUpdateNextAction: (
    projectId: string,
    stepId: string,
    originalTitle: string,
    originalOrder: number,
    title: string,
  ) => NextActionUpdateResult;
  activeCardEditorProjectId: string | null;
  onCardEditorOpen: (projectId: string) => void;
  onCardEditorClose: (projectId: string) => void;
  onArchive: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onStartFocus?: (id: string) => void;
};

export function ProjectCard({
  project,
  onToggleStar,
  onAddStep,
  onUpdateBlocker,
  onUpdateNextAction,
  activeCardEditorProjectId,
  onCardEditorOpen,
  onCardEditorClose,
  onArchive,
  onDuplicate,
  onStartFocus,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [stepDraft, setStepDraft] = useState('');
  const [editingBlocker, setEditingBlocker] = useState(false);
  const [blockerDraft, setBlockerDraft] = useState('');
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState('');
  const [nextActionCapture, setNextActionCapture] = useState<{
    id: string;
    title: string;
    order: number;
  } | null>(null);
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const blockerInputRef = useRef<HTMLInputElement>(null);
  const blockerOpenerRef = useRef<HTMLButtonElement>(null);
  const nextActionInputRef = useRef<HTMLInputElement>(null);
  const nextActionOpenerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const restoreBlockerFocusRef = useRef(false);
  const restoreNextActionFocusRef = useRef(false);
  const blockerEditorId = useId();
  const nextActionEditorId = useId();

  useEffect(() => {
    if (editingBlocker) {
      blockerInputRef.current?.focus();
      return;
    }
    if (!restoreBlockerFocusRef.current) return;
    restoreBlockerFocusRef.current = false;
    const opener = blockerOpenerRef.current;
    if (opener?.isConnected) opener.focus();
    else if (cardRef.current?.isConnected) cardRef.current.focus();
  }, [editingBlocker]);

  useEffect(() => {
    if (editingNextAction) {
      nextActionInputRef.current?.focus();
      return;
    }
    if (!restoreNextActionFocusRef.current) return;
    restoreNextActionFocusRef.current = false;
    const opener = nextActionOpenerRef.current;
    if (opener?.isConnected) opener.focus();
    else if (cardRef.current?.isConnected) cardRef.current.focus();
  }, [editingNextAction]);

  useEffect(() => {
    if (activeCardEditorProjectId === project.id) return;
    setAdding(false);
    setStepDraft('');
    setEditingBlocker(false);
    setBlockerDraft('');
    setBlockerError(null);
    setEditingNextAction(false);
    setNextActionDraft('');
    setNextActionCapture(null);
    setNextActionError(null);
  }, [activeCardEditorProjectId, project.id]);

  function stop(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function submitStep(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const t = stepDraft.trim();
    if (!t) return;
    onAddStep(project.id, t);
    closeStepEditor();
  }

  function closeStepEditor() {
    setStepDraft('');
    setAdding(false);
    onCardEditorClose(project.id);
  }

  function closeBlockerEditor() {
    restoreBlockerFocusRef.current = true;
    setEditingBlocker(false);
    setBlockerDraft('');
    setBlockerError(null);
    onCardEditorClose(project.id);
  }

  function startBlockerEdit() {
    onCardEditorOpen(project.id);
    setAdding(false);
    setStepDraft('');
    setEditingNextAction(false);
    setNextActionDraft('');
    setNextActionCapture(null);
    setNextActionError(null);
    setBlockerDraft(getBlocker(project) ?? '');
    setBlockerError(null);
    setEditingBlocker(true);
  }

  function showBlockerResult(result: BlockerUpdateResult): boolean {
    if (result.kind === 'changed' || result.kind === 'noop') return true;
    const messages: Record<string, string> = {
      required: 'Enter blocker text.',
      'line-break': 'Blocker must fit on one line.',
      reserved: 'Use Clear to remove the current blocker.',
      'too-long': 'Blocker must be 2,000 characters or fewer.',
      'notes-too-long': 'Project notes reached their size limit. Blocker was not saved.',
      missing: 'Project is no longer available. Draft remains open.',
      'not-ready': 'Workspace is not ready. Draft remains open.',
    };
    setBlockerError(messages[result.kind === 'error' ? result.reason : result.kind]);
    return false;
  }

  function submitBlocker(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (showBlockerResult(onUpdateBlocker(project.id, blockerDraft))) {
      closeBlockerEditor();
    }
  }

  function clearBlocker() {
    if (showBlockerResult(onUpdateBlocker(project.id, null))) {
      closeBlockerEditor();
    }
  }

  function closeNextActionEditor() {
    restoreNextActionFocusRef.current = true;
    setEditingNextAction(false);
    setNextActionDraft('');
    setNextActionCapture(null);
    setNextActionError(null);
    onCardEditorClose(project.id);
  }

  function startNextActionEdit() {
    const currentNextAction = getNextAction(project);
    if (!currentNextAction) return;
    onCardEditorOpen(project.id);
    setAdding(false);
    setStepDraft('');
    setEditingBlocker(false);
    setBlockerDraft('');
    setBlockerError(null);
    setNextActionDraft(currentNextAction.title);
    setNextActionCapture({
      id: currentNextAction.id,
      title: currentNextAction.title,
      order: currentNextAction.order,
    });
    setNextActionError(null);
    setEditingNextAction(true);
  }

  function showNextActionResult(result: NextActionUpdateResult): boolean {
    if (result.kind === 'changed' || result.kind === 'noop') return true;
    const messages: Record<string, string> = {
      required: 'Enter a next step title.',
      'line-break': 'Next step title must fit on one line.',
      'too-long': 'Next step title must be 400 characters or fewer.',
      stale: 'Next step changed while editing. Draft remains open.',
      missing: 'Project is no longer available. Draft remains open.',
      'not-ready': 'Workspace is not ready. Draft remains open.',
    };
    setNextActionError(messages[result.kind === 'error' ? result.reason : result.kind]);
    return false;
  }

  function submitNextAction(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!nextActionCapture) return;
    if (
      showNextActionResult(
        onUpdateNextAction(
          project.id,
          nextActionCapture.id,
          nextActionCapture.title,
          nextActionCapture.order,
          nextActionDraft,
        ),
      )
    ) {
      closeNextActionEditor();
    }
  }

  const canArchive = project.status !== 'archived';
  const canStartFocus = ACTIVE_STATUSES.includes(project.status);
  const nextAction = getNextAction(project);
  const isActiveCardEditor = activeCardEditorProjectId === project.id;
  const freshness = getFreshness(project);
  const blocker = getBlocker(project);

  return (
    <article
      ref={cardRef}
      className={`project-card${project.starred ? ' project-card-starred' : ''}`}
      data-status={project.status}
      tabIndex={-1}
    >
      <div className="card-head">
        <Link to={`/project/${project.id}`} className="card-main-link">
          <h3 className="card-title">{project.title}</h3>
        </Link>
        <div className="card-actions">
          <button
            type="button"
            className={`btn-icon star-btn${project.starred ? ' starred' : ''}`}
            aria-label={project.starred ? 'Unstar project' : 'Star project'}
            aria-pressed={!!project.starred}
            onClick={(e) => {
              stop(e);
              onToggleStar(project.id);
            }}
          >
            {project.starred ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="card-meta">
        <span>{STATUS_LABELS[project.status]}</span>
        <span>{TYPE_LABELS[project.type]}</span>
        {project.tags.map((tag) => (
          <span key={tag} className="card-tag">{tag}</span>
        ))}
      </div>

      <Link to={`/project/${project.id}`} className="card-progress-link">

        <div className="progress-block">
          <div className="progress-meta">
            <span>
              {project.steps.filter((step) => step.done).length}/{project.steps.length}{' '}
              steps · {project.progress_pct}%
            </span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className="progress-fill"
              style={{ width: `${project.progress_pct}%` }}
            />
          </div>
        </div>
      </Link>

      {(nextAction || freshness || blocker) && (
        <div className="card-signals">
          {nextAction && (
            <div className="card-next-action">
              <span className="card-signal-label">Next action</span>
              <span className="card-next-action-value">{nextAction.title}</span>
            </div>
          )}
          {blocker && (
            <div className="card-blocker">
              <span className="card-signal-label">Blocker</span>
              <span className="card-blocker-value">{blocker}</span>
            </div>
          )}
          {freshness && <span className="card-freshness">{freshness}</span>}
        </div>
      )}

      {project.links.length > 0 && (
        <div
          className="card-links"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <LinkChips links={project.links} max={2} compact />
        </div>
      )}

      <div className="card-quick">
        {editingBlocker && isActiveCardEditor ? (
          <form
            className="card-blocker-editor"
            onSubmit={submitBlocker}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeBlockerEditor();
              }
              event.stopPropagation();
            }}
          >
            <label htmlFor={`${blockerEditorId}-input`}>Blocker</label>
            <input
              ref={blockerInputRef}
              id={`${blockerEditorId}-input`}
              type="text"
              value={blockerDraft}
              aria-describedby={blockerError ? `${blockerEditorId}-error` : undefined}
              onChange={(event) => {
                setBlockerDraft(event.target.value);
                setBlockerError(null);
              }}
              onPaste={(event) => {
                if (/[\r\n\u2028\u2029]/.test(event.clipboardData.getData('text'))) {
                  event.preventDefault();
                  setBlockerError('Blocker must fit on one line.');
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
            {blockerError && (
              <p id={`${blockerEditorId}-error`} className="card-blocker-error" role="alert">
                {blockerError}
              </p>
            )}
            <div className="card-blocker-actions">
              <button type="submit" className="btn btn-secondary btn-sm">Save</button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(event) => {
                  stop(event);
                  closeBlockerEditor();
                }}
              >
                Cancel
              </button>
              {blocker && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={(event) => {
                    stop(event);
                    clearBlocker();
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        ) : editingNextAction && isActiveCardEditor ? (
          <form
            className="card-blocker-editor card-next-step-editor"
            onSubmit={submitNextAction}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeNextActionEditor();
              }
              event.stopPropagation();
            }}
          >
            <label htmlFor={`${nextActionEditorId}-input`}>Next step</label>
            <input
              ref={nextActionInputRef}
              id={`${nextActionEditorId}-input`}
              type="text"
              maxLength={400}
              value={nextActionDraft}
              aria-describedby={nextActionError ? `${nextActionEditorId}-error` : undefined}
              onChange={(event) => {
                setNextActionDraft(event.target.value);
                setNextActionError(null);
              }}
              onPaste={(event) => {
                if (/[\r\n\u2028\u2029]/.test(event.clipboardData.getData('text'))) {
                  event.preventDefault();
                  setNextActionError('Next step title must fit on one line.');
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
            {nextActionError && (
              <p id={`${nextActionEditorId}-error`} className="card-blocker-error" role="alert">
                {nextActionError}
              </p>
            )}
            <div className="card-blocker-actions">
              <button type="submit" className="btn btn-secondary btn-sm">Save</button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(event) => {
                  stop(event);
                  closeNextActionEditor();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : adding && isActiveCardEditor ? (
          <form className="card-step-add" onSubmit={submitStep}>
            <input
              type="text"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Step title…"
              aria-label="New step title"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeStepEditor();
                }
              }}
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={!stepDraft.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                stop(e);
                closeStepEditor();
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="card-quick-row">
            {nextAction && (
              <button
                ref={nextActionOpenerRef}
                type="button"
                className="btn btn-ghost btn-sm card-next-action-edit"
                onClick={(event) => {
                  stop(event);
                  startNextActionEdit();
                }}
              >
                Edit next step
              </button>
            )}
            {onStartFocus && canStartFocus && (
              <button
                type="button"
                className="btn btn-ghost btn-sm focus-session-start"
                onClick={(e) => {
                  stop(e);
                  onStartFocus(project.id);
                }}
              >
                Start focus
              </button>
            )}
            <button
              ref={blockerOpenerRef}
              type="button"
              className="btn btn-ghost btn-sm card-blocker-open"
              onClick={(e) => {
                stop(e);
                startBlockerEdit();
              }}
            >
              Blocker
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                stop(e);
                onCardEditorOpen(project.id);
                setEditingBlocker(false);
                setEditingNextAction(false);
                setNextActionDraft('');
                setNextActionCapture(null);
                setNextActionError(null);
                setAdding(true);
              }}
            >
              + step
            </button>
            {onDuplicate && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  stop(e);
                  onDuplicate(project.id);
                }}
              >
                Duplicate
              </button>
            )}
            {canArchive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  stop(e);
                  onArchive(project.id);
                }}
              >
                Archive
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
