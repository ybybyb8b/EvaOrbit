import assert from "node:assert/strict";
import test from "node:test";
import { HOME_MODULE_IDS, normalizeHomeModuleOrder } from "./home-modules.ts";

test("normalizes a partial home module order without losing new modules", () => {
  const result = normalizeHomeModuleOrder(["cats", "food", "cats", "unknown"]);
  assert.deepEqual(result.slice(0, 2), ["cats", "food"]);
  assert.equal(result.length, HOME_MODULE_IDS.length);
  assert.deepEqual(new Set(result), new Set(HOME_MODULE_IDS));
});
