import assert from "node:assert/strict";
import test from "node:test";
import { pageBackFallback, pageNavigationState, isFoodDrinkPath, createPageFreshness, isAppDataMutation } from "./page-navigation.ts";

test("direct entry returns to the closest functional page", () => {
  for (const [path, expected] of [
    ["/", "/"], ["/tasks", "/"], ["/settings", "/"],
    ["/settings/notifications", "/settings"], ["/food/places/123", "/food/places"],
    ["/projects/1/items/2", "/projects/1"], ["/media/series/1", "/media"],
  ]) assert.equal(pageBackFallback(path), expected);
});

test("plain navigation reuses pages; writes invalidate only previously visited pages", () => {
  const freshness = createPageFreshness();
  assert.equal(freshness.visit("/"), false);
  assert.equal(freshness.visit("/health"), false);
  assert.equal(freshness.visit("/"), false);
  freshness.invalidate();
  assert.equal(freshness.visit("/health?view=weight"), false);
  assert.equal(freshness.visit("/"), true);
  assert.equal(freshness.visit("/"), false);
  assert.equal(freshness.visit("/health"), true);
});

test("mutation tracking excludes reads, external requests and ordinary navigation", () => {
  const origin = "https://evaorbit.example";
  assert.equal(isAppDataMutation("/api/health/weight", { method: "POST" }, origin), true);
  assert.equal(isAppDataMutation(new Request(`${origin}/api/tasks/2`, { method: "PATCH" }), undefined, origin), true);
  assert.equal(isAppDataMutation("/tasks", { method: "POST", headers: { "next-action": "test" } }, origin), true);
  assert.equal(isAppDataMutation("/api/health/weight", undefined, origin), false);
  assert.equal(isAppDataMutation("/health", { method: "POST" }, origin), false);
  assert.equal(isAppDataMutation("https://other.example/api/tasks", { method: "DELETE" }, origin), false);
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

test("direct Health topic and legacy editor links return to the overview", () => {
  for (const view of ["sleep", "weight", "training", "energy", "cycle", "records"]) {
    assert.equal(pageBackFallback("/health", `?view=${view}`), "/health");
  }
  for (const search of ["?weight=12", "?training=4", "?view=overview&weight=2"]) {
    assert.equal(pageBackFallback("/health", search), "/health");
  }
  for (const search of ["", "?view=overview", "?view=unknown", "?weight=0", "?training=abc"]) {
    assert.equal(pageBackFallback("/health", search), "/");
  }
  assert.equal(pageBackFallback("/health/records"), "/health");
  assert.equal(pageBackFallback("/health/records/4"), "/health/records");
});

 test("Food and Drink child pages share one navigation parent", () => {
  for (const path of ["/food-drink", "/food", "/drinks", "/food/places/2", "/food/library", "/drinks/history"]) assert.equal(isFoodDrinkPath(path), true);
  for (const path of ["/foodie", "/cats/food", "/drinks-old"]) assert.equal(isFoodDrinkPath(path), false);
  for (const path of ["/food", "/drinks", "/drinks/history", "/food/places", "/food/library"]) assert.equal(pageBackFallback(path), "/food-drink");
});
