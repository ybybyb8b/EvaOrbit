import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionSectionSwipeIntent, subscriptionSectionSwipeStep } from "./subscription-section-swipe.ts";

test("section swipe waits for intent and yields to vertical scrolling", () => {
  assert.equal(subscriptionSectionSwipeIntent(7, 2), "pending");
  assert.equal(subscriptionSectionSwipeIntent(18, 4), "horizontal");
  assert.equal(subscriptionSectionSwipeIntent(18, 16), "vertical");
});

test("section swipe changes one adjacent section by distance or velocity", () => {
  assert.equal(subscriptionSectionSwipeStep({ dx: -70, velocityX: -0.2, width: 402, index: 0, count: 3 }), 1);
  assert.equal(subscriptionSectionSwipeStep({ dx: 36, velocityX: 0.7, width: 402, index: 1, count: 3 }), 0);
  assert.equal(subscriptionSectionSwipeStep({ dx: -24, velocityX: -1, width: 402, index: 1, count: 3 }), null);
});

test("section swipe does not wrap at either end", () => {
  assert.equal(subscriptionSectionSwipeStep({ dx: 90, velocityX: 1, width: 402, index: 0, count: 3 }), null);
  assert.equal(subscriptionSectionSwipeStep({ dx: -90, velocityX: -1, width: 402, index: 2, count: 3 }), null);
});
