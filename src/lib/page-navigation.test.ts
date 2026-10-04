import assert from "node:assert/strict";
import test from "node:test";
import { pageBackFallback, pageNavigationState, isFoodDrinkPath } from "./page-navigation.ts";

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

 test("Food and Drink child pages share one navigation parent", () => {
  for (const path of ["/food-drink", "/food", "/drinks", "/food/places/2", "/food/library", "/drinks/history"]) assert.equal(isFoodDrinkPath(path), true);
  for (const path of ["/foodie", "/cats/food", "/drinks-old"]) assert.equal(isFoodDrinkPath(path), false);
  for (const path of ["/food", "/drinks", "/drinks/history", "/food/places", "/food/library"]) assert.equal(pageBackFallback(path), "/food-drink");
});
