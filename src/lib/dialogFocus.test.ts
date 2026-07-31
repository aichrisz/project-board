import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  initialFocusTarget,
  restoreFocus,
  wrappedFocusTarget,
} from './dialogFocus';

type FakeFocusable = {
  label: string;
  calls: number;
  focus: () => void;
};

/** Structural stand-in for a focusable element; no DOM required. */
function fakeFocusable(label = 'target'): FakeFocusable {
  const target: FakeFocusable = {
    label,
    calls: 0,
    focus: () => {
      target.calls += 1;
    },
  };
  return target;
}

describe('initialFocusTarget', () => {
  it('prefers the explicitly requested target', () => {
    const preferred = fakeFocusable('preferred');
    const first = fakeFocusable('first');
    const fallback = fakeFocusable('fallback');

    assert.equal(
      initialFocusTarget(preferred, [first, fakeFocusable('last')], fallback),
      preferred,
    );
  });

  it('prefers the requested target even when it is not a listed focusable', () => {
    const preferred = fakeFocusable('preferred');
    const fallback = fakeFocusable('fallback');

    assert.equal(initialFocusTarget(preferred, [], fallback), preferred);
  });

  it('falls back to the first focusable when nothing is preferred', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');
    const fallback = fakeFocusable('fallback');

    assert.equal(initialFocusTarget(null, [first, last], fallback), first);
  });

  it('falls back to the container when there are no focusables', () => {
    const fallback = fakeFocusable('fallback');

    assert.equal(initialFocusTarget(null, [], fallback), fallback);
  });

  it('decides without moving focus', () => {
    const preferred = fakeFocusable('preferred');
    const first = fakeFocusable('first');
    const fallback = fakeFocusable('fallback');

    initialFocusTarget(preferred, [first], fallback);
    initialFocusTarget(null, [first], fallback);
    initialFocusTarget(null, [], fallback);

    assert.equal(preferred.calls, 0);
    assert.equal(first.calls, 0);
    assert.equal(fallback.calls, 0);
  });
});

describe('wrappedFocusTarget forward Tab', () => {
  it('wraps from the last focusable to the first', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: last,
        shiftKey: false,
      }),
      first,
    );
  });

  it('returns null away from the trailing edge', () => {
    const first = fakeFocusable('first');
    const middle = fakeFocusable('middle');
    const last = fakeFocusable('last');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, middle, last],
        active: first,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      wrappedFocusTarget({
        focusables: [first, middle, last],
        active: middle,
        shiftKey: false,
      }),
      null,
    );
  });
});

describe('wrappedFocusTarget reverse Tab', () => {
  it('wraps from the first focusable to the last', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: first,
        shiftKey: true,
      }),
      last,
    );
  });

  it('returns null away from the leading edge', () => {
    const first = fakeFocusable('first');
    const middle = fakeFocusable('middle');
    const last = fakeFocusable('last');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, middle, last],
        active: last,
        shiftKey: true,
      }),
      null,
    );
    assert.equal(
      wrappedFocusTarget({
        focusables: [first, middle, last],
        active: middle,
        shiftKey: true,
      }),
      null,
    );
  });
});

describe('wrappedFocusTarget without a wrap boundary', () => {
  it('returns null when there are no focusables', () => {
    assert.equal(
      wrappedFocusTarget({ focusables: [], active: null, shiftKey: false }),
      null,
    );
    assert.equal(
      wrappedFocusTarget({ focusables: [], active: null, shiftKey: true }),
      null,
    );
  });

  it('returns null when nothing is active', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: null,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: null,
        shiftKey: true,
      }),
      null,
    );
  });

  it('returns null when the active target is outside the focusables', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');
    const outside = fakeFocusable('outside');

    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: outside,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      wrappedFocusTarget({
        focusables: [first, last],
        active: outside,
        shiftKey: true,
      }),
      null,
    );
  });

  it('keeps a sole focusable in both directions', () => {
    const only = fakeFocusable('only');

    assert.equal(
      wrappedFocusTarget({
        focusables: [only],
        active: only,
        shiftKey: false,
      }),
      only,
    );
    assert.equal(
      wrappedFocusTarget({ focusables: [only], active: only, shiftKey: true }),
      only,
    );
  });

  it('decides without moving focus', () => {
    const first = fakeFocusable('first');
    const last = fakeFocusable('last');

    wrappedFocusTarget({
      focusables: [first, last],
      active: last,
      shiftKey: false,
    });
    wrappedFocusTarget({
      focusables: [first, last],
      active: first,
      shiftKey: true,
    });

    assert.equal(first.calls, 0);
    assert.equal(last.calls, 0);
  });
});

describe('restoreFocus', () => {
  it('focuses the captured target exactly once', () => {
    const trigger = fakeFocusable('trigger');

    restoreFocus(trigger);

    assert.equal(trigger.calls, 1);
  });

  it('focuses again on each explicit call', () => {
    const trigger = fakeFocusable('trigger');

    restoreFocus(trigger);
    restoreFocus(trigger);

    assert.equal(trigger.calls, 2);
  });

  it('is a no-op for a null target', () => {
    assert.doesNotThrow(() => {
      restoreFocus(null);
    });
    assert.equal(restoreFocus(null), undefined);
  });

  it('leaves other targets untouched', () => {
    const trigger = fakeFocusable('trigger');
    const other = fakeFocusable('other');

    restoreFocus(trigger);

    assert.equal(other.calls, 0);
  });
});
