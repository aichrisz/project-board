import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  DEFAULT_FOCUS_PRESET,
  FOCUS_PRESETS,
  MAX_FOCUS_NOTE_CHARS,
  elapsedSecondsFor,
  focusBoundaryMs,
  focusPhase,
  getRemainingSeconds,
  type FocusPreset,
} from '../lib/focusSession';
import type { FocusOutcome } from '../types';
import { useProjects } from '../store/ProjectContext';

/* Task 7 keeps its display helpers beside the drawer by design. */
/* oxlint-disable react/only-export-components */

export type FocusSessionDrawerProps = {
  open: boolean;
  projectId: string;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
};

type FocusPhase = 'setup' | 'running' | 'resolve';
type LivePhase = {
  phase: FocusPhase;
  activeId: string | null;
  stoppedAt?: string;
};
type AnnouncementPhase = 'started' | 'restored' | 'complete' | 'stopped';

export function formatFocusClock(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function focusBandLabel(
  remainingSeconds: number,
  ready: boolean,
): string {
  return ready
    ? 'Ready to resolve'
    : `${formatFocusClock(remainingSeconds)} remaining`;
}

export function focusOutcomeLabel(outcome: FocusOutcome): string {
  const labels: Record<FocusOutcome, string> = {
    completed: 'Completed',
    stopped: 'Stopped',
    expired: 'Expired',
  };
  return labels[outcome];
}

export function focusPhaseAnnouncement(input: {
  phase: AnnouncementPhase;
  projectTitle: string;
  minutes: number;
}): string {
  if (input.phase === 'started') {
    return `Focus session started for “${input.projectTitle}”, ${input.minutes} minutes.`;
  }
  if (input.phase === 'restored') {
    return `Focus session restored, ${input.minutes} minutes remaining.`;
  }
  if (input.phase === 'complete') {
    return `Focus session complete for “${input.projectTitle}”.`;
  }
  return `Focus session stopped after ${input.minutes} minutes.`;
}

function trimmedNote(note: string): string | undefined {
  const value = note.trim();
  return value || undefined;
}

function presetButtons(
  selected: FocusPreset,
  setSelected: (preset: FocusPreset) => void,
  label: string,
) {
  return (
    <fieldset className="focus-session-presets">
      <legend className="section-label">{label}</legend>
      <div className="focus-session-preset-list" role="group" aria-label={label}>
        {FOCUS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="btn btn-secondary focus-session-preset"
            aria-pressed={selected === preset}
            onClick={() => setSelected(preset)}
          >
            {preset} min
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function FocusSessionDrawer({
  open,
  projectId,
  onClose,
  triggerRef,
}: FocusSessionDrawerProps) {
  const {
    projects,
    focus,
    startFocusSession,
    stopFocusSession,
    finalizeActiveFocus,
    keepWorkingFocus,
    canMarkFocusStepDone,
  } = useProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const projectTitle = project?.title ?? 'Selected project';
  const active = focus.active;
  const activeForProject = active?.projectId === projectId ? active : null;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [setupPreset, setSetupPreset] = useState<FocusPreset>(
    DEFAULT_FOCUS_PRESET,
  );
  const [resolverPreset, setResolverPreset] = useState<FocusPreset>(
    DEFAULT_FOCUS_PRESET,
  );
  const [selectedStepId, setSelectedStepId] = useState('');
  const [note, setNote] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const pendingAnnouncementRef = useRef<AnnouncementPhase | null>(null);
  const previousLivePhaseRef = useRef<LivePhase | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const phase: FocusPhase = focusPhase({
    active,
    projectId,
    nowMs,
  });
  const remainingSeconds = activeForProject
    ? getRemainingSeconds(activeForProject.endsAt, nowMs)
    : 0;
  const unfinishedSteps = (project?.steps ?? []).filter((step) => !step.done);
  const activeStepTitle =
    activeForProject?.stepId === undefined
      ? undefined
      : project?.steps.find(
          (step) => step.id === activeForProject.stepId && !step.done,
        )?.title;
  const elapsedSeconds = activeForProject
    ? elapsedSecondsFor({
        active: activeForProject,
        endedAtMs: focusBoundaryMs(activeForProject, nowMs),
      })
    : 0;

  useDialogFocus({
    open,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
    triggerRef,
    onRequestClose: onClose,
  });

  useEffect(() => {
    if (!open) return;

    const refresh = () => setNowMs(Date.now());
    refresh();

    const onVisibilityChange = () => refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refresh);

    const shouldTick =
      phase === 'running' &&
      activeForProject !== null &&
      getRemainingSeconds(activeForProject.endsAt, Date.now()) > 0;
    const intervalId = shouldTick
      ? window.setInterval(refresh, 1_000)
      : undefined;

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refresh);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [
    open,
    phase,
    projectId,
    activeForProject,
    activeForProject?.id,
    activeForProject?.endsAt,
    activeForProject?.stoppedAt,
  ]);

  useEffect(() => {
    if (!open) {
      previousLivePhaseRef.current = null;
      pendingAnnouncementRef.current = null;
      setLiveAnnouncement('');
      return;
    }

    const previous = previousLivePhaseRef.current;
    let announcement: string | null = null;

    if (phase === 'running' && activeForProject) {
      if (pendingAnnouncementRef.current === 'started') {
        announcement = focusPhaseAnnouncement({
          phase: 'started',
          projectTitle,
          minutes: activeForProject.plannedMinutes,
        });
        pendingAnnouncementRef.current = null;
      } else if (
        !previous ||
        previous.phase !== 'running' ||
        previous.activeId !== activeForProject.id
      ) {
        announcement = focusPhaseAnnouncement({
          phase: 'restored',
          projectTitle,
          minutes: Math.max(
            1,
            Math.ceil(
              getRemainingSeconds(activeForProject.endsAt, nowMs) / 60,
            ),
          ),
        });
      }
    } else if (
      phase === 'resolve' &&
      activeForProject &&
      (!previous ||
        previous.phase !== 'resolve' ||
        previous.activeId !== activeForProject.id ||
        previous.stoppedAt !== activeForProject.stoppedAt)
    ) {
      const stopped = activeForProject.stoppedAt !== undefined;
      announcement = focusPhaseAnnouncement({
        phase: stopped ? 'stopped' : 'complete',
        projectTitle,
        minutes: Math.floor(elapsedSeconds / 60),
      });
    }

    previousLivePhaseRef.current = {
      phase,
      activeId: activeForProject?.id ?? null,
      stoppedAt: activeForProject?.stoppedAt,
    };
    if (announcement !== null) setLiveAnnouncement(announcement);
  }, [
    open,
    phase,
    projectTitle,
    nowMs,
    activeForProject,
    activeForProject?.id,
    activeForProject?.endsAt,
    activeForProject?.stoppedAt,
    activeForProject?.plannedMinutes,
    elapsedSeconds,
  ]);

  useEffect(() => {
    if (!open) return;
    setSelectedStepId('');
    setSetupPreset(DEFAULT_FOCUS_PRESET);
    setResolverPreset(DEFAULT_FOCUS_PRESET);
    setNote('');
  }, [open, projectId]);

  function startSession() {
    if (active && active.projectId !== projectId) {
      const otherProject = projects.find(
        (candidate) => candidate.id === active.projectId,
      );
      const otherTitle = otherProject?.title ?? active.projectId;
      const confirmed = window.confirm(
        `Stop the current focus session on “${otherTitle}” and start a new one?`,
      );
      if (!confirmed) return;
    }

    const result = startFocusSession({
      projectId,
      ...(selectedStepId ? { stepId: selectedStepId } : {}),
      plannedMinutes: setupPreset,
    });
    if (result.started) {
      pendingAnnouncementRef.current = 'started';
      setNowMs(Date.now());
    }
  }

  function stopSession() {
    if (stopFocusSession()) setNowMs(Date.now());
  }

  function finish(markStepDone = false) {
    finalizeActiveFocus({
      ...(markStepDone ? { markStepDone: true } : {}),
      note: trimmedNote(note),
    });
    setNote('');
  }

  function finishWithoutNote() {
    finalizeActiveFocus({});
    setNote('');
  }

  function keepWorking() {
    const result = keepWorkingFocus({
      plannedMinutes: resolverPreset,
      note: trimmedNote(note),
    });
    if (result.active) {
      pendingAnnouncementRef.current = 'started';
      setNowMs(Date.now());
      setNote('');
    }
  }

  return (
    <>
      {open && (
        <div
          className="focus-session-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <div
        ref={panelRef}
        className={`focus-session-panel${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        hidden={!open}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="focus-session-header">
          <div>
            <p className="section-label">Focus session</p>
            <h2 id={titleId} className="focus-session-title">
              {phase === 'setup'
                ? 'Start a focus session'
                : phase === 'running'
                  ? 'Focus session'
                  : activeForProject?.stoppedAt
                    ? 'Session stopped'
                    : 'Session finished'}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn-ghost focus-session-close"
            onClick={onClose}
          >
            Close panel
          </button>
        </div>

        <div className="focus-session-content">
          <p className="focus-session-project-title">{projectTitle}</p>

          {phase === 'setup' && (
            <section aria-labelledby={`${titleId}-setup`}>
              <h3 id={`${titleId}-setup`} className="sr-only">
                Session setup
              </h3>
              {unfinishedSteps.length > 0 && (
                <label className="field focus-session-step-field">
                  <span>Step (optional)</span>
                  <select
                    value={selectedStepId}
                    onChange={(event) => setSelectedStepId(event.target.value)}
                  >
                    <option value="">No specific step</option>
                    {unfinishedSteps.map((step) => (
                      <option key={step.id} value={step.id}>
                        {step.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {presetButtons(setupPreset, setSetupPreset, 'Session length')}
              <div className="focus-session-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startSession}
                  disabled={!project}
                >
                  Start focus
                </button>
              </div>
            </section>
          )}

          {phase === 'running' && activeForProject && (
            <section aria-labelledby={`${titleId}-running`}>
              <h3 id={`${titleId}-running`} className="sr-only">
                Active focus session
              </h3>
              <p className="focus-session-step-line">
                {activeStepTitle ?? 'No specific step'}
              </p>
              <p
                className="focus-session-clock"
              >
                {formatFocusClock(remainingSeconds)}
              </p>
              <p className="muted focus-session-planned">
                Planned {activeForProject.plannedMinutes} min
              </p>
              <div className="focus-session-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={stopSession}
                >
                  Stop session
                </button>
              </div>
            </section>
          )}

          {phase === 'resolve' && activeForProject && (
            <section aria-labelledby={`${titleId}-resolve`}>
              <h3 id={`${titleId}-resolve`} className="sr-only">
                Resolve focus session
              </h3>
              <p className="focus-session-step-line">
                {activeStepTitle ?? 'No specific step'}
              </p>
              <p className="focus-session-elapsed">
                Elapsed {formatFocusClock(elapsedSeconds)} · Planned{' '}
                {activeForProject.plannedMinutes} min
              </p>

              {canMarkFocusStepDone && (
                <button
                  type="button"
                  className="btn btn-primary focus-session-resolve-button"
                  onClick={() => finish(true)}
                >
                  Mark step done
                </button>
              )}

              {presetButtons(resolverPreset, setResolverPreset, 'Keep working')}
              <button
                type="button"
                className="btn btn-secondary focus-session-resolve-button"
                onClick={keepWorking}
              >
                Keep working
              </button>

              <label className="field focus-session-note-field">
                <span>Optional note</span>
                <textarea
                  value={note}
                  maxLength={MAX_FOCUS_NOTE_CHARS}
                  rows={4}
                  onChange={(event) => setNote(event.target.value)}
                  aria-describedby={`${titleId}-note-count`}
                />
                <span id={`${titleId}-note-count`} className="focus-session-note-meta">
                  {note.length}/{MAX_FOCUS_NOTE_CHARS}
                </span>
              </label>
              <div className="focus-session-actions focus-session-resolve-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => finish(false)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={finishWithoutNote}
                >
                  Finish without note
                </button>
              </div>
            </section>
          )}
        </div>
        <div className="focus-session-live" aria-live="polite">
          {liveAnnouncement}
        </div>
      </div>
    </>
  );
}
