import assert from "node:assert/strict";
import test from "node:test";
import { pageBackFallback, pageNavigationState } from "./page-navigation.ts";

test("direct entry returns to the closest functional page", () => {
  for (const [path, expected] of [
    ["/", "/"], ["/tasks", "/"], ["/settings", "/"],
    ["/settings/notifications", "/settings"], ["/food/places/123", "/food/places"],
    ["/projects/1/items/2", "/projects/1"], ["/media/series/1", "/media"],
  ]) assert.equal(pageBackFallback(path), expected);
});

test("history markers preserve the initial entry on back, forward, and reload", () => {
  const initial = pageNavigationState({ __NA: true }, false);
  assert.equal(initial.__NA, true);
  assert.equal(initial.evaOrbitCanGoBack, false);
  assert.equal(pageNavigationState(initial, true).evaOrbitCanGoBack, false);
  const next = pageNavigationState({ __NA: true }, true);
  assert.equal(next.evaOrbitCanGoBack, true);
  assert.equal(pageNavigationState(next, false).evaOrbitCanGoBack, true);
});
