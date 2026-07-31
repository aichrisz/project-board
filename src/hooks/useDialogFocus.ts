import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import {
  initialFocusTarget,
  restoreFocus,
  wrappedFocusTarget,
} from '../lib/dialogFocus';

/**
 * The one focusable selector for every dialog surface in the app. Elements
 * opted out with `tabindex="-1"` (such as the container itself) are excluded so
 * they never become a Tab wrap boundary.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusablesIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

export type DialogFocusOptions = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  onRequestClose: () => void;
};

/**
 * Shared focus lifecycle for modal surfaces: capture the opener, move focus in,
 * close on Escape, keep Tab inside, and return focus on close. Decisions live in
 * `src/lib/dialogFocus.ts`; this hook owns only DOM access and timing. It never
 * reads or writes application state or storage.
 */
export function useDialogFocus(options: DialogFocusOptions): void {
  const { open } = options;

  // Latest props without re-running the lifecycle: an inline `onRequestClose`
  // changes identity every render, and re-running would steal focus.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!open) return;
    const container = optionsRef.current.containerRef.current;
    if (!container) return;

    const doc = container.ownerDocument;
    const view = doc.defaultView ?? window;
    const opener =
      optionsRef.current.triggerRef?.current ??
      (doc.activeElement as HTMLElement | null);

    initialFocusTarget(
      optionsRef.current.initialFocusRef?.current ?? null,
      focusablesIn(container),
      container,
    ).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        optionsRef.current.onRequestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const surface = optionsRef.current.containerRef.current;
      if (!surface) return;

      const next = wrappedFocusTarget({
        focusables: focusablesIn(surface),
        active: doc.activeElement as HTMLElement | null,
        shiftKey: event.shiftKey,
      });
      if (!next) return;

      event.preventDefault();
      next.focus();
    };

    view.addEventListener('keydown', onKeyDown);
    return () => {
      view.removeEventListener('keydown', onKeyDown);
      // The surface is still mounted during cleanup; wait a frame so focus
      // lands on the opener after React removes it.
      view.requestAnimationFrame(() => {
        restoreFocus(opener);
      });
    };
  }, [open]);
}
