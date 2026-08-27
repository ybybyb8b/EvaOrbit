import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedTools = [
  "food_search_recent",
  "food_create",
  "food_update",
  "food_delete",
  "drink_search_recent",
  "drink_create",
  "drink_update",
  "drink_delete",
  "nutrition_get_daily_summary",
  "tracker_list",
  "tracker_create_entry",
];

test("MCP tools/list exposes only the documented tools", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  const registered = [...source.matchAll(/server\.registerTool\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered, expectedTools);
});
