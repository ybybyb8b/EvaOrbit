# 002 — Make the spaces drawer exit and reverse cleanly

- **Status**: DONE
- **Commit**: 8c70bdb
- **Severity**: HIGH
- **Category**: Continuity; interruptibility; accessibility
- **Estimated scope**: 2 files, approximately 45 lines

## Problem

The mobile spaces drawer is conditionally mounted only while `spacesOpen` is true. Opening gets a one-shot keyframe, but closing immediately removes the layer from the DOM, so there is no spatial exit and an in-progress entrance cannot reverse.

```tsx
// src/components/app-shell.tsx — current
{spacesOpen && <div className="space-drawer-layer" role="presentation">
```

```css
/* src/app/globals.css — current */
.space-drawer-backdrop { animation:space-drawer-backdrop-in .18s ease-out both; }
.space-drawer { animation:space-drawer-in .22s cubic-bezier(.2,.75,.2,1) both; }
```

## Target

1. Represent the drawer lifecycle as `closed | opening | open | closing` so it remains mounted through the exit transition.
2. Enter from the right with transform and opacity, and exit along the same spatial path. Use CSS transitions so a close during entry retargets from the current visual state.
3. Keep the body scroll lock and pull-to-refresh suppression active until the closing transition completes.
4. Use the existing mobile drawer DOM and styling. Add no animation library or component dependency.
5. Under Reduce Motion, remove drawer translation but retain a restrained opacity transition; closing must still unmount reliably.

## Repo conventions to follow

- `AppShell` is already a Client Component and owns drawer state, Escape handling, body scroll lock, and the mobile trigger.
- Global motion tokens live in `src/app/globals.css`; add named easing tokens there and reuse them in drawer transitions.
- Keep the drawer available only on the existing mobile breakpoint and preserve safe-area sizing, theme surfaces, backdrop/transparency fallbacks, routes, and labels.
- Follow the installed Next.js 16.3.2 docs: browser state and lifecycle logic remain inside the existing Client Component; global CSS stays in the root stylesheet.

## Steps

1. In `src/components/app-shell.tsx`, replace the boolean drawer state with a four-phase state. Mount on `opening`, advance to `open` on the next animation frame, switch to `closing` for every close path, and unmount on the drawer transition end only if the latest phase is still `closing`. Add a cancellable 240ms fallback for client-side navigations that drop `transitionend`; its callback must also verify the latest phase is still `closing`.
2. Base body locking, Escape handling, pull-to-refresh suppression, trigger active/expanded state, and conditional rendering on `phase !== "closed"`. Keep close requests idempotent in `closing` and `closed`.
3. Expose the current lifecycle on `.space-drawer-layer` with `data-state`. Keep the existing dialog semantics and routes unchanged.
4. In `src/app/globals.css`, replace the two entry keyframes with state-driven transitions. Use `translateX(100%)` plus opacity while closed/closing, and identity plus full opacity when open. Use a 220ms drawer entrance with `cubic-bezier(.32,.72,0,1)` and a 180ms ease-out exit; coordinate the backdrop at 180ms.
5. Update the drawer-specific reduced-motion rule so transform is disabled and opacity remains the only transition. Ensure the transition-end handler still receives an event and removes the closing layer.

## Boundaries

- Do NOT change navigation destinations, drawer content, Eva panel behavior, themes, or desktop layout.
- Do NOT fix the repository-wide reduced-motion reset in this plan; limit the exception to the spaces drawer.
- Do NOT add focus-trap behavior or replace the drawer with a new UI primitive as part of this motion-only change.
- Do NOT touch the native iOS task, documentation changes, deleted artifacts, installed skill files, or lockfile.
- If the relevant source no longer matches commit `8c70bdb`, stop and report the drift instead of improvising.

## Verification

- **Mechanical**:
  - Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
  - Confirm there are no remaining `space-drawer-in` keyframes or one-shot drawer animations.
- **Feel check**:
  - At the iPhone 16 Pro viewport, open and close via backdrop, close button, Escape, and a navigation link. Every path must animate out and release the body scroll lock after exit.
  - Close during the 220ms entrance. The drawer must reverse from its current position without snapping or waiting for the entrance to finish.
  - Reopen after close and repeat rapidly. No stale transition event may unmount an open drawer.
  - Navigate through a drawer link. If route rendering drops `transitionend`, the 240ms fallback must release the layer and body lock; reopening before then must cancel the stale fallback.
  - With Reduce Motion enabled, only opacity changes; there is no lateral travel, and the layer still unmounts after closing.
- **Done when**: all close paths preserve a coherent exit, entry can be interrupted, no hidden overlay or body lock remains, and validation passes.
