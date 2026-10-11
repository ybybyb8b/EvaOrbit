import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionMotionTrace, recordSubscriptionFrame, startSubscriptionMotionTrace } from "./subscription-motion-trace.ts";

test("diagnostics are opt-in, capture release and per-frame samples, and detach on stop", () => {
  const node = Object.assign(new EventTarget(), { scrollLeft: 25 }) as unknown as HTMLElement;
  assert.equal(subscriptionMotionTrace(node), null);
  const stop = startSubscriptionMotionTrace(node);
  const trace = subscriptionMotionTrace(node)!;
  node.dispatchEvent(new Event("touchend"));
  recordSubscriptionFrame(trace, trace.started + 8, trace.started + 9, 25, false, .2, false);
  recordSubscriptionFrame(trace, trace.started + 16, trace.started + 17, 30, true, .5, false);
  const result = stop();
  assert.equal(subscriptionMotionTrace(node), null);
  assert.deepEqual(result.frames.map(([raf, callback, ...values]) => [Math.round(raf), Math.round(callback), ...values]), [[8,9,25,false,.2,false,25], [16,17,30,true,.5,false,25]]);
  assert.equal(result.events[0][1], "touchend");
  node.dispatchEvent(new Event("scroll"));
  assert.equal(result.events.length, 1);
  assert.equal(result.truncated, false);
  assert.ok(!JSON.stringify(result).includes("node"));
});

test("recording memory is bounded and marks truncated traces", () => {
  const node = Object.assign(new EventTarget(), { scrollLeft: 0 }) as unknown as HTMLElement;
  const stop = startSubscriptionMotionTrace(node);
  const trace = subscriptionMotionTrace(node)!;
  for (let i = 0; i <= 20000; i++) recordSubscriptionFrame(trace, trace.started + i, trace.started + i, i, true, 0, false);
  const result = stop();
  assert.equal(result.frames.length, 20000);
  assert.equal(result.truncated, true);
});
