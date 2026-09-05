# 003 — Preserve feedback under Reduced Motion

- **Status**: DONE
- **Severity**: HIGH
- **Category**: Accessibility; motion policy
- **Estimated scope**: 1 file, approximately 20 lines

## Problem

`src/app/globals.css` currently contains two repository-wide Reduced Motion resets. One removes every transition and animation, while the later duplicate collapses every duration to `.01ms`. Together they erase useful color and opacity feedback and also stop the pull-to-refresh activity indicator despite its component-level exception.

```css
/* src/app/globals.css — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
```

## Target

1. Replace both blanket resets with one coherent Reduced Motion policy.
2. Disable smooth scrolling and remove movement/layout properties from transitions, while retaining restrained color, background, border, shadow, and opacity feedback.
3. Stop the decorative typing-dot bounce in a stable visible state.
4. Keep the pull-to-refresh spinner as an understandable activity indicator at its existing reduced-motion duration.
5. Preserve the drawer's existing opacity-only Reduced Motion behavior and instant/non-spatial transitions elsewhere.

## Repo conventions to follow

- Global motion tokens and cross-feature accessibility rules live in `src/app/globals.css`.
- Component-specific Reduced Motion blocks for the spaces drawer and pull-to-refresh already encode local behavior; retain them.
- Follow the installed Next.js 16.3.2 CSS guidance: keep global selectors in the existing root stylesheet and do not introduce a runtime media-query hook for a CSS-only policy.

## Steps

1. Remove the early global `transition:none` / `animation:none` Reduced Motion block and the later duplicate `.01ms` duration block.
2. Add one global Reduced Motion block near the existing interaction layer. Set smooth scrolling to `auto` for `html` and `.message-scroll`.
3. Under that media query, restrict transition properties on elements and pseudo-elements to `color`, `background-color`, `border-color`, `box-shadow`, and `opacity`, using `!important` so movement declared in shorthands cannot animate. Do not zero all transition durations.
4. Disable only the decorative `.typing i` keyframe animation and leave the dots visible, unshifted, and gently differentiated by opacity.
5. Keep the mobile drawer and pull-to-refresh Reduced Motion blocks. Confirm the spinner's `1.2s` duration is no longer overridden by a global animation-duration reset.

## Boundaries

- Do NOT redesign hover states or implement the separate hover-motion audit item.
- Do NOT change component state, markup, navigation, or pull-to-refresh behavior.
- Do NOT add an animation library, JavaScript media-query listener, or user preference setting.
- Do NOT touch native iOS files or packaging documentation in this plan.

## Verification

- **Mechanical**:
  - Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
  - Confirm exactly one global Reduced Motion policy remains and no universal `transition:none`, `animation:none`, or `.01ms` duration reset remains.
- **Feel check**:
  - With Reduced Motion enabled, opening chat history changes state without lateral interpolation; ordinary buttons still communicate hover/focus through color or opacity.
  - The spaces drawer uses its existing opacity-only entrance/exit and still unmounts after closing.
  - Typing dots remain readable without bouncing; the pull-to-refresh spinner continues to indicate active work without speeding up.
- **Done when**: movement transitions are suppressed without erasing useful feedback or progress indication, and validation passes.
