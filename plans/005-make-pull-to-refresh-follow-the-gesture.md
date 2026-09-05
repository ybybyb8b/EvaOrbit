# 005 — Make pull-to-refresh follow the gesture

- **Status**: DONE
- **Commit**: 46342a5
- **Severity**: MEDIUM
- **Category**: Performance; interruptibility; physicality
- **Estimated scope**: 4 files, approximately 110 lines

## Problem

The mobile pull-to-refresh gesture updates two CSS custom properties on the parent indicator for every `touchmove`. One variable drives the parent transform and opacity while the other also drives the child spinner transform, causing avoidable subtree style recalculation. The indicator's fixed transition remains active while the finger directly manipulates it, so it visually chases the gesture. Its linear response also stops at a hard maximum, and release ignores velocity.

```tsx
// src/components/pull-to-refresh.tsx:50 — current
indicator.style.setProperty("--pull-distance", `${distance}px`);
indicator.style.setProperty("--pull-progress", `${Math.min(distance / REFRESH_THRESHOLD, 1)}`);
```

```tsx
// src/components/pull-to-refresh.tsx:84 — current
const distance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.52);
```

```css
/* src/app/globals.css:3924 — current */
.pull-refresh-indicator {
  opacity:var(--pull-progress);
  transform:translate3d(-50%,calc(-100% - 10px + var(--pull-distance)),0);
  transition:opacity 120ms ease,transform 180ms cubic-bezier(.22,.8,.26,1);
}
.pull-refresh-spinner { transform:rotate(calc(var(--pull-progress) * 220deg)); }
```

## Target

1. Update `transform` and `opacity` directly on the indicator and `transform` directly on the spinner during touch movement. Do not use parent CSS variables to drive child animation.
2. Disable transitions while the finger owns the gesture; restore a `120ms` opacity / `180ms` transform settle using the existing `--motion-ease-out` token only after release or cancellation.
3. Preserve the existing linear `0.52` response through the established `68px` refresh threshold. Beyond it, apply rising resistance that asymptotically approaches the existing `112px` maximum instead of hitting a wall:

```ts
const linearDistance = Math.max(deltaY, 0) * 0.52;
if (linearDistance <= 68) return linearDistance;
const range = 112 - 68;
return 68 + range * (1 - Math.exp(-(linearDistance - 68) / range));
```

4. Refresh on either the existing `68px` distance threshold or a deliberate quick pull that reaches at least half the threshold and exceeds `0.11 px/ms`, measured as visual distance divided by elapsed gesture time.
5. Preserve the current `54px` refreshing resting position, `360ms` reload delay, disabled target rules, page/breakpoint gating, labels, status semantics, and Reduced Motion behavior.

## Repo conventions to follow

- The component is already the narrow Client Component boundary for browser events and lifecycle state; keep the gesture inside `src/components/pull-to-refresh.tsx`.
- Put pure gesture math in `src/lib/pull-refresh-gesture.ts` so Node tests can cover thresholds and damping without a DOM.
- Existing motion tokens are `--motion-fast:120ms`, `--motion-base:180ms`, and `--motion-ease-out:cubic-bezier(.23,1,.32,1)` in `src/app/globals.css`; reuse them.
- The installed Next.js 16.3.2 guidance permits browser event lifecycle code in this existing Client Component and keeps the component styling in the existing global stylesheet.

## Steps

1. Add `src/lib/pull-refresh-gesture.ts` exporting the existing threshold/max/drag-scale values, `getPullRefreshDistance(deltaY)`, and `shouldTriggerPullRefresh(distance, elapsedMs)`. Clamp elapsed time to at least `1ms`; require `distance >= REFRESH_THRESHOLD / 2` for the velocity path to prevent short accidental taps from refreshing.
2. Add `src/lib/pull-refresh-gesture.test.ts` covering negative/zero input, unchanged linear response below threshold, continuity at 68px, monotonic resistant over-pull below 112px, distance-triggered refresh, slow under-threshold rejection, short fast-pull rejection, and accepted half-threshold flick above `0.11 px/ms`.
3. In `src/components/pull-to-refresh.tsx`, import the pure constants/helpers. Add a spinner ref and store gesture start time plus current visual distance. Replace `setProperty` with direct inline `indicator.style.transform`, `indicator.style.opacity`, and `spinner.style.transform` writes.
4. While tracking, disable the indicator transition before visual updates. On release/cancel, restore the stylesheet transition, force one computed-style read at that low-frequency boundary, then settle to `0` or `54` through the existing CSS transition. Never force layout during `touchmove`.
5. Use `getPullRefreshDistance(deltaY)` for damping and `shouldTriggerPullRefresh(currentDistance, performance.now() - startTime)` on release. Preserve the existing state machine and reload timer. Cancel safely on additional touches so another finger cannot take over the original gesture.
6. In `src/app/globals.css`, remove `--pull-distance` and `--pull-progress`; make the base indicator's hidden transform/opacity static, use the existing motion tokens for release settling, and remove the spinner's variable-driven transform. Keep the refreshing keyframe and existing Reduced Motion override.

## Boundaries

- Do NOT change which routes, controls, overlays, scroll states, or viewports enable pull-to-refresh.
- Do NOT change copy, DOM order, z-index, material styling, refresh endpoint, or the `360ms` reload timing.
- Do NOT add Motion, a gesture library, pointer-event rewrite, haptics, or dependencies.
- Do NOT alter the drawer, native launch files, iOS documentation, supplied images, or pre-existing uncommitted work.
- If the source no longer matches commit `46342a5` plus completed plans 003/004, stop and report the drift instead of improvising.

## Verification

- **Mechanical**:
  - Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
  - Confirm no `--pull-distance` or `--pull-progress` reference remains and no computed-style/layout read occurs inside `touchmove`.
- **Feel check**:
  - On an iPhone 16 Pro viewport and real Safari/PWA, slowly drag through 68px: the indicator must stay under the finger without tween lag, then gain progressive resistance without a hard stop.
  - Release below threshold slowly: it settles away and does not refresh. Flick beyond 34px quickly: it refreshes. Tiny quick pulls do not refresh.
  - Add a second touch during a pull: the gesture cancels without jumping to the other finger.
  - Release from ready state: the indicator settles to 54px while refreshing and the spinner remains linear.
  - With Reduce Motion enabled, release settling is instant but state and progress feedback remain understandable.
- **Done when**: direct manipulation is one-to-one, over-pull has rising resistance, quick deliberate pulls are velocity-aware, and validation passes.
