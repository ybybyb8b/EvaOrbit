import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionStackPose as pose } from "./subscription-stack-motion.ts";

test("stack keeps its resting size and mirrors forward/backward dragging", () => {
  assert.deepEqual(pose(0), { x: 0, y: 0, scale: 1, zIndex: 100 });
  assert.ok(Math.abs(pose(1).scale - .93) < 1e-12);
  assert.equal(pose(1).y, 18);
  for (const progress of [.25, .5, .75, 1, 1.5, 2]) {
    const forward = pose(progress), backward = pose(-progress);
    assert.equal(forward.x, -backward.x);
    assert.equal(forward.y, backward.y);
    assert.equal(forward.scale, backward.scale);
    assert.equal(forward.zIndex, backward.zIndex);
  }
});

test("depth handoff happens while the two complete card faces are separated", () => {
  for (let progress = .47; progress <= .53; progress += .001) {
    const outgoing = pose(-progress), incoming = pose(1 - progress);
    assert.ok(incoming.x - outgoing.x > (incoming.scale + outgoing.scale) / 2);
  }
  assert.ok(pose(-.25).zIndex > pose(.75).zIndex);
  assert.ok(pose(-.75).zIndex < pose(.25).zIndex);
});

test("A variant changes each card's depth once per slide, including reversal", () => {
  const outgoing = Array.from({ length: 1001 }, (_, i) => pose(-i / 1000).zIndex);
  const incoming = Array.from({ length: 1001 }, (_, i) => pose(1 - i / 1000).zIndex);
  const changes = (values: number[]) => values.slice(1).filter((value, i) => value !== values[i]).length;
  assert.equal(changes(outgoing), 1);
  assert.equal(changes(incoming), 1);
  assert.equal(changes([...outgoing, ...outgoing.toReversed()]), 2);
  assert.ok(pose(-.499).zIndex > pose(.501).zIndex);
  assert.ok(pose(-.501).zIndex < pose(.499).zIndex);
});

test("drag, snap and reversal share a continuous path, including resting neighbours", () => {
  for (let progress = -2; progress < 2; progress += .001) {
    const current = pose(progress), next = pose(progress + .001);
    assert.ok(Math.abs(next.x - current.x) < .003);
    assert.ok(Math.abs(next.y - current.y) < .03);
    assert.ok(Math.abs(next.scale - current.scale) < .001);
  }
  // Flatten depth at the foreground and background rather than snapping the scale.
  assert.ok(Math.abs(pose(.0001).scale - pose(0).scale) < 1e-8);
  assert.ok(Math.abs(pose(.9999).scale - pose(1).scale) < 1e-8);
});

test("reduced motion keeps whole faces at full size without vertical movement", () => {
  for (const progress of [-1, -.5, 0, .5, 1]) {
    assert.equal(pose(progress, true).scale, 1);
    assert.equal(pose(progress, true).y, 0);
    assert.equal(pose(progress, true).x, pose(progress).x);
  }
});
