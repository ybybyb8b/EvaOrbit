/** A complete card moves along one path during drag, native snap and reversal. */
export function subscriptionStackPose(progress: number, reducedMotion = false) {
  const amount = Math.abs(progress);
  const t = Math.min(1, amount);
  const depth = t * t * (3 - 2 * t);
  // Separate the two faces before their depth order crosses at half a slide.
  // The resting neighbours extend past the viewport, which crops their outer edges.
  const travel = 1.5 * t - .9 * t * t + .1 * t * t * t
    + .8 * Math.max(0, amount - 1) ** 2;
  return {
    x: Math.sign(progress) * travel,
    y: reducedMotion ? 0 : depth * 18,
    scale: reducedMotion ? 1 : 1 - depth * .07,
    // Stable depth bands: exchange order at half a slide, when faces are apart.
    zIndex: 100 - Math.floor(Math.min(amount, 3) + .5),
  };
}
