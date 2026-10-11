import { recordSubscriptionFrame, subscriptionMotionTrace } from "./subscription-motion-trace.ts";

/** Follow native momentum/snap on every display frame, even between scroll events. */
export function trackSubscriptionScroll(node: HTMLElement, paint: (left: number) => void) {
  let frame = 0;
  let touching = false;
  let dirty = true;
  let previousLeft = NaN;
  let lastActivity = performance.now();
  // This is an idle shutdown window, not a new easing duration or snap animation.
  const idleWindow = 160;
  function tick(now: number) {
    frame = 0;
    const trace = subscriptionMotionTrace(node);
    const callbackTime = trace ? performance.now() : 0;
    const left = node.scrollLeft;
    const painted = dirty || left !== previousLeft;
    if (left !== previousLeft) lastActivity = now;
    if (painted) {
      previousLeft = left;
      dirty = false;
      paint(left);
    }
    if (trace) recordSubscriptionFrame(trace, now, callbackTime, left, painted, performance.now() - callbackTime, touching);
    if (touching || now - lastActivity < idleWindow) frame = requestAnimationFrame(tick);
  }
  function wake() {
    lastActivity = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function invalidate() { dirty = true; wake(); }
  function touchStart() { touching = true; wake(); }
  function touchEnd(event: Event) {
    touching = (event as TouchEvent).touches.length > 0;
    wake();
  }
  node.addEventListener("scroll", wake, { passive: true });
  node.addEventListener("wheel", wake, { passive: true });
  node.addEventListener("touchstart", touchStart, { passive: true });
  node.addEventListener("touchend", touchEnd, { passive: true });
  node.addEventListener("touchcancel", touchEnd, { passive: true });
  invalidate();
  return {
    invalidate,
    dispose() {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", wake);
      node.removeEventListener("wheel", wake);
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", touchEnd);
    },
  };
}
