import assert from "node:assert/strict";
import test from "node:test";

import {
  getPullRefreshDistance,
  MAX_PULL_DISTANCE,
  PULL_DRAG_SCALE,
  REFRESH_THRESHOLD,
  shouldTriggerPullRefresh,
} from "./pull-refresh-gesture.ts";

test("pull distance clamps negative input and preserves the linear response through the threshold", () => {
  assert.equal(getPullRefreshDistance(-20), 0);
  assert.equal(getPullRefreshDistance(0), 0);
  assert.equal(getPullRefreshDistance(100), 100 * PULL_DRAG_SCALE);
  assert.equal(getPullRefreshDistance(REFRESH_THRESHOLD / PULL_DRAG_SCALE), REFRESH_THRESHOLD);
});

test("over-pull stays continuous, monotonic, and below the maximum", () => {
  const atThreshold = getPullRefreshDistance(REFRESH_THRESHOLD / PULL_DRAG_SCALE);
  const firstOverPull = getPullRefreshDistance(140);
  const secondOverPull = getPullRefreshDistance(250);
  const distantOverPull = getPullRefreshDistance(1_000);

  assert.equal(atThreshold, REFRESH_THRESHOLD);
  assert.ok(firstOverPull > atThreshold);
  assert.ok(secondOverPull > firstOverPull);
  assert.ok(distantOverPull > secondOverPull);
  assert.ok(distantOverPull < MAX_PULL_DISTANCE);
});

test("distance threshold triggers regardless of pull speed", () => {
  assert.equal(shouldTriggerPullRefresh(REFRESH_THRESHOLD, 10_000), true);
});

test("slow and too-short under-threshold pulls do not trigger", () => {
  assert.equal(shouldTriggerPullRefresh(40, 1_000), false);
  assert.equal(shouldTriggerPullRefresh(REFRESH_THRESHOLD / 2 - 1, 1), false);
});

test("a deliberate half-threshold flick above the velocity threshold triggers", () => {
  assert.equal(shouldTriggerPullRefresh(REFRESH_THRESHOLD / 2, 300), true);
});
