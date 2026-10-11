import test from "node:test";
import assert from "node:assert/strict";
import { trackSubscriptionScroll } from "./subscription-stack-scroll.ts";

test("C follows release and snap between scroll events, stops at rest and cleans up", () => {
  let time = 0, id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const originals = new Map(["performance", "requestAnimationFrame", "cancelAnimationFrame"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, {
    performance: { configurable: true, value: { now: () => time } },
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; } },
    cancelAnimationFrame: { configurable: true, value: (key: number) => frames.delete(key) },
  });
  const node = Object.assign(new EventTarget(), { scrollLeft: 0 });
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
    touch("touchstart", 1);
    step(200);
    assert.equal(frames.size, 1, "a stationary finger must not terminate tracking");
    touch("touchend", 0);
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
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
