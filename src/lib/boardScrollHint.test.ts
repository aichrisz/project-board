import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldShowBoardScrollHint } from './boardScrollHint';

/**
 * The hint is gated on three independent conditions:
 *   narrow        -> viewport matches (max-width: 767px)
 *   hasOverflow   -> scrollWidth > clientWidth
 *   notDismissed  -> dismissed === false
 * It renders only when all three hold.
 */
function show(input: {
  narrow: boolean;
  scrollWidth: number;
  clientWidth: number;
  dismissed: boolean;
}) {
  return shouldShowBoardScrollHint(input);
}

/** Measurements that overflow, and measurements that do not. */
const OVERFLOW = { scrollWidth: 960, clientWidth: 390 };
const NO_OVERFLOW = { scrollWidth: 390, clientWidth: 390 };

describe('shouldShowBoardScrollHint truth table', () => {
  it('is true only when narrow, overflowing, and not dismissed', () => {
    assert.equal(
      show({ narrow: true, ...OVERFLOW, dismissed: false }),
      true,
    );
  });

  it('is false for every other combination of the three conditions', () => {
    const cases: Array<{
      narrow: boolean;
      hasOverflow: boolean;
      notDismissed: boolean;
    }> = [
      { narrow: false, hasOverflow: false, notDismissed: false },
      { narrow: false, hasOverflow: false, notDismissed: true },
      { narrow: false, hasOverflow: true, notDismissed: false },
      { narrow: false, hasOverflow: true, notDismissed: true },
      { narrow: true, hasOverflow: false, notDismissed: false },
      { narrow: true, hasOverflow: false, notDismissed: true },
      { narrow: true, hasOverflow: true, notDismissed: false },
    ];

    for (const { narrow, hasOverflow, notDismissed } of cases) {
      const label =
        `narrow=${narrow} hasOverflow=${hasOverflow} ` +
        `notDismissed=${notDismissed}`;
      assert.equal(
        show({
          narrow,
          ...(hasOverflow ? OVERFLOW : NO_OVERFLOW),
          dismissed: !notDismissed,
        }),
        false,
        label,
      );
    }
  });

  it('covers all eight combinations exactly once', () => {
    const seen = new Set<string>();
    let trueCount = 0;

    for (const narrow of [false, true]) {
      for (const hasOverflow of [false, true]) {
        for (const dismissed of [false, true]) {
          seen.add(`${narrow}:${hasOverflow}:${dismissed}`);
          if (
            show({
              narrow,
              ...(hasOverflow ? OVERFLOW : NO_OVERFLOW),
              dismissed,
            })
          ) {
            trueCount += 1;
          }
        }
      }
    }

    assert.equal(seen.size, 8);
    assert.equal(trueCount, 1);
  });
});

describe('shouldShowBoardScrollHint narrow gate', () => {
  it('is false on a wide viewport even when the board overflows', () => {
    assert.equal(
      show({ narrow: false, scrollWidth: 1600, clientWidth: 1240, dismissed: false }),
      false,
    );
  });
});

describe('shouldShowBoardScrollHint overflow gate', () => {
  it('is false when the content exactly fits', () => {
    assert.equal(
      show({ narrow: true, scrollWidth: 390, clientWidth: 390, dismissed: false }),
      false,
    );
  });

  it('is false when the content is narrower than the container', () => {
    assert.equal(
      show({ narrow: true, scrollWidth: 320, clientWidth: 390, dismissed: false }),
      false,
    );
  });

  it('is true for the smallest real overflow', () => {
    assert.equal(
      show({ narrow: true, scrollWidth: 391, clientWidth: 390, dismissed: false }),
      true,
    );
  });

  it('ignores sub-pixel rounding noise below one pixel', () => {
    assert.equal(
      show({
        narrow: true,
        scrollWidth: 390.4,
        clientWidth: 390,
        dismissed: false,
      }),
      false,
    );
  });
});

describe('shouldShowBoardScrollHint dismissal gate', () => {
  it('is false once dismissed, even while still narrow and overflowing', () => {
    assert.equal(show({ narrow: true, ...OVERFLOW, dismissed: true }), false);
  });

  it('stays false when dismissed on a wide viewport', () => {
    assert.equal(
      show({ narrow: false, ...OVERFLOW, dismissed: true }),
      false,
    );
  });
});

describe('shouldShowBoardScrollHint purity', () => {
  it('does not mutate its input', () => {
    const input = {
      narrow: true,
      scrollWidth: 960,
      clientWidth: 390,
      dismissed: false,
    };
    const snapshot = { ...input };

    shouldShowBoardScrollHint(input);

    assert.deepEqual(input, snapshot);
  });

  it('returns the same result for repeated identical calls', () => {
    const input = {
      narrow: true,
      scrollWidth: 960,
      clientWidth: 390,
      dismissed: false,
    };

    assert.equal(shouldShowBoardScrollHint(input), true);
    assert.equal(shouldShowBoardScrollHint(input), true);
  });

  it('returns a strict boolean, never a truthy number', () => {
    assert.strictEqual(
      shouldShowBoardScrollHint({
        narrow: true,
        ...OVERFLOW,
        dismissed: false,
      }),
      true,
    );
    assert.strictEqual(
      shouldShowBoardScrollHint({
        narrow: true,
        ...NO_OVERFLOW,
        dismissed: false,
      }),
      false,
    );
  });
});
