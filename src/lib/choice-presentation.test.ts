import assert from "node:assert/strict";
import test from "node:test";
import { usesCapsules } from "./choice-presentation.ts";

test("fixed choices switch at five entries; searchable resources always keep their search control", () => {
  for (const count of [1, 4, 5]) assert.equal(usesCapsules(count), true);
  for (const count of [0, 6, 20]) assert.equal(usesCapsules(count), false);
  for (const count of [1, 5, 6]) assert.equal(usesCapsules(count, true), false);
});
