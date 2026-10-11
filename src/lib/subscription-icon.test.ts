import assert from "node:assert/strict";
import test from "node:test";
import { iconHasTransparency, representativeIconColor } from "./subscription-icon-color.ts";
import { subscriptionIconSource, validSubscriptionIconKey } from "./subscription-icon.ts";

test("uploaded icon transparency is independent of its representative color", () => {
  assert.equal(iconHasTransparency([240,20,60,255,240,20,60,255]), false);
  assert.equal(iconHasTransparency([240,20,60,255,0,0,0,0]), true);
  assert.equal(representativeIconColor([240,20,60,255,0,0,0,0]), "#f0143c");
  assert.equal(iconHasTransparency([255,255,255,255]), false);
  assert.equal(representativeIconColor([255,255,255,255]), null);
});

test("subscription icons have versioned, constrained sources and a default fallback", () => {
  const key = "12345678-abcd-1234-abcd-123456789abc.png";
  assert.equal(subscriptionIconSource({id:7,iconPath:key}), `/api/subscriptions/7/icon?v=${key}`);
  assert.equal(subscriptionIconSource({id:7}), null);
  for (const invalid of ["../../image.png", "https://example.com/icon.png", "icon.svg", "123.png"]) assert.equal(validSubscriptionIconKey(invalid), false);
});
