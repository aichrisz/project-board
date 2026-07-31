/**
 * Pure modal focus decisions. Deliberately DOM- and React-free: everything
 * here works on a structural `{ focus() }` shape so the branching can be
 * covered by native Node tests, while the React layer keeps ownership of refs,
 * listeners, and timing.
 */

/** Anything focusable enough for these decisions, including an HTMLElement. */
export type FocusableTarget = { focus: () => void };

/**
 * Which target should receive focus when a dialog opens: an explicitly
 * requested target wins, then the first focusable child, then the container
 * itself (which the caller gives `tabIndex={-1}`). Decides only; never focuses.
 */
export function initialFocusTarget(
  preferred: FocusableTarget | null,
  focusables: readonly FocusableTarget[],
  fallback: FocusableTarget,
): FocusableTarget {
  if (preferred) return preferred;
  return focusables[0] ?? fallback;
}

/**
 * Where Tab should wrap to, or `null` when the browser's default move stays
 * inside the dialog. Only the trailing edge (forward) and leading edge
 * (reverse) wrap; an unknown or absent active target has no boundary. Decides
 * only; never focuses.
 */
export function wrappedFocusTarget(input: {
  focusables: readonly FocusableTarget[];
  active: FocusableTarget | null;
  shiftKey: boolean;
}): FocusableTarget | null {
  const { focusables, active, shiftKey } = input;
  if (focusables.length === 0 || !active) return null;

  const index = focusables.indexOf(active);
  if (index < 0) return null;

  if (shiftKey) {
    return index === 0 ? (focusables.at(-1) ?? null) : null;
  }
  return index === focusables.length - 1 ? (focusables[0] ?? null) : null;
}

/** Return focus to a captured opener. A missing opener is a no-op. */
export function restoreFocus(target: FocusableTarget | null): void {
  if (!target) return;
  target.focus();
}
