# Project Board v0.9 Accessibility & Mobile Field-Use Design

Date: 2026-07-31
Status: Proposed — awaiting Abel's spec review before implementation planning
Scope: Targeted mobile hardening for v0.9. Not a redesign.

## Purpose

Define the accessibility and mobile field-use hardening work for Project Board v0.9. Project Board is a TypeScript/React local-first static site deployed to GitHub Pages. v0.9 sharpens the existing Board for one-handed phone use in the field and closes focus-management gaps in the mobile menu and keyboard-shortcuts dialog. It does not change the visual language, the data model, or the deployment strategy.

The OpenCode/Opus text and tool lane producing this work is orchestrated and independently reviewed by Hermes.

## Evidence and problem statement

Baseline verification of production at 390x844, 360x800, and 1440x900 established:

- No root horizontal overflow at any of the three viewports.
- The Board has intentional internal horizontal scroll on narrow screens. This is by design, not a bug.
- axe reports zero violations on the empty root and on the Board.
- Console and error output are clean.
- Existing Board keyboard behavior already supports Arrow keys and `hjkl` for status and focus movement, `Enter`/`Space` activation, focus restoration, and `aria-live` announcements.
- Existing mobile bottom navigation, hamburger menu, and safe-area handling are already in place.

So the baseline is healthy. The remaining problems are discoverability and focus lifecycle, not structural defects:

1. The Board's intentional horizontal scroll is undiscoverable on narrow screens. Users cannot tell that more columns exist off-screen, and there is no affordance inviting a swipe.
2. Board copy is desktop-shaped. It can read as if dragging a card is the only way to change status, which is wrong and actively unhelpful on a phone where drag is awkward.
3. The empty Board consumes excessive vertical space on narrow screens, pushing real controls below the fold on first use.
4. The mobile menu and the keyboard-shortcuts dialog lack a complete focus lifecycle: no reliable initial focus, no guaranteed `Escape` close, no guaranteed return of focus to the invoking trigger, and no keyboard containment while open.
5. Existing keyboard behavior has no focused regression coverage, so hardening work risks silently breaking it.
6. Prior verification ran against empty or near-empty state. Browser verification with populated, isolated test state is still required and is a release gate.

## Goals

- Make the Board's narrow-screen horizontal scroll discoverable with a swipe affordance that appears only on narrow screens.
- Make Board copy mobile-accurate so it never implies drag is the sole status-change path.
- Reduce the empty Board's vertical footprint on narrow screens only.
- Give the mobile menu and the keyboard-shortcuts dialog a correct focus lifecycle: initial focus, `Escape` to close, return focus to trigger, and reasonable keyboard containment.
- Add focused regression coverage for existing Board keyboard behavior and for dialog focus lifecycle.
- Complete populated-state browser QA at 390x844, 360x800, and 1440x900 with screenshots, axe results, overflow checks, and clean console/error output.

## Non-goals

- No visual redesign. Spacing, type scale, and color stay as they are except where the narrow-screen empty-state footprint change requires it.
- No removal of the Board's intentional internal horizontal scroll. The affordance explains it; it does not eliminate it.
- No new dependencies. No drag-and-drop library swap.
- No backend, server, or cloud sync.
- No data schema or storage key changes.
- No GitHub Pages strategy changes.
- No persistence of user browser data beyond what already exists.
- No new features beyond the listed scope. Column reordering, filtering, and bulk edit are out.

## User experience and interaction contract

### Board horizontal-scroll affordance (narrow only)

- On narrow screens where the Board's scroll width exceeds its client width, a swipe affordance is shown adjacent to the Board's scroll container.
- The affordance carries a short swipe message telling the user that columns continue horizontally and can be swiped.
- The affordance is rendered only when both conditions hold: the viewport is narrow, and the Board actually overflows horizontally. It never appears at 1440x900.
- The affordance is informational. It is not a control and does not receive focus. It must not trap pointer events over the scroll container.
- The affordance does not introduce root horizontal overflow.
- When the user scrolls the Board horizontally, the affordance may be de-emphasized or dismissed for the session. Dismissal state is in-memory only; nothing is persisted.

### Board copy

- Board instructional and empty-state copy states that status can be changed with keyboard controls or by editing the project detail, and presents drag as an optional desktop interaction rather than a required path.
- Copy is accurate on touch devices where drag is not the primary interaction. No wording implies the user must drag or that each Board card has an inline status control.
- Copy remains short enough to render at 360px width without wrapping into a tall block.

### Empty Board on narrow screens

- On narrow screens the empty Board uses a compact layout with reduced vertical padding and a tighter illustration/heading/body stack.
- The empty-state `Create one` action remains above the fold at 360x800 and 390x844.
- On wide screens the empty Board is unchanged.

### Mobile menu focus lifecycle

- Opening the mobile menu moves focus to the first focusable element inside the menu, or to the menu container itself if it has no focusable children.
- `Escape` closes the menu.
- Closing the menu, whether by `Escape`, selection, or backdrop dismissal, returns focus to the trigger that opened it.
- While open, `Tab` and `Shift+Tab` cycle within the menu. Focus does not escape into the page behind it.
- The menu is exposed with an appropriate dialog or disclosure role and an accessible name, and its expanded state is reflected on the trigger.

### Keyboard-shortcuts dialog focus lifecycle

- Opening the dialog moves focus into the dialog, preferring its close control or first focusable element.
- `Escape` closes the dialog.
- Closing returns focus to the trigger that opened it.
- `Tab` and `Shift+Tab` are contained within the dialog while it is open.
- The dialog has `role="dialog"`, is modal, and has an accessible name matching its visible title.
- Existing Board keyboard behavior is unchanged while the dialog is closed.

### Preserved behavior

Arrow keys and `hjkl` status/focus movement, `Enter`/`Space` activation, focus restoration after card operations, and `aria-live` announcements all continue to work exactly as they do today. Any change to these is a regression.

## Architecture and component boundaries

- All work stays client-side in the existing TypeScript/React tree. No new runtime dependencies.
- A single reusable focus-lifecycle primitive handles initial focus, `Escape` handling, focus return, and containment. Both the mobile menu and the keyboard-shortcuts dialog consume it. Duplicating this logic per component is not acceptable.
  - The primitive accepts an open flag and exposes a container ref. It captures the previously focused element on open and restores it on close.
  - Containment is implemented by querying focusable descendants of the container and wrapping `Tab`/`Shift+Tab` at the edges. It is best-effort containment, not a security boundary.
- Narrow-screen detection uses the project's existing responsive mechanism. If none exists, a single small hook backed by `matchMedia` is added and reused; ad hoc `window.innerWidth` reads scattered across components are not acceptable.
- Overflow detection for the affordance compares `scrollWidth` to `clientWidth` on the Board scroll container, re-evaluated on resize and on Board content change, and is owned by the Board container component. Child column and card components are untouched by this logic.
- The swipe affordance is a small presentational component with no internal state beyond what its parent passes. Session dismissal state lives in the Board container in memory.
- Copy changes are localized to the Board's existing copy locations. No new i18n layer.
- The empty-state compact layout is achieved through the existing styling approach, gated on the narrow breakpoint. No new styling system.

## Accessibility behavior

- The Board scroll container is keyboard scrollable and has an accessible name so screen reader users understand it is a scrollable region.
- The swipe affordance's message is available to assistive technology as static text. Because it appears in response to layout rather than user action, it is not announced as a live region alert; it must not interrupt or duplicate existing `aria-live` announcements.
- The mobile menu and shortcuts dialog are modal, correctly named, and announce as dialogs. Background content is inert to keyboard traversal while they are open.
- Trigger controls reflect expanded/collapsed state.
- Every interactive element added or changed has a visible focus indicator meeting the existing focus-style contract.
- axe must report zero violations on the empty root, the empty Board, the populated Board, the open mobile menu, and the open shortcuts dialog.
- Touch targets for controls added or modified are at least 44x44 CSS pixels.
- Existing `aria-live` announcement text is not changed by this work.

## Responsive behavior

| Viewport | Board scroll affordance | Empty Board | Root horizontal overflow |
| --- | --- | --- | --- |
| 360x800 | Shown when Board overflows | Compact | None |
| 390x844 | Shown when Board overflows | Compact | None |
| 1440x900 | Never shown | Standard | None |

- Safe-area insets continue to be respected. The affordance and compact empty state must not collide with the existing bottom navigation or safe-area padding.
- The Board's internal horizontal scroll remains intentional at narrow widths. Root-level horizontal overflow remains zero at all three viewports.
- Orientation change and resize across the breakpoint re-evaluate affordance visibility and empty-state layout without a reload and without losing focus position.

## Test/QA matrix with exact acceptance criteria

### Automated regression tests

| ID | Area | Acceptance criteria |
| --- | --- | --- |
| A1 | Board keyboard status/focus | Arrow keys and `h`/`j`/`k`/`l` move status/focus exactly as before the change. Assertions cover both key families. |
| A2 | Board activation | `Enter` and `Space` both activate the focused card action. |
| A3 | Focus restoration | After a card operation completes, focus returns to the expected element. |
| A4 | aria-live | Announcement region content matches the pre-change expectation for the covered operations. |
| A5 | Menu initial focus | Opening the mobile menu places focus inside the menu. |
| A6 | Menu Escape | `Escape` closes the mobile menu. |
| A7 | Menu focus return | After close by `Escape` and by selection, focus is on the original trigger. |
| A8 | Menu containment | `Tab` from the last focusable element and `Shift+Tab` from the first stay within the menu. |
| A9 | Dialog initial focus | Opening the shortcuts dialog places focus inside the dialog. |
| A10 | Dialog Escape | `Escape` closes the shortcuts dialog. |
| A11 | Dialog focus return | After close, focus is on the trigger that opened the dialog. |
| A12 | Dialog containment | `Tab`/`Shift+Tab` cycle within the dialog only. |
| A13 | Affordance gating | Affordance renders when narrow and overflowing; does not render when wide; does not render when narrow and not overflowing. |
| A14 | Copy accuracy | Board copy under test contains no wording that presents drag as the only status-change path. |

Automated suite must pass with zero failures. Existing suite must remain green; no tests may be deleted or skipped to achieve this.

### Manual browser QA (release gate)

Performed against populated, isolated test state. Empty-state-only verification does not satisfy this gate.

| ID | Viewport | Acceptance criteria |
| --- | --- | --- |
| B1 | 390x844 | Screenshot captured: populated Board, open mobile menu, open shortcuts dialog, empty Board. |
| B2 | 360x800 | Same screenshot set as B1. |
| B3 | 1440x900 | Same screenshot set as B1. |
| B4 | All three | axe reports zero violations for each captured state. |
| B5 | All three | Root horizontal overflow is zero; `documentElement.scrollWidth` does not exceed `clientWidth`. |
| B6 | 390x844, 360x800 | Board internal horizontal scroll works by touch/swipe and the affordance message is visible while off-screen columns exist. |
| B7 | 1440x900 | Affordance is absent. |
| B8 | 390x844, 360x800 | Empty Board primary actions are visible without scrolling. |
| B9 | All three | Console is free of errors and warnings introduced by this work; no uncaught errors during the full interaction pass. |
| B10 | All three | Menu and dialog focus lifecycle verified by keyboard: initial focus, `Escape`, focus return, containment. |
| B11 | 390x844 | Existing bottom navigation and safe-area padding are not visually or functionally disturbed. |

Test state must be isolated from any real user data and must not leave persisted browser data behind after QA.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Focus containment breaks existing Board keyboard navigation | A1-A4 regression tests run before and after; containment is scoped to the open menu/dialog only and is inactive when both are closed. |
| Affordance introduces root horizontal overflow | B5 asserts zero root overflow at all three viewports; affordance is positioned inside the existing layout bounds. |
| Affordance appears at desktop width or when no overflow exists | A13 covers all three gating cases; B7 confirms absence at 1440x900. |
| Compact empty state clips content or collides with bottom nav or safe area | B8 and B11 verify above-the-fold actions and undisturbed safe-area handling. |
| Duplicated focus logic drifts between menu and dialog | Single shared primitive is a stated architectural requirement; both consumers use it. |
| Affordance text competes with existing `aria-live` announcements | Affordance is static text, not a live region; B10 and A4 confirm announcements are unchanged. |
| Copy edits reintroduce drag-only phrasing later | A14 asserts on copy content so the constraint is enforced mechanically. |
| Scope creep into a redesign | Non-goals are explicit; review rejects visual changes outside the narrow-screen empty-state footprint. |
| Empty-state-only verification hides populated-state defects | Populated isolated test state is a hard gate in B1-B11. |

## Alternatives considered

- **Stack Board columns vertically on narrow screens.** Removes horizontal scroll entirely but is a redesign, loses the at-a-glance column comparison the Board exists to provide, and contradicts the settled decision that internal horizontal scroll is intentional. Rejected.
- **Fade or gradient edge cue instead of a swipe message.** Cheaper visually, but a pure visual gradient communicates nothing to screen reader users and is easy to miss in field lighting. Rejected in favor of an explicit message; a subtle visual cue may accompany the message later without changing this spec's contract.
- **Adopt a focus-trap library.** Well-tested, but adds a dependency, which is out of scope. A small in-repo primitive covers the two consumers this release needs. Rejected.
- **Add explicit horizontal scroll arrow buttons.** More discoverable for pointer users, but adds controls to a crowded narrow layout, increases touch-target pressure, and expands accessibility surface for little field benefit over swiping. Deferred.
- **Persist affordance dismissal across sessions.** Would reduce repeat noise but requires persisting user browser data, which is out of scope. Session-only in-memory dismissal chosen.
- **Compact empty state at all widths.** Simpler branching, but changes desktop appearance and crosses into redesign. Rejected; narrow-only.

## Rollout and rollback

Rollout:

1. Land the shared focus-lifecycle primitive and its tests first, with no consumer changes, so regression risk is isolated.
2. Wire the mobile menu and shortcuts dialog to the primitive. Run A1-A12.
3. Land copy changes and the narrow-only compact empty state. Run A14.
4. Land the narrow-only affordance with overflow detection. Run A13.
5. Run the full automated suite, then the manual browser QA gate B1-B11 against populated isolated test state at 390x844, 360x800, and 1440x900.
6. Publish to GitHub Pages using the existing deployment path. No Pages configuration changes.
7. Post-deploy, re-run B4, B5, and B9 spot checks against the deployed site.

Release blockers: any automated test failure, any axe violation, any root horizontal overflow, any console error, or any regression in existing Board keyboard behavior.

Rollback:

- The site is a local-first static build with no backend and no schema or storage key changes, so rollback is a redeploy of the previous build. No data migration, no user-state cleanup, and no coordination with a server is required.
- Because storage keys and schema are untouched, a user who loaded v0.9 and is rolled back to the prior version retains working local data.
- Partial rollback is possible per step: the affordance, copy, and compact empty state are independent of the focus primitive and can each be reverted alone. Reverting the focus primitive requires reverting its two consumers together.

Review: this lane is orchestrated and independently reviewed by Hermes before merge.
