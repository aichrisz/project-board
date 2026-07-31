/**
 * Pure decision for the Board's narrow-viewport horizontal scroll hint.
 * DOM- and React-free on purpose: the React layer owns the ref, the
 * `matchMedia` subscription, and the resize/scroll listeners, while the gating
 * rule stays covered by native Node tests.
 */

/** The narrow (mobile) breakpoint the hint is scoped to, as a media query. */
export const BOARD_NARROW_QUERY = '(max-width: 767px)';

/**
 * Smallest overflow, in CSS pixels, that counts as real. Sub-pixel layout
 * rounding routinely leaves `scrollWidth` a fraction above `clientWidth` on a
 * board that actually fits, so anything under a full pixel is noise.
 */
export const BOARD_OVERFLOW_EPSILON = 1;

/**
 * Horizontal distance, in CSS pixels, that counts as a meaningful scroll. Past
 * this the reader has clearly discovered the gesture, so the hint retires
 * itself rather than sitting over content it has already explained. Kept above
 * a stray touch jitter so an accidental nudge does not silence it.
 */
export const BOARD_HINT_DISMISS_SCROLL = 24;

export type BoardScrollHintInput = {
  /** Viewport matches {@link BOARD_NARROW_QUERY}. */
  narrow: boolean;
  /** Scrollable content width of the board's scroll container. */
  scrollWidth: number;
  /** Visible width of the board's scroll container. */
  clientWidth: number;
  /** The reader has already scrolled meaningfully, or dismissed the hint. */
  dismissed: boolean;
};

/**
 * True when the measurements show at least {@link BOARD_OVERFLOW_EPSILON} of
 * hidden horizontal content. Content that exactly fits, or is narrower than its
 * container, does not overflow.
 */
export function hasBoardOverflow(
  scrollWidth: number,
  clientWidth: number,
): boolean {
  return scrollWidth - clientWidth >= BOARD_OVERFLOW_EPSILON;
}

/**
 * Whether to render the hint. Three independent gates, all of which must hold:
 * the viewport is narrow, the board really overflows, and the hint has not been
 * dismissed. Pure: reads its input and returns a strict boolean.
 */
export function shouldShowBoardScrollHint(
  input: BoardScrollHintInput,
): boolean {
  const { narrow, scrollWidth, clientWidth, dismissed } = input;
  if (!narrow) return false;
  if (dismissed) return false;
  return hasBoardOverflow(scrollWidth, clientWidth);
}
