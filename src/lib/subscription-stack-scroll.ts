import { recordSubscriptionFrame, subscriptionMotionTrace } from "./subscription-motion-trace.ts";
import { subscriptionSettle, subscriptionSnapTarget } from "./subscription-stack-settle.ts";

/** Fractional gesture and settle progress; the native rail remains the hit/keyboard layer. */
export function trackSubscriptionScroll(node: HTMLElement, paint: (left: number) => void) {
  let frame = 0;
  let touching = false;
  let dirty = true;
  let previousLeft = NaN;
  let lastActivity = performance.now();
  let presentation: number | null = null;
  let settling: { from: number; to: number; velocity: number; started: number } | null = null;
  let gesture: { id: number; x: number; y: number; from: number; max: number; dragging: boolean; samples: [number, number][] } | null = null;
  let suppressClick = false;
  const nativeSnap = node.style.scrollSnapType;
  const eventRoot = node.ownerDocument?.defaultView ?? node;
  // This is an idle shutdown window, not a new easing duration or snap animation.
  const idleWindow = 160;
  function tick(now: number) {
    frame = 0;
    const trace = subscriptionMotionTrace(node);
    const callbackTime = trace ? performance.now() : 0;
    if (settling) {
      const value = subscriptionSettle(settling.from, settling.to, settling.velocity, Math.max(0, now - settling.started) / 1000);
      presentation = value.left;
      if (Math.abs(value.left - settling.to) < .02 && Math.abs(value.velocity) < .2) {
        presentation = settling.to;
        settling = null;
      }
      node.scrollLeft = presentation;
    }
    const left = presentation ?? node.scrollLeft;
    const painted = dirty || left !== previousLeft;
    if (left !== previousLeft) lastActivity = now;
    if (painted) {
      previousLeft = left;
      dirty = false;
      paint(left);
    }
    if (trace) recordSubscriptionFrame(trace, now, callbackTime, left, painted, performance.now() - callbackTime, touching);
    if (!settling && !gesture && presentation !== null) {
      presentation = null;
      node.style.scrollSnapType = nativeSnap;
    }
    if (touching || settling || now - lastActivity < idleWindow) frame = requestAnimationFrame(tick);
  }
  function wake() {
    lastActivity = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function invalidate() { dirty = true; wake(); }
  function snapTo(to: number, instant = false, velocity = 0) {
    to = Math.max(0, Math.min(node.scrollWidth - node.clientWidth, Math.round(to)));
    const from = presentation ?? node.scrollLeft;
    node.style.scrollSnapType = "none";
    presentation = from;
    if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settling = null; presentation = to; node.scrollLeft = to;
    } else settling = { from, to, velocity: velocity * 1000, started: performance.now() };
    invalidate();
  }
  function pointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    suppressClick = false;
    const from = presentation ?? node.scrollLeft;
    settling = null; presentation = from;
    node.style.scrollSnapType = "none";
    node.scrollLeft = from;
    touching = true;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, from,
      max: Math.max(0, node.scrollWidth - node.clientWidth), dragging: false, samples: [[performance.now(), from]] };
    wake();
  }
  function pointerMove(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8 || Math.abs(dy) >= Math.abs(dx)) return;
      gesture.dragging = true;
      node.setPointerCapture(event.pointerId);
    }
    const now = performance.now();
    presentation = Math.max(-node.clientWidth * .3, Math.min(gesture.max + node.clientWidth * .3, gesture.from - dx));
    node.scrollLeft = presentation;
    gesture.samples.push([now, presentation]);
    gesture.samples = gesture.samples.filter(([time]) => now - time <= 100);
    wake();
  }
  function pointerEnd(input: Event) {
    const event = input as PointerEvent;
    if (!gesture || gesture.id !== event.pointerId) return;
    const ended = gesture;
    gesture = null; touching = false;
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    if (ended.dragging) {
      suppressClick = true;
      const now = performance.now(), first = ended.samples[0], last = ended.samples.at(-1)!;
      const velocity = event.type === "pointercancel" || now - last[0] > 100 || last[0] === first[0] ? 0 : (last[1] - first[1]) / (last[0] - first[0]);
      const positions = Array.from(node.children, (child, index) => index === 0 ? 0 : index === node.children.length - 1 ? ended.max : Math.max(0, Math.min(ended.max,
        Math.round((child as HTMLElement).offsetLeft + (child as HTMLElement).offsetWidth / 2 - node.clientWidth / 2))));
      snapTo(subscriptionSnapTarget(positions, presentation ?? node.scrollLeft, velocity), false, velocity);
    } else {
      // A tap or vertical pan retains its normal link/page-scroll behaviour.
      presentation = null; node.style.scrollSnapType = nativeSnap;
    }
    wake();
  }
  function click(event: MouseEvent) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault(); event.stopPropagation(); suppressClick = false;
    }
  }
  function wheel() { settling = null; presentation = null; node.style.scrollSnapType = nativeSnap; wake(); }
  function touchStart() { touching = true; wake(); }
  function touchEnd(event: Event) {
    touching = (event as TouchEvent).touches.length > 0;
    wake();
  }
  node.addEventListener("scroll", wake, { passive: true });
  node.addEventListener("wheel", wheel, { passive: true });
  node.addEventListener("pointerdown", pointerDown);
  node.addEventListener("pointermove", pointerMove);
  eventRoot.addEventListener("pointerup", pointerEnd);
  eventRoot.addEventListener("pointercancel", pointerEnd);
  node.addEventListener("click", click, true);
  node.addEventListener("touchstart", touchStart, { passive: true });
  node.addEventListener("touchend", touchEnd, { passive: true });
  node.addEventListener("touchcancel", touchEnd, { passive: true });
  invalidate();
  return {
    invalidate,
    snapTo,
    dispose() {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", wake);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("pointerdown", pointerDown);
      node.removeEventListener("pointermove", pointerMove);
      eventRoot.removeEventListener("pointerup", pointerEnd);
      eventRoot.removeEventListener("pointercancel", pointerEnd);
      node.removeEventListener("click", click, true);
      node.style.scrollSnapType = nativeSnap;
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", touchEnd);
    },
  };
}
