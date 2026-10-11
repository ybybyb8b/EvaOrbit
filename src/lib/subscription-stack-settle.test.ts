import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionSettle as settle, subscriptionSnapTarget as target } from "./subscription-stack-settle.ts";

test("settle retains fractional progress through the last native integer steps", () => {
  const values = Array.from({ length: 60 }, (_, i) => settle(290, 293, 0, i / 60).left);
  assert.equal(values[0], 290);
  assert.ok(values.slice(1).every((value, i) => value > values[i] && value < 293));
  assert.ok(values.slice(1).every(value => value !== Math.round(value)));
  assert.ok(Math.abs(values.at(-1)! - 293) < .001);
});
test("spring inherits release velocity without overshooting or depending on frame rate", () => {
  for (const [from,to,velocity] of [[671,586,-300], [45,293,1600], [346,586,900]]) {
    for (const time of [0,.1,.3,.5,1]) {
      const sample = settle(from,to,velocity,time);
      assert.ok(sample.left >= Math.min(from,to) && sample.left <= Math.max(from,to));
    }
    assert.equal(settle(from,to,velocity,0).left, from);
    assert.ok(Math.abs(settle(from,to,velocity,1.5).left-to)<.0001);
  }
});
test("target respects paused drags, flick direction and single-step momentum", () => {
  const positions=[0,293,586,878];
  assert.equal(target(positions,671,0),586);
  assert.equal(target(positions,45,.7),293);
  assert.equal(target(positions,346,100),586);
  assert.equal(target(positions,878,2),878);
  assert.equal(target(positions,-40,-1),0);
});
