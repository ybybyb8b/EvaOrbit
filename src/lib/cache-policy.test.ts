import assert from "node:assert/strict";
import test from "node:test";
import { affectsData, cacheReadPolicy, dataDomain } from "./cache-policy.ts";

test("cache policies keep private settings, streaming and device truth out of the page cache", () => {
  for (const path of ["/api/native/session", "/api/ai/chat", "/api/ai/settings", "/api/ai/providers", "/api/preferences/appearance", "/api/data-backup/export", "/api/notifications", "/api/media/2/cover"]) assert.equal(cacheReadPolicy(path), null, path);
  for (const path of ["/api/food/logs?date=2026-10-16", "/api/tasks?status=all", "/api/projects/2", "/api/ai/sessions/3/messages"]) assert.ok(cacheReadPolicy(path), path);
  assert.equal(dataDomain("/api/project-items/7"), "projects");
  assert.equal(affectsData("/projects/2", ["food"]), false);
  for (const path of ["/", "/food", "/food-drink", "/health?view=energy"]) assert.equal(affectsData(path, ["food"]), true);
  assert.equal(affectsData("/food", ["calendar"]), true);
  assert.equal(affectsData("/memo/2", ["memory"]), true);
});
