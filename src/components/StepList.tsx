import { useRef, useState } from 'react';
import type { Step } from '../types';

type Props = {
  steps: Step[];
  onToggle: (stepId: string) => void;
  onAdd: (title: string) => void;
  onRemove: (stepId: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onMarkAllDone?: () => void;
  onClearAllDone?: () => void;
  onRemoveCompleted?: () => void;
  readOnly?: boolean;
};

export function StepList({
  steps,
  onToggle,
  onAdd,
  onRemove,
  onReorder,
  onMarkAllDone,
  onClearAllDone,
  onRemoveCompleted,
  readOnly,
}: Props) {
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const canReorder = !readOnly && !!onReorder && sorted.length > 1;
  const hasDone = sorted.some((s) => s.done);
  const hasIncomplete = sorted.some((s) => !s.done);
  const showBulk =
    !readOnly &&
    sorted.length > 0 &&
    (onMarkAllDone || onClearAllDone || onRemoveCompleted);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    if (!onReorder) return;
    const ids = sorted.map((s) => s.id);
    const idx = ids.indexOf(stepId);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    onReorder(copy);
  }

  function applyDrop(targetId: string) {
    const fromId = dragIdRef.current;
    if (!onReorder || !fromId || fromId === targetId) {
      setDragId(null);
      setOverId(null);
      dragIdRef.current = null;
      return;
    }
    const ids = sorted.map((s) => s.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null);
      setOverId(null);
      dragIdRef.current = null;
      return;
    }
    const copy = [...ids];
    const [item] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, item);
    onReorder(copy);
    setDragId(null);
    setOverId(null);
    dragIdRef.current = null;
  }

  return (
    <div className="step-list">
      {showBulk && (
        <div className="step-bulk-actions" role="group" aria-label="Bulk step actions">
          {onMarkAllDone && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!hasIncomplete}
              onClick={onMarkAllDone}
            >
              Mark all done
            </button>
          )}
          {onClearAllDone && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!hasDone}
              onClick={onClearAllDone}
            >
              Clear all done
            </button>
          )}
          {onRemoveCompleted && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!hasDone}
              onClick={() => {
                if (
                  window.confirm(
                    'Remove all completed steps? This cannot be undone.',
                  )
                ) {
                  onRemoveCompleted();
                }
              }}
            >
              Remove completed
            </button>
          )}
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="muted">No steps yet. Add milestones to track progress.</p>
      ) : (
        <ul className="steps">
          {sorted.map((step, index) => (
            <li
              key={step.id}
              className={`step-item${step.done ? ' done' : ''}${dragId === step.id ? ' step-dragging' : ''}${overId === step.id && dragId !== step.id ? ' step-drag-over' : ''}`}
              draggable={canReorder}
              onDragStart={(e) => {
                if (!canReorder) return;
                dragIdRef.current = step.id;
                setDragId(step.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', step.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
                dragIdRef.current = null;
              }}
              onDragOver={(e) => {
                if (!canReorder || !dragIdRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overId !== step.id) setOverId(step.id);
              }}
              onDragLeave={() => {
                if (overId === step.id) setOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                applyDrop(step.id);
              }}
            >
              {canReorder && (
                <span
                  className="step-handle"
                  title="Drag to reorder"
                  aria-hidden
                >
                  ⋮⋮
                </span>
              )}
              <label className="step-check">
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={readOnly}
                  onChange={() => onToggle(step.id)}
                />
                <span>{step.title}</span>
              </label>
              {!readOnly && (
                <div className="step-item-actions">
                  {canReorder && (
                    <>
                      <button
                        type="button"
                        className="btn-icon step-move-btn"
                        aria-label={`Move step ${step.title} up`}
                        disabled={index === 0}
                        onClick={() => moveStep(step.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-icon step-move-btn"
                        aria-label={`Move step ${step.title} down`}
                        disabled={index === sorted.length - 1}
                        onClick={() => moveStep(step.id, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Remove step ${step.title}`}
                    onClick={() => onRemove(step.id)}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form className="step-add" onSubmit={handleAdd}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a step…"
            aria-label="New step title"
          />
          <button type="submit" className="btn btn-secondary" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
