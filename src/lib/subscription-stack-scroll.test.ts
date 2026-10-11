import test from "node:test";
import assert from "node:assert/strict";
import { trackSubscriptionScroll } from "./subscription-stack-scroll.ts";

test("C follows release and snap between scroll events, stops at rest and cleans up", () => {
  let time = 0, id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const originals = new Map(["performance", "requestAnimationFrame", "cancelAnimationFrame", "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, {
    performance: { configurable: true, value: { now: () => time } },
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; } },
    cancelAnimationFrame: { configurable: true, value: (key: number) => frames.delete(key) },
    window: { configurable: true, value: { matchMedia: () => ({ matches: false }) } },
  });
  const node = Object.assign(new EventTarget(), { scrollLeft: 0, style: { scrollSnapType: "" } });
  const painted: number[] = [];
  const step = (elapsed = 8) => {
    time += elapsed;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(time));
  };
  const touch = (name: string, count: number) => node.dispatchEvent(Object.assign(new Event(name), { touches: Array(count).fill({}) }));
  try {
    const tracker = trackSubscriptionScroll(node as unknown as HTMLElement, left => painted.push(left));
    step();
    assert.deepEqual(painted, [0]);
    // Native scrollLeft advances without emitting another scroll event.
    for (const left of [40, 80, 110, 125, 132, 134, 134.5]) {
      node.scrollLeft = left; step();
    }
    assert.deepEqual(painted, [0, 40, 80, 110, 125, 132, 134, 134.5]);
    step();
    assert.equal(painted.length, 8, "unchanged progress must not repaint");
    step(160);
    assert.equal(frames.size, 0, "no idle polling after settlement");
    node.scrollLeft = 120; node.dispatchEvent(new Event("scroll")); step();
    assert.equal(painted.at(-1), 120, "reverse scrolling resumes from live progress");
    tracker.invalidate(); step();
    assert.equal(painted.at(-1), 120, "resize/theme invalidation repaints unchanged progress");
    tracker.dispose();
    assert.equal(frames.size, 0);
    node.dispatchEvent(new Event("scroll")); touch("touchstart", 1);
    assert.equal(frames.size, 0, "disposed listeners cannot restart tracking");

    // Reproduce the phone's integer-only scrollLeft while preserving float visuals.
    let nativeLeft = 0;
    const gestureRail = Object.assign(new EventTarget(), { style: { scrollSnapType: "" }, clientWidth: 366,
      scrollWidth: 1244, children: [37,329,622,915].map(offsetLeft => ({ offsetLeft, offsetWidth: 293 })),
      setPointerCapture: () => {}, hasPointerCapture: () => false, releasePointerCapture: () => {} });
    Object.defineProperty(gestureRail, "scrollLeft", { get: () => nativeLeft, set: (left: number) => { nativeLeft = Math.round(left); } });
    const visuals: number[] = [];
    const fractional = trackSubscriptionScroll(gestureRail as unknown as HTMLElement, left => visuals.push(left));
    const pointer = (type: string, x: number) => gestureRail.dispatchEvent(Object.assign(new Event(type),
      { isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: 50 }));
    step(); pointer("pointerdown", 200); step(); pointer("pointermove", 50); step();
    assert.equal(visuals.at(-1), 150);
    step(120); pointer("pointerup", 50);
    const released = visuals.length;
    for (let i = 0; i < 180; i++) step();
    assert.ok(visuals.slice(released).filter(left => left !== Math.round(left)).length > 20);
    assert.equal(visuals.at(-1), 293);
    assert.equal(nativeLeft, 293);
    assert.equal(frames.size, 0, "fractional settlement also stops at rest");

    const finger = (type: string, x: number, y = 50, count = 1) => {
      const event = Object.assign(new Event(type, { cancelable: true }), {
        touches: count ? [{ identifier: 7, clientX: x, clientY: y }] : [],
      });
      gestureRail.dispatchEvent(event);
      return event;
    };
    finger("touchstart", 220); step(200);
    assert.equal(frames.size, 1, "a stationary finger keeps tracking alive");
    assert.equal(finger("touchmove", 100).defaultPrevented, true, "horizontal touch owns scrolling");
    step(); assert.equal(visuals.at(-1), 413, "touch drag follows the finger without pointer events");
    step(120); finger("touchend", 100, 50, 0);
    for (let i = 0; i < 180; i++) step();
    assert.equal(visuals.at(-1), 293);
    finger("touchstart", 220);
    assert.equal(finger("touchmove", 220, 100).defaultPrevented, false, "vertical page scrolling is preserved");
    finger("touchcancel", 220, 100, 0); step(200);
    fractional.dispose();
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
