import type { ProjectStatus } from '../types';
import { STATUS_LABELS } from '../types';

export type BoardKeyboardAction =
  | { kind: 'move-status'; status: ProjectStatus; message: string }
  | { kind: 'move-focus'; projectId: string }
  | { kind: 'open-detail'; projectId: string }
  | { kind: 'none' };

const NONE: BoardKeyboardAction = { kind: 'none' };

/** -1 left, 1 right, 0 not a horizontal key. */
function horizontalDelta(key: string): number {
  switch (key) {
    case 'ArrowLeft':
    case 'h':
    case 'H':
      return -1;
    case 'ArrowRight':
    case 'l':
    case 'L':
      return 1;
    default:
      return 0;
  }
}

/** -1 up, 1 down, 0 not a vertical key. */
function verticalDelta(key: string): number {
  switch (key) {
    case 'ArrowUp':
    case 'k':
    case 'K':
      return -1;
    case 'ArrowDown':
    case 'j':
    case 'J':
      return 1;
    default:
      return 0;
  }
}

/**
 * True when the key is one the Board owns for a focused card: the arrow keys,
 * the vim keys in either case, and the activation keys. Derived from the same
 * delta helpers the resolver uses so the two never drift. A `none` result is
 * still possible for an owned key at a boundary.
 */
export function isBoardKeyboardKey(key: string): boolean {
  return (
    horizontalDelta(key) !== 0 ||
    verticalDelta(key) !== 0 ||
    key === 'Enter' ||
    key === ' '
  );
}

/**
 * Pure keyboard decision for a focused Board card. Returns `none` for
 * unsupported keys and at column/card boundaries; the caller owns
 * preventDefault, persistence, focus, and routing.
 */
export function resolveBoardKeyboardAction(input: {
  key: string;
  projectId: string;
  status: ProjectStatus;
  statuses: readonly ProjectStatus[];
  columnProjectIds: readonly string[];
}): BoardKeyboardAction {
  const { key, projectId, status, statuses, columnProjectIds } = input;

  const hDelta = horizontalDelta(key);
  if (hDelta !== 0) {
    const statusIndex = statuses.indexOf(status);
    if (statusIndex < 0) return NONE;
    const nextIndex = statusIndex + hDelta;
    if (nextIndex < 0 || nextIndex >= statuses.length) return NONE;
    const nextStatus = statuses[nextIndex]!;
    if (nextStatus === status) return NONE;
    return {
      kind: 'move-status',
      status: nextStatus,
      message: `Moved to ${STATUS_LABELS[nextStatus]}`,
    };
  }

  const vDelta = verticalDelta(key);
  if (vDelta !== 0) {
    const cardIndex = columnProjectIds.indexOf(projectId);
    if (cardIndex < 0) return NONE;
    const nextIndex = cardIndex + vDelta;
    if (nextIndex < 0 || nextIndex >= columnProjectIds.length) return NONE;
    return { kind: 'move-focus', projectId: columnProjectIds[nextIndex]! };
  }

  if (key === 'Enter' || key === ' ') {
    return { kind: 'open-detail', projectId };
  }

  return NONE;
}
