# Debug Session: mobile-white-flash [OPEN]

## Symptom
- On mobile, when tapping the button on the second screen to navigate to the third screen, a brief white screen appears.

## Expected
- The transition from snapshot screen to results screen should remain visually dark with no white flash.

## Hypotheses
1. `AnimatePresence` leaves a brief gap between unmounting the snapshot section and mounting the results section on mobile.
2. The viewport remains scrolled near the lower part of the snapshot page during the transition, exposing an empty area before results layout settles.
3. A container temporarily collapses in height or transform composition causes a flash on mobile GPUs.
4. The white flash is the browser/viewport repaint or overscroll background showing through during the transition.

## Plan
- Add runtime instrumentation only.
- Reproduce on mobile viewport.
- Collect logs for transition timing, scroll position, viewport metrics, and visible DOM state.
- Confirm or reject hypotheses with evidence before changing logic.

## Evidence
- Log line 1: click occurred at `scrollY=609` on mobile viewport `390x844`.
- Log line 2: after state switch, `hasSnapshot=true` and `hasResults=true` at the same time while `scrollY` was still `609`.
- Log line 2: `bodyBg` and `rootBg` were both `rgb(0, 0, 0)`, so the white flash was not caused by page background color.
- Log line 3: scroll position became `0` only on the next animation frame, after the transition had already started.

## Hypothesis Status
| ID | Hypothesis | Status | Evidence |
|----|------------|--------|----------|
| A | AnimatePresence leaves a gap between snapshot unmount and results mount | Confirmed | Line 2 shows both screens coexisting during transition. |
| B | Viewport remains scrolled low during transition | Confirmed | Line 1 and line 2 show `scrollY=609` before the next frame. |
| C | Container collapses in height | Rejected | Line 2 and line 3 show large stable `bodyHeight/rootHeight`, no collapse. |
| D | Browser/root background flashes white | Rejected | Line 2 reports both body and root backgrounds as black. |

## Post-Fix Evidence
- Post-fix line 5: click still starts at `scrollY=609`, matching the real mobile path.
- Post-fix line 3: by the time transition state changes, `scrollY=0`, so viewport reset now happens before the visible transition gap.
- Post-fix line 3 and 4: `bodyHeight/rootHeight` stay at `1453` during transition instead of jumping to the much taller results page, which means the results page is no longer mounting in parallel during the visible transition.

## Fix Summary
- Move viewport reset to happen immediately before state switch.
- Use a single `AnimatePresence mode="wait"` flow for snapshot/results so the old screen exits before the next one enters.
